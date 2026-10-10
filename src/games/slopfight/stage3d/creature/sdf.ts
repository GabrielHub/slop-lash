// Signed distance fields for render primitives and the smooth blend that turns
// a creature's parts into one soft body. Pure TS (no three.js), shared by the
// mesher worker, its main-thread fallback, the render layout and the face.
//
// A primitive is one SDF shape owned by a skeleton bone (render-layout.ts
// derives them; most bones own one, a bent tentacle or a kneed leg owns two).

import type { Vec3 } from "../../body/vec";

export const PRIM = {
  Sphere: 0,
  Capsule: 1,
  /** Round cone: a sphere of r0 at `head` swept to a sphere of r1 at `tail`. */
  RoundCone: 2,
  /** Capped cone: a flat disc of r0 at `head`, a flat disc of r1 at `tail`, edges rounded by `round`. */
  CappedCone: 3,
  /** Rounded box spanning the segment plus r0, cross-section 2 * r0 square, corners rounded by `round`. */
  Box: 4,
} as const;
export type PrimKind = (typeof PRIM)[keyof typeof PRIM];

/** One render primitive in creature rest space. */
export interface RenderPrim {
  /** Index of the skeleton bone that owns (and skins) this primitive. */
  bone: number;
  kind: PrimKind;
  head: Vec3;
  tail: Vec3;
  r0: number;
  r1: number;
  /** Edge rounding (capped cones and boxes). */
  round: number;
  /** < 1 squashes the primitive along `flatAxis`, > 1 stretches it (about `head`). */
  flat: number;
  flatAxis: Vec3;
  /** Blend radius used when this primitive joins the body. */
  k: number;
}

/** A primitive prepared for fast field evaluation. Plain numbers so the hot loop stays monomorphic. */
export interface SdfBone {
  /** Index in the prepared list. */
  index: number;
  /** Owning skeleton bone. */
  bone: number;
  kind: PrimKind;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  r0: number;
  r1: number;
  round: number;
  /** Unit axis head -> tail and the two cross axes (box frame). */
  axis: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  halfLen: number;
  flat: number;
  flatAxis: [number, number, number];
  k: number;
  /** Tight bounds of the primitive. */
  tmin: [number, number, number];
  tmax: [number, number, number];
  /** Influence box: the primitive's bounds grown by its blend radius and a margin. */
  min: [number, number, number];
  max: [number, number, number];
}

/** How much load-bearing parts (torso, legs) melt into the body (times the part's radius). */
export const BLEND_LOAD = 0.95;
/** Arms join with a visible shoulder (0.95 turned a buff duck into a bell). */
export const BLEND_ARM = 0.5;
/** Heads keep a visible neck pinch. */
export const BLEND_HEAD = 0.45;
/** Secondary parts stay crisp (horns, fins, ears, tails). */
export const BLEND_SECONDARY = 0.32;
/** Held items barely blend: they read as objects. */
export const BLEND_ITEM = 0.1;
/** Any join where the joining part or its parent is a box stays crisp (robot head on its body). */
export const BLEND_BOX = 0.2;
/** Box corner rounding (times the box's half width). */
export const BOX_ROUND = 0.15;
/** Capped cone edge rounding (times the base radius). */
export const CONE_ROUND = 0.06;

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.sqrt(x * x + y * y + z * z);
  return l > 1e-9 ? [x / l, y / l, z / l] : [0, 1, 0];
}

/** An orthonormal box frame: `u` the cross axis closest to world up (or forward when the axis is vertical). */
function frame(axis: [number, number, number]): { u: [number, number, number]; v: [number, number, number] } {
  const ref: [number, number, number] = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  const d = ref[0] * axis[0] + ref[1] * axis[1] + ref[2] * axis[2];
  const u = norm3(ref[0] - axis[0] * d, ref[1] - axis[1] * d, ref[2] - axis[2] * d);
  const v: [number, number, number] = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ];
  return { u, v };
}

/** Axis-aligned bounds of a primitive (before blending). */
export function primBounds(p: RenderPrim): { min: Vec3; max: Vec3 } {
  const stretch = p.flat > 1 ? p.flat : 1;
  if (p.kind === PRIM.Box) {
    const axis = norm3(p.tail[0] - p.head[0], p.tail[1] - p.head[1], p.tail[2] - p.head[2]);
    const { u, v } = frame(axis);
    const half =
      Math.sqrt((p.tail[0] - p.head[0]) ** 2 + (p.tail[1] - p.head[1]) ** 2 + (p.tail[2] - p.head[2]) ** 2) / 2 + p.r0;
    const c: Vec3 = [(p.head[0] + p.tail[0]) / 2, (p.head[1] + p.tail[1]) / 2, (p.head[2] + p.tail[2]) / 2];
    const min: Vec3 = [0, 0, 0];
    const max: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i += 1) {
      const e = (Math.abs(axis[i]!) * half + (Math.abs(u[i]!) + Math.abs(v[i]!)) * p.r0) * stretch;
      min[i] = c[i]! - e;
      max[i] = c[i]! + e;
    }
    return { min, max };
  }
  const r0 = p.r0 * stretch;
  const r1 = (p.kind === PRIM.Sphere ? p.r0 : p.r1) * stretch;
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    min[i] = Math.min(p.head[i]! - r0, p.tail[i]! - r1);
    max[i] = Math.max(p.head[i]! + r0, p.tail[i]! + r1);
  }
  return { min, max };
}

