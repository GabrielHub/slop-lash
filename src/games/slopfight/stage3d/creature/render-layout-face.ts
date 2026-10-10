// Face placement and paint clearance on an already shaped bone and its ancestors.

import { cross, dot, lerp, madd, normalize, scale, sub, type Vec3 } from "../../body/vec";
import type { Skeleton } from "../../body/skeleton";
import type { LayoutInput, LayoutFace, LayoutFaceInput, RenderBone, RenderLayout } from "./render-layout-types";
import { marchSurface, preparePrims, type RenderPrim, type SdfBone } from "./sdf";
import { SNOUT_EYE, EYE_FACING, EYE_SHRINK_FLOOR, STD_EYE_X, STD_EYE_Y, STD_MOUTH_Y, DECAL_TOP, DECAL_BOTTOM, DECAL_HALF, PAINT_GAP, MUZZLE_TOP, BOX_EYE_LINE, PAINT_ROOM, PAINT_SHRINK, EYE_ANGLE_MAX, BOX_EYE_SPREAD, FACE_PAINT } from "./render-layout-tuning";
import { clampN, boxFrame } from "./render-layout-geometry";

/** The base eye radius: big enough to read from a couch, small enough that a pair stays on the head. */
export function eyeRadius(faceScale: number, height: number, snout = false): number {
  const r = Math.max(faceScale, 0.02);
  const H = Math.max(height, 0.05);
  const E = Math.min(Math.max(0.3 * r, 0.068 * H), 0.45 * r);
  return snout ? Math.min(E, SNOUT_EYE * r) : E;
}

/**
 * Faces for every head chain end besides Skeleton.head, so a two-headed beast
 * looks both ways. A head on the back faces up and back (so it reads over the
 * body from the front); others face forward, turned a little toward their side.
 */
export function extraFaces(skeleton: Skeleton): LayoutFaceInput[] {
  const byId = new Map(skeleton.bones.map((b) => [b.id, b]));
  const headParents = new Set<string>();
  for (const b of skeleton.bones) if (b.role === "head" && b.parent) headParents.add(b.parent);
  const out: LayoutFaceInput[] = [];
  for (const b of skeleton.bones) {
    if (b.role !== "head" || b.id === skeleton.head || headParents.has(b.id)) continue;
    const parent = b.parent ? byId.get(b.parent) : undefined;
    if (!parent) continue;
    const away = sub(lerp(b.head, b.tail, 0.5), lerp(parent.head, parent.tail, 0.5));
    const l = Math.hypot(away[0], away[2]);
    let normal: Vec3 = normalize([0, 0.25, 1]);
    if (l > 1e-6) {
      const u: Vec3 = [away[0] / l, 0, away[2] / l];
      if (u[2] < -0.5) {
        normal = normalize([u[0] * 0.7, 0.7, u[2] * 0.7]);
      } else {
        const dir = normalize(madd([0, 0, 1], u, 0.6));
        normal = normalize([dir[0], 0.25, dir[2]]);
      }
    }
    out.push({ bone: b.id, normal, scale: b.radius });
  }
  return out;
}

/** A decal position on the face: the surface point, its normal, and the ray it was found along. */
export interface FaceSpot {
  point: Vec3;
  normal: Vec3;
  dir: Vec3;
}

type FaceFrame = Pick<LayoutFace, "centre" | "normal" | "tangent" | "up" | "scale" | "box">;

/**
 * Where a decal at (x, y) eye radii lands on the face (the same march face.ts
 * makes for the eyes and mouth). A box face is flat: offset across it and shoot
 * straight out, never round a corner. A round face: an angle round it, the
 * spread compressed so a wide pair (or a cluster) stays on the front.
 */
