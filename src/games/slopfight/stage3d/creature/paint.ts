// Vertex paint for the creature mesh: the floor shade and the painted
// markings (stripes, spots, band, belly, mask, tip, panel, suit, streak).
// Each marking is a signed distance field on one bone (negative inside the
// paint), built in that bone's render frame (render-layout.ts) so it stays put
// on the part as it animates and lands where the decals do. The mesher labels
// every vertex inside or out and splits triangles along the zero crossing, so
// the edges are crisp. Paint on the part that carries the face never covers
// the eyes or the mouth. Pure TS (no three.js).

import { cross, dot, normalize, sub, type Vec3 } from "../../body/vec";
import type { MarkingKind } from "../../vocab";
import type { LayoutFace, RenderBone } from "./render-layout";

export type Rgb = [number, number, number];

/** Linear sRGB to OKLab. */
export function oklab(c: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabDistance(a: Rgb, b: Rgb): number {
  const p = oklab(a);
  const q = oklab(b);
  return Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
}

/** Below this OKLab distance the primary may fade into the secondary at the feet (tangerine to butter). */
export const CLOSE_COLORS = 0.15;
/** Otherwise the primary only darkens toward its own outline colour, at most this much. */
export const FLOOR_SHADE = 0.18;

/** 0 at the creature's mid height and above, rising smoothly to 1 at the floor. */
export function floorWeight(y: number, height: number): number {
  const t = Math.min(1, Math.max(0, y / height));
  const s = 1 - t / 0.62;
  return s > 0 ? s * s * (3 - 2 * s) : 0;
}

/** What a marking field needs besides its bone. */
export interface PaintContext {
  /** The face, only when this bone carries it. */
  face: LayoutFace | null;
  /** The mesh's grid cell (spots never shrink below two). */
  cell: number;
  /** A stable per-bone seed (spot placement). */
  seed: number;
  /** The torso's render radius (big parts get many small spots, limbs a few big ones). */
  torsoRadius: number;
  /** March from `from` along `dir` onto this bone's rendered surface. */
  surface: (from: Vec3, dir: Vec3) => Vec3;
}

/** Signed distance (world units, negative inside the paint) at a surface point with its unit normal. */
export type MarkingField = (p: Vec3, n: Vec3) => number;

interface Frame {
  /** Along the part. */
  a: Vec3;
  /** Front (or, on a level part, down). */
  f: Vec3;
  /** a x f. */
  s: Vec3;
}

function frameOf(bone: RenderBone): Frame {
  const a = bone.axis;
  const front0: Vec3 = bone.level ? [0, -1, 0] : [0, 0, 1];
  let f = sub(front0, [a[0] * dot(front0, a), a[1] * dot(front0, a), a[2] * dot(front0, a)]);
  f = normalize(f, normalize(cross(a, [1, 0, 0]), [0, 0, 1]));
  return { a, f, s: cross(a, f) };
}

function roundRect(u: number, v: number, hu: number, hv: number, rr: number): number {
  const qx = Math.abs(u) - hu + rr;
  const qy = Math.abs(v) - hv + rr;
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - rr;
}

/** An ellipse's signed distance, close enough near its edge. */
const ellipse = (u: number, v: number, au: number, av: number) =>
  (Math.sqrt((u / au) ** 2 + (v / av) ** 2) - 1) * Math.min(au, av);

/** Small seeded PRNG (mulberry32), 0..1. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Big parts carry many small spots, limbs a few big ones. */
const SPOTS_BIG = { min: 9, spread: 3, size: 0.17 };
const SPOTS_LIMB = { min: 3, spread: 2, size: 0.25 };
/** Spots keep this many of their radii of bare skin between them. */
const SPOT_GAP = 1.6;
/** Paint keeps this many eye radii clear round the face's decals. */
const FACE_CLEAR = 0.3;
/** Paint on the face part only where the surface faces the front this much counts as "on the face". */
const FACE_FRONT = 0.25;
/** A mask stops where the surface turns this far from the face. */
const MASK_FRONT = 0.15;
/** Eye patches: ovals of these semi-axes (eye radii, times the eye decal's half size), hanging a little outward and down. */
const PATCH = { along: 1.35, across: 1.15, scale: 1.4, out: 0.2, down: 0.25, tilt: (15 * Math.PI) / 180 };
const STREAK_HALF = 0.26;

/**
 * The paint field of one marking on one bone, or null when it paints nothing
 * (face paint with no room left beside the face).
 */
export function markingField(kind: MarkingKind, bone: RenderBone, ctx: PaintContext): MarkingField | null {
  const { a, f, s } = frameOf(bone);
  const c = bone.centre;
  const h = Math.max(bone.half, 1e-4);
  const r = Math.max(bone.radius, 1e-4);
  const lf = ctx.face;
  const local = (p: Vec3) => {
    const d = sub(p, c);
    return { d, ya: dot(d, a), zf: dot(d, f), xs: dot(d, s) };
  };

  // On the face part: keep the decal block (plus a margin) bare on the front.
  let clear: ((p: Vec3, n: Vec3) => number) | null = null;
  let faceV: ((p: Vec3) => number) | null = null;
  let faceU: ((p: Vec3) => number) | null = null;
  if (lf) {
    const m = FACE_CLEAR * lf.eye;
    const half = lf.rect.half + m;
    const top = lf.rect.top + m;
    const bottom = lf.rect.bottom - m;
    const mid = (top + bottom) / 2;
    const hv = (top - bottom) / 2;
    faceV = (p) => dot(sub(p, lf.centre), lf.up);
    faceU = (p) => dot(sub(p, lf.centre), lf.tangent);
    // Rounded almost to a stadium, so the bare patch reads as a face, not a cut-out.
    const round = 0.8 * Math.min(half, hv);
    clear = (p, n) => {
      if (dot(n, lf.normal) < FACE_FRONT) return -r;
      return -roundRect(faceU!(p), faceV!(p) - mid, half, hv, round);
    };
  }
  const withFace = (field: MarkingField): MarkingField =>
    clear ? (p, n) => Math.max(field(p, n), clear!(p, n)) : field;

  switch (kind) {
    case "stripes": {
      const n = Math.max(3, Math.min(5, Math.round((2 * h) / (1.15 * r))));
      const seg = (2 * h) / (2 * n + 1);
      return withFace((p) => {
        const u = (local(p).ya + h) / seg;
        const i = Math.floor(u);
        const edge = Math.min(u - i, 1 - (u - i)) * seg;
        const painted = i % 2 === 1 && i > 0 && i < 2 * n + 1;
        return painted ? -edge : edge;
      });
    }
    case "band":
      // Bands and tips run behind the decals like the part's own colour.
      return (p) => Math.abs(local(p).ya) - 0.22 * h;
    case "tip": {
      if (bone.sphere) {
        return (p) => {
          const d = sub(p, c);
          const len = Math.sqrt(dot(d, d)) || 1;
          return (0.82 - dot(d, bone.away) / len) * r;
        };
      }
      const from = bone.root ? 0.88 : 0.86;
      return (p) => (from - (local(p).ya + h) / (2 * h)) * 2 * h;
    }
    case "mask": {
      if (lf) {
        const E = lf.eye;
        const centreU = (lf.eyes[0] && faceU!(lf.eyes[0])) || 0;
        const span = Math.abs(centreU) + 0.2 * E;
        const tilt = PATCH.tilt;
        const patches = lf.eyes.map((spot) => {
          const side = Math.sign(faceU!(spot)) || 1;
          const eye: Vec3 = [
            spot[0] + (lf.tangent[0] * side * PATCH.out - lf.up[0] * PATCH.down) * E,
            spot[1] + (lf.tangent[1] * side * PATCH.out - lf.up[1] * PATCH.down) * E,
            spot[2] + (lf.tangent[2] * side * PATCH.out - lf.up[2] * PATCH.down) * E,
          ];
          const e1: Vec3 = normalize([
            lf.tangent[0] * side * Math.cos(tilt) - lf.up[0] * Math.sin(tilt),
            lf.tangent[1] * side * Math.cos(tilt) - lf.up[1] * Math.sin(tilt),
            lf.tangent[2] * side * Math.cos(tilt) - lf.up[2] * Math.sin(tilt),
          ]);
          const e2: Vec3 = normalize([
            lf.up[0] * Math.cos(tilt) + lf.tangent[0] * side * Math.sin(tilt),
            lf.up[1] * Math.cos(tilt) + lf.tangent[1] * side * Math.sin(tilt),
            lf.up[2] * Math.cos(tilt) + lf.tangent[2] * side * Math.sin(tilt),
          ]);
          return { eye, e1, e2 };
        });
        return (p, n) => {
          let best = Infinity;
          for (const { eye, e1, e2 } of patches) {
            const q = sub(p, eye);
            best = Math.min(best, ellipse(dot(q, e1), dot(q, e2), PATCH.along * PATCH.scale * E, PATCH.across * PATCH.scale * E));
          }
          // A bridge across the nose between the patches.
          const v = dot(sub(p, lf.eyePoint), lf.up);
          best = Math.min(best, Math.max(Math.abs(v) - 0.3 * E, Math.abs(faceU!(p)) - span));
          return Math.max(best, (MASK_FRONT - dot(n, lf.normal)) * r);
        };
      }
      return (p) => Math.abs(local(p).ya - 0.25 * h) - 0.22 * h;
    }
    case "belly":
    case "panel":
      return faceAware(kind);
    case "suit":
      return suit();
    case "streak":
      return streak();
    case "spots":
      return spots();
    default:
      return null;
  }

  function faceAware(k: "belly" | "panel"): MarkingField | null {
    if (lf && lf.paint === "none") return null;
    if (lf && lf.paint === "sides" && k === "panel") {
      // Windows down both sides of a box that carries the face.
      return withFace((p) => {
        const u = faceU!(p);
        const v = faceV!(p);
        const w = dot(sub(p, lf.centre), lf.normal);
        return Math.max(roundRect(w, v, 0.6 * r, Math.min(0.5 * h, 0.6 * r), 0.18 * r), 0.7 * r - Math.abs(u));
      });
    }
    if (lf && !bone.level) {
      const vTop = faceV!(lf.paintTop);
      const vBot = faceV!(lf.paintBottom);
      if (k === "belly" && bone.sphere && !bone.root) {
        // A head's belly is its muzzle and chin, kept under the eyes.
        return withFace((p) => {
          const { ya, zf, xs } = local(p);
          const e = ellipse(xs, ya + 0.32 * h, 0.56 * r, 0.46 * h);
          return Math.max(e, 0.15 * r - zf, faceV!(p) - vTop);
        });
      }
      // Refit into the front under the mouth.
      const mid = (vTop + vBot) / 2;
      const hv = Math.max((vTop - vBot) / 2, 1e-4);
      return withFace((p, n) => {
        const u = faceU!(p);
        const v = faceV!(p) - mid;
        const front = (0.1 - dot(n, lf.normal)) * r;
        const sd = k === "belly" ? ellipse(u, v, 0.62 * r, hv) : roundRect(u, v, 0.56 * r, 0.94 * hv, 0.2 * r);
        return Math.max(sd, front, faceV!(p) - vTop);
      });
    }
    if (k === "belly") {
      if (bone.level) {
        // The underside of a level body.
        return withFace((p) => {
          const { ya, zf, xs } = local(p);
          const e = ellipse(xs, ya, 0.62 * r, 0.8 * h);
          return Math.max(e, 0.05 * r - zf);
        });
      }
      return withFace((p) => {
        const { ya, zf, xs } = local(p);
        return Math.max(ellipse(xs, ya + 0.12 * h, 0.62 * r, 0.72 * h), 0.08 * r - zf);
      });
    }
    if (bone.level) {
      // Windows and doors down both sides of a level body.
      return withFace((p) => {
        const { ya, zf, xs } = local(p);
        return Math.max(roundRect(ya, zf + 0.12 * r, 0.6 * h, 0.42 * r, 0.18 * r), 0.25 * r - Math.abs(xs));
      });
    }
    return withFace((p) => {
      const { ya, zf, xs } = local(p);
      return Math.max(roundRect(xs, ya + 0.05 * h, 0.56 * r, 0.5 * h, 0.2 * r), 0.1 * r - zf);
    });
  }

  /**
   * A jacket: paint everywhere but a V opening on the chest (the shirt, in the
   * part's own colour), with a tie down the middle. On a level torso the V is
   * on its front end; on the face part, the jacket stays under the mouth.
   */
  function suit(): MarkingField | null {
    if (lf && lf.paint === "none") return null;
    const torsoLike = bone.root || bone.radius >= 0.6 * ctx.torsoRadius;
    if (!torsoLike && !lf) return () => -r;
    // (lateral, t up the chest 0..1, front-ness) at a point.
    let coords: (p: Vec3, n: Vec3) => { x: number; t: number; front: number; span: number };
    if (lf && !bone.level) {
      const vTop = faceV!(lf.paintTop);
      const vBot = faceV!(lf.paintBottom);
      const span = Math.max(vTop - vBot, 1e-4);
      coords = (p, n) => ({
        x: faceU!(p),
        t: (faceV!(p) - vBot) / span,
        front: dot(n, lf.normal) - 0.1,
        span,
      });
    } else if (bone.level) {
      // The chest is the level body's front end: up its cap, across it.
      const sign = a[2] >= 0 ? 1 : -1;
      coords = (p) => {
        const { ya, zf, xs } = local(p);
        return { x: xs, t: (-zf + r) / (2 * r), front: (sign * ya - (h - 1.1 * r)) / r, span: 2 * r };
      };
    } else {
      coords = (p) => {
        const { ya, zf, xs } = local(p);
        return { x: xs, t: (ya + h) / (2 * h), front: zf / r - 0.1, span: 2 * h };
      };
    }
    // The V: from its apex at t 0.45 widening to 0.42 r either side at t 0.95.
    const slope = 0.42 / 0.5;
    const field: MarkingField = (p, n) => {
      const { x, t, front, span } = coords(p, n);
      const w = slope * r * (t - 0.45);
      const ax = Math.abs(x);
      const vSd = Math.max((ax - w) / Math.sqrt(1 + ((slope * r) / span) ** 2), -front * r);
      // The tie, inside the V: a narrow knot at t 0.9 widening to 0.13 r at t 0.62, a point at t 0.5.
      const tw = t >= 0.62 ? 0.06 * r + ((0.9 - t) / 0.28) * 0.07 * r : ((t - 0.5) / 0.12) * 0.13 * r;
      const tie = Math.max(ax - tw, (0.5 - t) * span, (t - 0.9) * span, -front * r);
      const jacket = Math.min(-vSd, tie);
      if (lf && !bone.level && dot(n, lf.normal) > 0) return Math.max(jacket, faceV!(p) - faceV!(lf.paintTop));
      return jacket;
    };
    return withFace(field);
  }

  /** One stripe along the part's top (a level part) or back, or a face head's crown from the brows back. */
  function streak(): MarkingField {
    const half = STREAK_HALF * r;
    if (lf && !lf.box && bone.sphere) {
      const top = dot(sub(lf.decalTop, lf.centre), lf.up);
      const fwd = dot(sub(lf.decalTop, lf.centre), lf.normal);
      const start = Math.atan2(top, fwd) + (FACE_CLEAR * lf.eye) / r;
      const end = 1.3 * Math.PI;
      return withFace((p) => {
        const q = sub(p, lf.centre);
        let psi = Math.atan2(dot(q, lf.up), dot(q, lf.normal));
        if (psi < -0.5 * Math.PI) psi += 2 * Math.PI;
        return Math.max(Math.abs(dot(q, lf.tangent)) - half, (start - psi) * r, (psi - end) * r);
      });
    }
    if (bone.sphere) {
      // Front to back over the top.
      return withFace((p) => {
        const d = sub(p, c);
        return Math.max(Math.abs(d[0]) - half, -d[1]);
      });
    }
    // A level part's top (f is down), an upright torso's back (f is front),
    // and on any other part the side facing up (a raised tail's top, seen from the front).
    const side = !bone.level && !bone.root && f[1] > 1e-6 ? -1 : 1;
    return withFace((p) => {
      const { ya, zf, xs } = local(p);
      const t = (ya + h) / (2 * h);
      return Math.max(Math.abs(xs) - half, side * zf, (0.04 - t) * 2 * h, (t - 0.98) * 2 * h);
    });
  }

  /** Seeded spots on the surface, kept apart and off the face. */
  function spots(): MarkingField {
    const big = bone.radius >= 0.6 * ctx.torsoRadius;
    const plan = big ? SPOTS_BIG : SPOTS_LIMB;
    const rand = prng(ctx.seed);
    const count = plan.min + Math.floor(rand() * plan.spread);
    const rho = Math.max(plan.size * r, 2 * ctx.cell);
    const minGap = (2 + SPOT_GAP) * rho;
    const centres: Vec3[] = [];
    const segment = !bone.sphere && h > r * 1.05;
    for (let tries = 0; tries < 160 && centres.length < count; tries += 1) {
      let from: Vec3;
      let dir: Vec3;
      if (segment) {
        const t = (rand() * 2 - 1) * (h - r * 0.6);
        const ang = rand() * Math.PI * 2;
        from = [c[0] + a[0] * t, c[1] + a[1] * t, c[2] + a[2] * t];
        dir = [
          s[0] * Math.sin(ang) + f[0] * Math.cos(ang),
          s[1] * Math.sin(ang) + f[1] * Math.cos(ang),
          s[2] * Math.sin(ang) + f[2] * Math.cos(ang),
        ];
      } else {
        const z = rand() * 2 - 1;
        const ang = rand() * Math.PI * 2;
        const rr = Math.sqrt(Math.max(0, 1 - z * z));
        from = c;
        dir = [rr * Math.cos(ang), z, rr * Math.sin(ang)];
      }
      const q = ctx.surface(from, dir);
      // A spot's edge keeps at least its radius from the bare face patch, and
      // none sits on the chin under it (one there reads as a second mouth).
      if (clear && clear(q, dir) > -2 * rho) continue;
      if (lf && dot(dir, lf.normal) > 0.3 && Math.abs(faceU!(q)) < lf.rect.half && faceV!(q) < lf.rect.top) continue;
      if (centres.some((o) => dot(sub(o, q), sub(o, q)) < minGap * minGap)) continue;
      centres.push(q);
    }
    return withFace((p) => {
      let best = Infinity;
      for (const o of centres) {
        const dx = p[0] - o[0];
        const dy = p[1] - o[1];
        const dz = p[2] - o[2];
        best = Math.min(best, dx * dx + dy * dy + dz * dz);
      }
      return Math.sqrt(best) - rho;
    });
  }
}