export function preparePrims(prims: readonly RenderPrim[], margin: number): SdfBone[] {
  return prims.map((p, index) => {
    let axis = norm3(p.tail[0] - p.head[0], p.tail[1] - p.head[1], p.tail[2] - p.head[2]);
    const len = Math.sqrt((p.tail[0] - p.head[0]) ** 2 + (p.tail[1] - p.head[1]) ** 2 + (p.tail[2] - p.head[2]) ** 2);
    if (len < 1e-9) axis = [0, 1, 0];
    const { u, v } = frame(axis);
    let kind = p.kind;
    if (len < 1e-6 && kind !== PRIM.Box) kind = PRIM.Sphere;
    let { r0, r1 } = p;
    let [ax, ay, az] = p.head;
    let [bx, by, bz] = p.tail;
    let round = p.round;
    if (kind === PRIM.RoundCone) {
      // A round cone needs its length to exceed the radius difference.
      if (Math.abs(r0 - r1) > 0.95 * len) r1 = r0 > r1 ? r0 - 0.95 * len : r0 + 0.95 * len;
      if (Math.abs(r1 - r0) < r0 * 0.001) kind = PRIM.Capsule;
    } else if (kind === PRIM.CappedCone) {
      // Rounded capped cone: shrink the cone by the rounding, then grow the distance back.
      round = Math.min(round, r0 * 0.9, len * 0.45);
      ax += axis[0] * round;
      ay += axis[1] * round;
      az += axis[2] * round;
      bx -= axis[0] * round;
      by -= axis[1] * round;
      bz -= axis[2] * round;
      r0 = Math.max(r0 - round, 1e-5);
      r1 = Math.max(r1 - round, 1e-5);
    } else if (kind === PRIM.Box) {
      round = Math.min(round, r0 * 0.9);
    }
    const flatAxis: [number, number, number] =
      p.flat !== 1 ? norm3(p.flatAxis[0], p.flatAxis[1], p.flatAxis[2]) : [0, 1, 0];
    const b = primBounds(p);
    const grow = p.k + margin;
    return {
      index,
      bone: p.bone,
      kind,
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      r0,
      r1,
      round,
      axis,
      u,
      v,
      halfLen: len / 2,
      flat: p.flat,
      flatAxis,
      k: p.k,
      tmin: [b.min[0], b.min[1], b.min[2]],
      tmax: [b.max[0], b.max[1], b.max[2]],
      min: [b.min[0] - grow, b.min[1] - grow, b.min[2] - grow],
      max: [b.max[0] + grow, b.max[1] + grow, b.max[2] + grow],
    };
  });
}

function roundCone(px: number, py: number, pz: number, b: SdfBone): number {
  const bax = b.bx - b.ax;
  const bay = b.by - b.ay;
  const baz = b.bz - b.az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = b.r0 - b.r1;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - b.ax;
  const pay = py - b.ay;
  const paz = pz - b.az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - b.r1;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - b.r0;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - b.r0;
}

/** Exact capped cone (flat ends), minus the rounding radius. */
function cappedCone(px: number, py: number, pz: number, b: SdfBone): number {
  const bax = b.bx - b.ax;
  const bay = b.by - b.ay;
  const baz = b.bz - b.az;
  const baba = bax * bax + bay * bay + baz * baz;
  const pax = px - b.ax;
  const pay = py - b.ay;
  const paz = pz - b.az;
  const papa = pax * pax + pay * pay + paz * paz;
  const paba = (pax * bax + pay * bay + paz * baz) / baba;
  const x = Math.sqrt(Math.max(papa - paba * paba * baba, 0));
  const ra = b.r0;
  const rb = b.r1;
  const cax = Math.max(0, x - (paba < 0.5 ? ra : rb));
  const cay = Math.abs(paba - 0.5) - 0.5;
  const rba = rb - ra;
  const kk = rba * rba + baba;
  let f = (rba * (x - ra) + paba * baba) / kk;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const cbx = x - ra - f * rba;
  const cby = paba - f;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba)) - b.round;
}