export function faceSpot(
  frame: FaceFrame,
  sdf: readonly SdfBone[],
  faceBone: Pick<RenderBone, "radius" | "half">,
  x: number,
  y: number,
  eye: number,
  lift: number,
): FaceSpot {
  const r = frame.scale;
  if (frame.box) {
    const half = faceBone.radius * BOX_EYE_SPREAD;
    const ex = clampN(x * eye, -half, half);
    const from = madd(madd(frame.centre, frame.tangent, ex), frame.up, y * eye + lift);
    const hit = marchSurface(sdf, from, frame.normal, r * 3 + faceBone.half * 2);
    return { point: hit.point, normal: hit.normal, dir: frame.normal };
  }
  const ax = EYE_ANGLE_MAX * Math.tanh((x * eye) / r / EYE_ANGLE_MAX);
  const ay = clampN((y * eye + lift) / r, -1.1, 1.1);
  const dir = normalize(madd(madd(frame.normal, frame.tangent, Math.tan(ax)), frame.up, Math.tan(ay)));
  const hit = marchSurface(sdf, frame.centre, dir, r * 3);
  return { point: hit.point, normal: hit.normal, dir };
}

/** The face bone and its ancestors, prepared for marching (snouts, beaks and horns in front never catch the eyes). */
export function facePrims(layout: RenderLayout, margin: number, includeSnout = false): SdfBone[] {
  const face = layout.face;
  if (!face) return [];
  const chain = includeSnout && face.snoutBone !== null ? [...face.chain, face.snoutBone] : face.chain;
  return chainSdf(layout.prims, chain, margin);
}

export function chainSdf(prims: readonly RenderPrim[], chain: readonly number[], margin: number): SdfBone[] {
  const set = new Set(chain);
  return preparePrims(
    prims.filter((prim) => set.has(prim.bone)),
    margin,
  );
}

  /** The face, laid out as soon as the face bone (and so its whole chain) is drawn. */