/** Signed distance from a point to one primitive (negative inside). */
export function boneDistance(px: number, py: number, pz: number, b: SdfBone): number {
  let scale = 1;
  if (b.flat !== 1) {
    // Rescale space along the axis about the head, then shrink the distance back
    // when that stretched space (conservative: the field stays 1-Lipschitz).
    const n = b.flatAxis;
    const t = (px - b.ax) * n[0] + (py - b.ay) * n[1] + (pz - b.az) * n[2];
    const s = t * (1 / b.flat - 1);
    px += n[0] * s;
    py += n[1] * s;
    pz += n[2] * s;
    scale = b.flat < 1 ? b.flat : 1;
  }
  switch (b.kind) {
    case PRIM.Sphere: {
      const dx = px - b.ax;
      const dy = py - b.ay;
      const dz = pz - b.az;
      return (Math.sqrt(dx * dx + dy * dy + dz * dz) - b.r0) * scale;
    }
    case PRIM.Capsule: {
      const pax = px - b.ax;
      const pay = py - b.ay;
      const paz = pz - b.az;
      const bax = b.bx - b.ax;
      const bay = b.by - b.ay;
      const baz = b.bz - b.az;
      let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const dx = pax - bax * h;
      const dy = pay - bay * h;
      const dz = paz - baz * h;
      return (Math.sqrt(dx * dx + dy * dy + dz * dz) - b.r0) * scale;
    }
    case PRIM.RoundCone:
      return roundCone(px, py, pz, b) * scale;
    case PRIM.CappedCone:
      return cappedCone(px, py, pz, b) * scale;
    default: {
      // Rounded box in the bone frame: cross-section 2r, length 2 * (halfLen + r).
      const cx = px - (b.ax + b.bx) / 2;
      const cy = py - (b.ay + b.by) / 2;
      const cz = pz - (b.az + b.bz) / 2;
      const round = b.round;
      const qx = Math.abs(cx * b.u[0] + cy * b.u[1] + cz * b.u[2]) - (b.r0 - round);
      const qy = Math.abs(cx * b.axis[0] + cy * b.axis[1] + cz * b.axis[2]) - (b.halfLen + b.r0 - round);
      const qz = Math.abs(cx * b.v[0] + cy * b.v[1] + cz * b.v[2]) - (b.r0 - round);
      const ox = qx > 0 ? qx : 0;
      const oy = qy > 0 ? qy : 0;
      const oz = qz > 0 ? qz : 0;
      const inside = Math.max(qx, qy, qz);
      return (Math.sqrt(ox * ox + oy * oy + oz * oz) + (inside < 0 ? inside : 0) - round) * scale;
    }
  }
}

/** Polynomial smooth minimum with blend radius k. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const diff = a - b;
  const h = k - (diff < 0 ? -diff : diff);
  if (h <= 0) return a < b ? a : b;
  const t = h / k;
  return (a < b ? a : b) - t * t * k * 0.25;
}

/** Value far outside every primitive (only the sign matters out there). */
export const FAR = 1e3;

const inBox = (b: SdfBone, x: number, y: number, z: number) =>
  x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2];

/** The blended body field at a point: primitives join in order, each with its own blend radius. */
export function fieldAt(bones: readonly SdfBone[], x: number, y: number, z: number): number {
  let acc = FAR;
  let any = false;
  for (let i = 0; i < bones.length; i += 1) {
    const b = bones[i]!;
    if (!inBox(b, x, y, z)) continue;
    const d = boneDistance(x, y, z, b);
    acc = any ? smin(acc, d, b.k) : d;
    any = true;
  }
  return acc;
}

/** A point on the blended surface along a ray from inside, and the surface normal there. */
export function marchSurface(
  bones: readonly SdfBone[],
  from: Vec3,
  dir: Vec3,
  maxDist: number,
): { point: Vec3; normal: Vec3 } {
  const at = (t: number) => fieldAt(bones, from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t);
  let t0 = 0;
  let t1 = maxDist;
  if (at(0) > 0) {
    t1 = 0;
  } else {
    const steps = 48;
    let found = false;
    for (let i = 1; i <= steps; i += 1) {
      const t = (maxDist * i) / steps;
      if (at(t) > 0) {
        t1 = t;
        t0 = (maxDist * (i - 1)) / steps;
        found = true;
        break;
      }
    }
    if (!found) t1 = maxDist;
    for (let i = 0; i < 12 && found; i += 1) {
      const mid = (t0 + t1) / 2;
      if (at(mid) > 0) t1 = mid;
      else t0 = mid;
    }
  }
  const point: Vec3 = [from[0] + dir[0] * t1, from[1] + dir[1] * t1, from[2] + dir[2] * t1];
  const e = Math.max(maxDist * 0.01, 1e-3);
  const g = (x: number, y: number, z: number) => fieldAt(bones, x, y, z);
  let normal: Vec3 = [
    g(point[0] + e, point[1], point[2]) - g(point[0] - e, point[1], point[2]),
    g(point[0], point[1] + e, point[2]) - g(point[0], point[1] - e, point[2]),
    g(point[0], point[1], point[2] + e) - g(point[0], point[1], point[2] - e),
  ];
  const l = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  normal = l > 1e-9 && Number.isFinite(l) ? [normal[0] / l, normal[1] / l, normal[2] / l] : [dir[0], dir[1], dir[2]];
  return { point, normal };
}