export function buildLayoutFace({ input, faceIndex, out, prims, parent, children, height }: {
  input: LayoutInput;
  faceIndex: number;
  out: readonly RenderBone[];
  prims: readonly RenderPrim[];
  parent: readonly number[];
  children: readonly number[][];
  height: number;
}): LayoutFace | null {
    const bones = input.bones;
    const parts = new Map((input.parts ?? []).map((part) => [part.id, part]));
    const anchorOf = (i: number) => parts.get(bones[i]!.partId)?.anchor ?? null;
    const markOf = new Map((input.markings ?? []).map((m) => [m.part, m.kind]));
    const spec = input.face;
    if (!spec || faceIndex < 0) return null;
    const fi = faceIndex;
    const bone = bones[fi]!;
    const fb = out[fi]!;
    const snout = children[fi]!.some(
      (c) => anchorOf(c) === "front" && bones[c]!.role !== "item" && bones[c]!.role !== "fin",
    );
    const box = bone.shape === "box";
    const r = Math.max(spec.scale, 0.02);
    const normal = normalize(spec.normal, [0, 0, 1]);
    const tangent = normalize(cross([0, 1, 0], normal), [1, 0, 0]);
    const up = normalize(cross(normal, tangent));
    const centre = fb.centre;
    const chain: number[] = [];
    for (let id = fi; id >= 0 && !chain.includes(id); id = parent[id]!) chain.unshift(id);
    const sdf = chainSdf(prims, chain, r * 0.5);
    const frame: FaceFrame = { centre, normal, tangent, up, scale: r, box };
    const spot = (x: number, y: number, E: number, lift: number) => faceSpot(frame, sdf, fb, x, y, E, lift);
    const v = (p: Vec3) => dot(sub(p, centre), up);
    const u = (p: Vec3) => dot(sub(p, centre), tangent);

    // The front: how far up, down and across the surface still faces forward.
    const scanFront = (axis: Vec3, sign: number, facing: number): Vec3 => {
      let last = marchSurface(sdf, centre, normal, r * 3 + fb.half * 2).point;
      const steps = 20;
      const reach = box ? fb.half + fb.radius : r * 1.5;
      for (let k = 1; k <= steps; k += 1) {
        let hit: { point: Vec3; normal: Vec3 };
        if (box) {
          hit = marchSurface(sdf, madd(centre, axis, (sign * reach * k) / steps), normal, r * 3 + fb.half * 2);
        } else {
          const a = (sign * 1.5 * k) / steps;
          hit = marchSurface(sdf, centre, normalize(madd(scale(normal, Math.cos(a)), axis, Math.sin(a))), r * 3);
        }
        if (dot(hit.normal, normal) < facing) break;
        last = hit.point;
      }
      return last;
    };
    const topPoint = scanFront(up, 1, 0.5);
    const bottomPoint = scanFront(up, -1, 0.2);
    const sidePoint = scanFront(tangent, 1, 0.5);
    const front = { top: v(topPoint), bottom: v(bottomPoint), half: Math.abs(u(sidePoint)) };

    // Eyes stay on the front: shrink until every corner of the standard pair's
    // decals sits where the surface still faces forward.
    const E0 = eyeRadius(r, height, snout);
    const fits = (E: number, lift: number) => {
      for (const x of [STD_EYE_X, -STD_EYE_X]) {
        for (const dx of [DECAL_HALF, -DECAL_HALF]) {
          for (const dy of [DECAL_HALF, -DECAL_HALF]) {
            if (dot(spot(x + dx, STD_EYE_Y + dy, E, lift).normal, normal) < EYE_FACING) return false;
          }
        }
      }
      return true;
    };
    let E = E0;
    while (E > EYE_SHRINK_FLOOR * E0 && !fits(E, 0)) E *= 0.92;

    // Face-part paint (a panel, belly or suit) never sits under the eyes or
    // mouth: on a box the decal block moves up; the paint starts under the
    // mouth (a muzzle under the eyes); with too little room the eyes shrink,
    // then a box's panel moves to its sides and anything else is dropped.
    const kind = markOf.get(bone.partId);
    const facePaint = kind !== undefined && FACE_PAINT.has(kind) ? kind : null;
    const muzzle = facePaint === "belly" && bone.role === "head" && fb.sphere;
    const clipY = muzzle ? MUZZLE_TOP : DECAL_BOTTOM - PAINT_GAP;
    let lift = 0;
    let paint: LayoutFace["paint"] = "front";
    if (facePaint) {
      const plan = (eye: number) => {
        lift = 0;
        if (box) {
          // The box's extent along `up` from its centre: the eye line goes 0.45 of the way up.
          const { axis: a, u: bu, v: bv } = boxFrame(fb);
          const hh = Math.abs(dot(a, up)) * fb.half + (Math.abs(dot(bu, up)) + Math.abs(dot(bv, up))) * fb.radius;
          lift = clampN(BOX_EYE_LINE * hh - STD_EYE_Y * eye, 0, Math.max(0, front.top - (DECAL_TOP + 0.05) * eye));
        }
        return v(spot(0, clipY, eye, lift).point) - front.bottom;
      };
      const room = PAINT_ROOM * (front.top - front.bottom);
      if (plan(E) < room) {
        E *= PAINT_SHRINK;
        if (plan(E) < room) paint = box && facePaint === "panel" ? "sides" : "none";
      }
    }
    const decalTop = spot(0, DECAL_TOP, E, lift).point;
    const decalBottom = spot(0, DECAL_BOTTOM, E, lift).point;
    const left = spot(STD_EYE_X, STD_EYE_Y, E, lift).point;
    const right = spot(-STD_EYE_X, STD_EYE_Y, E, lift).point;
    const rectHalf = box ? Math.abs(u(left)) + DECAL_HALF * E : Math.abs(u(spot(STD_EYE_X + DECAL_HALF, STD_EYE_Y, E, lift).point));
    return {
      bone: fi,
      centre,
      normal,
      scale: r,
      eye: E,
      box,
      snout,
      tangent,
      up,
      eyePoint: spot(0, STD_EYE_Y, E, lift).point,
      chain,
      lift,
      decalTop,
      decalBottom,
      mouthPoint: spot(0, STD_MOUTH_Y, E, lift).point,
      eyes: [left, right],
      rect: { half: rectHalf, top: v(decalTop), bottom: v(decalBottom) },
      front,
      paint,
      paintTop: spot(0, clipY, E, lift).point,
      paintBottom: bottomPoint,
      snoutBone: null,
    };
  }
