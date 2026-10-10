// Lay out parent bones before their children, then build each bone's SDF primitives.
// The skeleton remains untouched; the simulation and animation share its rest pose.
// Face placement, geometry operations and tuning live beside this orchestration.

import { CONE_TIP_RATIO, boneBounds, boneLength } from "../../body/skeleton";
import { add, cross, dot, lerp, madd, normalize, scale, sub, type Vec3 } from "../../body/vec";
import type { Anchor } from "../../vocab";
import { BLEND_ARM, BLEND_BOX, BLEND_HEAD, BLEND_ITEM, BLEND_LOAD, BLEND_SECONDARY, BOX_ROUND, CONE_ROUND, PRIM, fieldAt, marchSurface, preparePrims, primBounds, type RenderPrim } from "./sdf";
import type { LayoutInput, RenderLayout, RenderBone, LayoutFace } from "./render-layout-types";
import { buildLayoutFace, chainSdf, eyeRadius, faceSpot } from "./render-layout-face";
import { WING_CHORD, WING_TIP, WING_MAX_LENGTH, WING_ROOT, WING_ROOT_RADIUS, FLATTEN, FAN_FLATTEN, CROWDED_LEG_BLEND, SPHERE_STUBBY, SPHERE_LONG, TAIL_TIP, WAVE_AT, WAVE_ANGLE, CURL_START, CURL_ANGLE, TENTACLE_CONE, TENTACLE_CONE_TIP, FAN_RING, FAN_SIDE, FAN_TILT_RING, FAN_TILT_SIDE, ARM_GAP, ARM_GAP_AT, ARM_SPLAY_STEP, ARM_SPLAY_MAX, SLITHER_FIRST, SLITHER_TURN, PLATE_ANGLE, PLATE_BOX_OFFSET, ADD_ON_SCALE, THIN_LIMB, THIN_LIMB_S, THIN_NECK, THIN_TAIL, THIN_FLOOR_CELLS, FINAL_CELLS, PROTRUDE_SPHERE, PROTRUDE_SEGMENT, PROTRUDE_ROLES, LEG_SHOW_STUBBY, LEG_SHOW_NORMAL, LEG_SHOW_LONG, LEG_LIFT_MAX, SPHERE_LEG_ATTACH, BOX_OVERHANG_HIDE, TAIL_RISE_LEVEL, TAIL_RISE_UPRIGHT, TAIL_CURL_AT, TAIL_CURL, PLUME_MID, PLUME_TIP, SPHERE_TAIL_RISE, TAIL_RISE_STEP, TAIL_SHOW, SLIDE_MIN, SLIDE_MAX, SNOUT_DROP, MUZZLE_REACH, MUZZLE_TIP, MUZZLE_BLEND, MUZZLE_MIN, BEAK_LENGTH, MUZZLE_DOWN, BEAK_DOWN, TONGUE_DOWN, TONGUE_THIN, STD_EYE_Y, LIMB_LIKE, AXIS, SLIDE_DEFAULT, UP } from "./render-layout-tuning";
import { type Mat3, I3, mulMV, mulMM, rotationAbout, rotationBetween, tilt, perp, clampN, flatAxisOf, sinkOf, boxFrame } from "./render-layout-geometry";

export type { LayoutPart, LayoutMarking, LayoutFaceInput, LayoutInput, RenderBone, LayoutFace, RenderLayout } from "./render-layout-types";
export { WING_CHORD, WING_MAX_LENGTH, EYE_ANGLE_MAX, BOX_EYE_SPREAD } from "./render-layout-tuning";
export { eyeRadius, extraFaces, faceSpot, facePrims, type FaceSpot } from "./render-layout-face";

interface FanSlot {
  head: Vec3;
  dir: Vec3;
}

export function renderLayout(input: LayoutInput): RenderLayout {
  const bones = input.bones;
  const n = bones.length;
  let height = 0;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const bone of bones) {
    const b = boneBounds(bone);
    height = Math.max(height, b.max[1]);
    for (let k = 0; k < 3; k += 1) {
      lo[k] = Math.min(lo[k]!, b.min[k]!);
      hi[k] = Math.max(hi[k]!, b.max[k]!);
    }
  }
  height = Math.max(height, 0.05);
  if (n === 0) return { prims: [], bones: [], face: null, height };
  const longest = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.05);
  const thinFloor = (THIN_FLOOR_CELLS * longest) / FINAL_CELLS;

  const index = new Map(bones.map((bone, i) => [bone.id, i]));
  const parent = bones.map((bone) => (bone.parent === null ? -1 : (index.get(bone.parent) ?? -1)));
  const children: number[][] = bones.map(() => []);
  parent.forEach((p, i) => {
    if (p >= 0) children[p]!.push(i);
  });
  const partById = new Map((input.parts ?? []).map((part) => [part.id, part]));
  const partOf = (i: number) => partById.get(bones[i]!.partId);
  const anchorOf = (i: number): Anchor | null => partOf(i)?.anchor ?? null;
  const twins = new Map<string, number>();
  for (const bone of bones) twins.set(bone.partId, (twins.get(bone.partId) ?? 0) + 1);
  const paired = (i: number) => (twins.get(bones[i]!.partId) ?? 0) > 1;
  const plan = input.bodyPlan;
  // An absent body plan was inferred by the resolver, which calls anything winged a flier.
  const flier = plan === undefined || plan === "FLIER";
  const skip = new Set(input.skip ?? []);
  const faceIndex = input.face ? (index.get(input.face.bone) ?? -1) : -1;
  const isRootChild = (i: number) => parent[i]! >= 0 && parent[parent[i]!]! < 0;
  const onBody = (i: number) => {
    const p = parent[i]!;
    return p >= 0 && (parent[p]! < 0 || bones[p]!.role === "head");
  };
  // A slitherer's tail chain off the torso's back: depth along it (0 = not in it).
  const spineDepth = bones.map(() => 0);
  if (plan === "SLITHER") {
    bones.forEach((bone, i) => {
      if (bone.role !== "tail") return;
      const p = parent[i]!;
      if (p >= 0 && bones[p]!.role === "tail") spineDepth[i] = spineDepth[p]! > 0 ? spineDepth[p]! + 1 : 0;
      else if (p >= 0 && bones[p]!.role === "torso" && anchorOf(i) === "back") spineDepth[i] = 1;
    });
  }
  const isPlate = (i: number) =>
    faceIndex >= 0 && parent[i] === faceIndex && bones[i]!.role === "fin" && anchorOf(i) === "front";
  const isSnout = (i: number) =>
    faceIndex >= 0 && parent[i] === faceIndex && bones[i]!.role === "horn" && anchorOf(i) === "front";
  /** A small cone (or small long capsule) on the face's front: a tongue. */
  const isTongue = (i: number) => {
    const part = partOf(i);
    const shape = bones[i]!.shape;
    return isSnout(i) && part?.size === "S" && (shape === "cone" || (shape === "capsule" && part.elongation === "long"));
  };
  const isLeafTail = (i: number) => bones[i]!.role === "tail" && !children[i]!.some((c) => bones[c]!.role === "tail");
  const hangsBelow = (i: number) => isLeafTail(i) && anchorOf(i) === "bottom" && bones[i]!.shape !== "sphere";
  /** Tails hanging from a part's bottom in a set of two or more; a lone one is a wisp or stinger and stays straight. */
  const isTentacle = (i: number) =>
    hangsBelow(i) && parent[i]! >= 0 && children[parent[i]!]!.filter((c) => hangsBelow(c)).length >= 2;
  /** A tail chain's first bone on the torso's back (a spiked or segmented tail rises with it). */
  const isBackTail = (i: number) =>
    bones[i]!.role === "tail" && isRootChild(i) && anchorOf(i) === "back" && plan !== "SLITHER" && spineDepth[i] === 0;
  /** Wings on the torso: on a level body they sweep back over where a risen tail would go. */
  const wingedRoot = bones.some((b, j) => b.role === "wing" && isRootChild(j));
  const isBigAddOn = (i: number) => {
    const part = partOf(i);
    const anchor = anchorOf(i);
    // Only the six surface anchors have an axis to grow along (not leg/arm slots).
    if (!part || !anchor || !AXIS[anchor] || !ADD_ON_SCALE[part.size] || !onBody(i) || paired(i) || isPlate(i)) return false;
    // A base under the torso is its footing: widening it would swallow the torso's own bottom.
    if (anchor === "bottom" && isRootChild(i)) return false;
    const role = bones[i]!.role;
    if (role === "fin") return anchor !== "front";
    return role === "horn" && bones[i]!.shape === "cone" && anchor === "top";
  };

  const legsPerSide = new Map<string, number>();
  const legRoots = new Map<number, number>();
  bones.forEach((bone, i) => {
    if (bone.role !== "leg") return;
    const key = `${bone.parent}|${bone.side}`;
    legsPerSide.set(key, (legsPerSide.get(key) ?? 0) + 1);
    const p = parent[i]!;
    if (p >= 0 && bones[p]!.role !== "leg") legRoots.set(p, (legRoots.get(p) ?? 0) + 1);
  });
  const isMultiLeg = (i: number) => {
    const p = parent[i]!;
    return (
      bones[i]!.role === "leg" &&
      p >= 0 &&
      bones[p]!.role !== "leg" &&
      (plan === "MULTIPED" || (plan === undefined && (legRoots.get(p) ?? 0) >= 5))
    );
  };

  const rot = Array.from<Mat3>({ length: n });
  const tr = Array.from<Vec3>({ length: n });
  const childShift: (((head: Vec3) => Vec3) | null)[] = bones.map(() => null);
  const out = Array.from<RenderBone>({ length: n });
  const prims: RenderPrim[] = [];
  const primsOf: RenderPrim[][] = bones.map(() => []);
  const fanSlots = new Map<number, FanSlot>();
  const renderR: number[] = bones.map((b) => b.radius);
  let face: LayoutFace | null = null;

  /** A bone's render radius: big add-ons grow with their parent, long limbs thin, tongues and tentacles slim. */
  const radiusOf = (i: number): number => {
    const bone = bones[i]!;
    const part = partOf(i);
    const p = parent[i]!;
    let r = bone.radius;
    if (p >= 0 && out[p] && isBigAddOn(i)) r = Math.max(r, ADD_ON_SCALE[part!.size]! * out[p]!.radius);
    if (part?.elongation === "long" && bone.shape !== "sphere") {
      let k = 1;
      if (bone.role === "leg" || bone.role === "arm") k = part.size === "S" ? THIN_LIMB_S : THIN_LIMB;
      else if (bone.role === "head" && bone.shape === "capsule") k = THIN_NECK;
      else if (bone.role === "tail" && !isTentacle(i)) k = THIN_TAIL;
      if (k < 1) r = Math.max(r * k, Math.min(r, thinFloor));
    }
    if (isTongue(i)) r *= TONGUE_THIN;
    if (isTentacle(i) && bone.shape === "cone") r *= TENTACLE_CONE;
    return r;
  };
  /** A sibling's size for the same-anchor rules: its render radius, widened when it is a stubby sphere. */
  const extentOf = (i: number): number => {
    const r = radiusOf(i);
    if (bones[i]!.shape !== "sphere") return r;
    const e = partOf(i)?.elongation;
    return e === "stubby" ? r * SPHERE_STUBBY.across : e === "long" ? r * SPHERE_LONG.across : r;
  };

  const blend = (i: number, r: number): number => {
    const bone = bones[i]!;
    let k: number;
    if (bone.role === "item") k = BLEND_ITEM * r;
    else if (bone.role === "head") k = BLEND_HEAD * r;
    else if (bone.role === "arm") k = BLEND_ARM * r;
    else if (bone.role === "leg" && (legsPerSide.get(`${bone.parent}|${bone.side}`) ?? 0) >= 3) {
      k = BLEND_LOAD * CROWDED_LEG_BLEND * r;
    } else if (bone.load) k = BLEND_LOAD * r;
    else k = BLEND_SECONDARY * r;
    const p = parent[i]!;
    if (bone.shape === "box" || (p >= 0 && bones[p]!.shape === "box")) k = Math.min(k, BLEND_BOX * r);
    return k;
  };

  // Same-anchor fan groups: stacked siblings with one parent, anchor and role.
  const groupOf = new Map<number, number[]>();
  {
    const groups = new Map<string, number[]>();
    bones.forEach((bone, i) => {
      const p = parent[i]!;
      const anchor = anchorOf(i);
      if (p < 0 || !anchor || !AXIS[anchor] || isPlate(i)) return;
      const key = `${p}|${anchor}|${bone.role}`;
      const list = groups.get(key) ?? [];
      list.push(i);
      groups.set(key, list);
    });
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      let stacked = false;
      for (let a = 0; a < list.length && !stacked; a += 1) {
        for (let b = a + 1; b < list.length && !stacked; b += 1) {
          const A = bones[list[a]!]!;
          const B = bones[list[b]!]!;
          const near = 0.5 * Math.max(A.radius, B.radius);
          stacked = dot(sub(A.head, B.head), sub(A.head, B.head)) < near * near;
        }
      }
      if (stacked) for (const i of list) groupOf.set(i, list);
    }
  }
  // Same-anchor groups holding two or more roles (an ear pair under a brim).
  const crossOf = new Map<number, number[]>();
  {
    const groups = new Map<string, number[]>();
    bones.forEach((bone, i) => {
      const p = parent[i]!;
      const anchor = anchorOf(i);
      if (p < 0 || !anchor || !AXIS[anchor] || isPlate(i) || skip.has(bone.id)) return;
      if (bone.role === "item" || bone.role === "wing" || bone.role === "leg") return;
      const key = `${p}|${anchor}`;
      const list = groups.get(key) ?? [];
      list.push(i);
      groups.set(key, list);
    });
    for (const list of groups.values()) {
      if (new Set(list.map((i) => bones[i]!.role)).size >= 2) for (const i of list) crossOf.set(i, list);
    }
  }

  /** A member's geometry before its own overrides (its parent's transform applied). */
  const inherited = (i: number): { head: Vec3; tail: Vec3; dir: Vec3 } => {
    const p = parent[i]!;
    const bone = bones[i]!;
    const R = p >= 0 ? rot[p]! : I3;
    const T = p >= 0 ? tr[p]! : ([0, 0, 0] as Vec3);
    let head = add(mulMV(R, bone.head), T);
    let tail = add(mulMV(R, bone.tail), T);
    const shift = p >= 0 ? childShift[p] : null;
    if (shift) {
      const d = shift(head);
      head = add(head, d);
      tail = add(tail, d);
    }
    const dir =
      boneLength(bone) > 1e-6
        ? normalize(sub(tail, head))
        : p >= 0
          ? normalize(sub(head, out[p]!.centre), [0, 1, 0])
          : ([0, 1, 0] as Vec3);
    return { head, tail, dir };
  };

  const computeFan = (group: number[]) => {
    const p = parent[group[0]!]!;
    const pb = out[p]!;
    const anchor = anchorOf(group[0]!)!;
    const A = normalize(mulMV(rot[p]!, AXIS[anchor]!));
    const parentPrims = preparePrims(primsOf[p]!, 0);
    const surfaceParent = parentPrims.length > 0 && (pb.sphere || !LIMB_LIKE.has(bones[p]!.role));
    const surface = (d: Vec3): Vec3 => marchSurface(parentPrims, pb.centre, d, pb.radius * 3 + pb.half * 2).point;
    const cur = new Map(group.map((i) => [i, inherited(i)]));
    const count = group.length;
    // Tentacles and drips of a floater hang straight down from their ring.
    const hang = (i: number) => isTentacle(i) && (plan === "SLITHER" || plan === "FLIER");
    if (anchor === "top" || anchor === "bottom") {
      const e1 = perp([0, 0, 1], A, [1, 0, 0]);
      const ex = perp(perp([1, 0, 0], A, [0, 0, 1]), e1, cross(A, e1));
      const angleOf = (i: number) => {
        const off = sub(cur.get(i)!.head, pb.centre);
        const x = dot(off, ex);
        const z = dot(off, e1);
        return x * x + z * z < 1e-10 ? 0 : Math.atan2(x, z);
      };
      const order = [...group].sort((a, b) => angleOf(a) - angleOf(b) || a - b);
      const sinA = FAN_RING;
      const cosA = Math.sqrt(1 - sinA * sinA);
      order.forEach((i, k) => {
        const phi = (2 * Math.PI * k) / count + (count % 2 === 0 ? Math.PI / count : 0);
        const o = normalize(add(scale(e1, Math.cos(phi)), scale(ex, Math.sin(phi))));
        const m = cur.get(i)!;
        const bone = bones[i]!;
        let head: Vec3;
        if (surfaceParent) {
          const d = normalize(add(scale(A, cosA), scale(o, sinA)));
          head = madd(surface(d), d, sinkOf(bone.shape, bone.radius));
        } else {
          head = madd(m.head, o, FAN_RING * pb.radius);
        }
        fanSlots.set(i, { head, dir: hang(i) ? m.dir : tilt(m.dir, o, FAN_TILT_RING) });
      });
    } else {
      const upish = pb.sphere || !pb.level;
      const raw: Vec3 = upish ? [0, 1, 0] : anchor === "front" || anchor === "back" ? [1, 0, 0] : [0, 0, 1];
      const e = perp(raw, A, perp([0, 1, 0], A, [1, 0, 0]));
      const order = [...group].sort(
        (a, b) => dot(sub(cur.get(b)!.head, pb.centre), e) - dot(sub(cur.get(a)!.head, pb.centre), e) || a - b,
      );
      order.forEach((i, k) => {
        const s = count > 1 ? (1 - (2 * k) / (count - 1)) * FAN_SIDE : 0;
        const m = cur.get(i)!;
        const bone = bones[i]!;
        let head: Vec3;
        if (surfaceParent) {
          const d = normalize(madd(A, e, s));
          head = madd(surface(d), d, sinkOf(bone.shape, bone.radius));
        } else {
          head = madd(m.head, e, s * pb.radius);
        }
        const dir = tilt(m.dir, scale(e, Math.sign(s) || 1), FAN_TILT_SIDE * (Math.abs(s) / FAN_SIDE));
        fanSlots.set(i, { head, dir });
      });
    }
  };

  /**
   * An arm lying along its parent (a buff duck's huge arms against its sides)
   * blends into one cape-like slab. Swing it out about its shoulder, a little
   * at a time, until a gap shows partway down; null when it already clears.
   */
  const armSplay = (i: number, head: Vec3, dir: Vec3, len: number, r: number): Vec3 | null => {
    const bone = bones[i]!;
    const parentPrims = preparePrims(primsOf[parent[i]!]!, 3 * r);
    if (parentPrims.length === 0) return null;
    const side = bone.side !== 0 ? bone.side : head[0] >= 0 ? 1 : -1;
    const gapAt = (d: Vec3) => {
      const m = madd(head, d, ARM_GAP_AT * len);
      return fieldAt(parentPrims, m[0], m[1], m[2]) - r;
    };
    const want = ARM_GAP * r;
    const start = gapAt(dir);
    if (start >= want) return null;
    let last = dir;
    for (let a = ARM_SPLAY_STEP; a <= ARM_SPLAY_MAX + 1e-9; a += ARM_SPLAY_STEP) {
      last = normalize(mulMV(rotationAbout([0, 0, 1], side * a), dir));
      if (gapAt(last) >= want) return last;
    }
    return gapAt(last) > start + 0.25 * r ? last : null;
  };

  /** Where a face plate lies: a surface point above the brows or under the mouth, its normal, and the crosswise direction. */
  const plateOf = (i: number): { point: Vec3; normal: Vec3; along: Vec3 } | null => {
    const p = parent[i]!;
    const pb = out[p]!;
    const parentPrims = preparePrims(primsOf[p]!, 0);
    if (parentPrims.length === 0 || !input.face) return null;
    const fn = normalize(mulMV(rot[p]!, input.face.normal), [0, 0, 1]);
    const t = normalize(cross([0, 1, 0], fn), [1, 0, 0]);
    const up = normalize(cross(fn, t));
    const sign = bones[p]!.role === "head" ? 1 : -1;
    let hit: { point: Vec3; normal: Vec3 };
    if (bones[p]!.shape === "box") {
      // A box face is flat: offset up or down its front and shoot straight out
      // (an angled ray from the centre of a long box would land underneath).
      const E = eyeRadius(input.face.scale, height);
      const from = madd(pb.centre, up, sign * Math.min(PLATE_BOX_OFFSET * E, 0.7 * pb.radius));
      hit = marchSurface(parentPrims, from, fn, pb.radius * 3 + pb.half * 2);
    } else {
      const d = normalize(madd(fn, up, Math.tan(sign * PLATE_ANGLE)));
      hit = marchSurface(parentPrims, pb.centre, d, pb.radius * 3 + pb.half * 2);
    }
    return { point: hit.point, normal: hit.normal, along: perp(t, hit.normal, t) };
  };

  const push = (prim: RenderPrim) => {
    prims.push(prim);
    primsOf[prim.bone]!.push(prim);
  };

  /** Rotate bone state about `pivot` by Q (a slide along the parent's surface). */
  type State = { head: Vec3; tail: Vec3; dir: Vec3; R: Mat3; T: Vec3 };
  const rotateAbout = (s: State, Q: Mat3, pivot: Vec3): State => ({
    head: add(pivot, mulMV(Q, sub(s.head, pivot))),
    tail: add(pivot, mulMV(Q, sub(s.tail, pivot))),
    dir: normalize(mulMV(Q, s.dir), s.dir),
    R: mulMM(Q, s.R),
    T: add(pivot, mulMV(Q, sub(s.T, pivot))),
  });
  const translate = (s: State, d: Vec3): State => ({ ...s, head: add(s.head, d), tail: add(s.tail, d), T: add(s.T, d) });
  /** Move a child round its parent to direction `to` (from the parent's centre), keeping its depth in the surface. */
  const orbit = (i: number, s: State, to: Vec3): State => {
    const p = parent[i]!;
    const pb = out[p]!;
    const pp = preparePrims(primsOf[p]!, 0);
    if (pp.length === 0) return s;
    const from = normalize(sub(s.head, pb.centre), to);
    const depth = fieldAt(pp, s.head[0], s.head[1], s.head[2]);
    const moved = rotateAbout(s, rotationBetween(from, to), pb.centre);
    const surface = marchSurface(pp, pb.centre, to, pb.radius * 3 + pb.half * 2).point;
    const want = madd(surface, to, Math.max(-pb.radius, Math.min(depth, pb.radius * 2)));
    return translate(moved, sub(want, moved.head));
  };

  let legLift = 0;
  for (let i = 0; i < n; i += 1) {
    const bone = bones[i]!;
    const p = parent[i]!;
    const part = partOf(i);
    const anchor = anchorOf(i);
    const r = radiusOf(i);
    renderR[i] = r;
    const len = boneLength(bone);
    const round = bone.shape === "sphere" || len < 1e-6;
    const skipped = skip.has(bone.id);

    let { head, tail, dir } = inherited(i);
    let R = p >= 0 ? rot[p]! : I3;
    let T: Vec3 = p >= 0 ? tr[p]! : [0, 0, 0];
    const shift = p >= 0 ? childShift[p] : null;
    if (shift) T = add(T, shift(add(mulMV(R, bone.head), T)));
    let s: State = { head, tail, dir, R, T };

    // Own rigid overrides, about the head.
    let target: Vec3 | null = null;
    const wingRoot = bone.role === "wing" && (p < 0 || bones[p]!.role !== "wing");
    if (wingRoot && !flier) {
      const ws = bone.side === 0 ? 1 : bone.side;
      target = normalize([ws * 0.75, 0.6, -0.35]);
    }
    if (bone.role === "ear" && (anchor === "left" || anchor === "right") && part?.elongation === "long") {
      const side = anchor === "left" ? 1 : -1;
      target = normalize([side * 0.3, -1, -0.15]);
    }
    const group = groupOf.get(i);
    if (group && !fanSlots.has(i)) computeFan(group);
    const slot = fanSlots.get(i) ?? null;
    if (slot) target = slot.dir;
    const plate = isPlate(i) ? plateOf(i) : null;
    if (plate && !round) target = plate.along;
    if (!target && bone.role === "arm" && p >= 0 && bones[p]!.role !== "arm" && len > 2 * r) {
      target = armSplay(i, head, dir, len, r);
    }
    const spine = spineDepth[i]!;
    if (!target && spine > 0 && len > 1e-6) {
      // A slitherer's tail chain curls off to one side (0.7, then 0.5 more),
      // then wiggles back and forth about that heading, so its length shows
      // from the front instead of hiding behind the body.
      const turn = spine === 1 ? SLITHER_FIRST : spine % 2 === 0 ? SLITHER_TURN : -SLITHER_TURN;
      target = normalize(mulMV(rotationAbout([0, 1, 0], turn), dir));
    }
    const backTail = isBackTail(i);
    // A level winged body keeps its tail low, under the wings, where the side view still sees it.
    if (!target && backTail && len > 1e-6 && p >= 0 && !(out[p]!.level && wingedRoot)) {
      const heading = normalize([dir[0], 0, dir[2]], [0, 0, -1]);
      const toward = (a: number) => normalize(madd(scale(heading, Math.cos(a)), UP, Math.sin(a)));
      // Less where rising would lay it along the body (a short tail low on a
      // round back): most of the whole tail chain's length must clear the body
      // by half its radius.
      const body = preparePrims(primsOf[p]!, 0);
      let reach = len;
      for (let j = i, c = -1; (c = children[j]!.find((k) => bones[k]!.role === "tail") ?? -1) >= 0; j = c) {
        reach += boneLength(bones[c]!);
      }
      const shows = (d: Vec3) => {
        let outside = 0;
        for (let k = 0; k <= 8; k += 1) {
          const q = madd(s.head, d, (reach * k) / 8);
          if (fieldAt(body, q[0], q[1], q[2]) > TAIL_SHOW * r) outside += 1;
        }
        return outside / 9 >= PROTRUDE_SEGMENT;
      };
      let rise = out[p]!.level ? TAIL_RISE_LEVEL : TAIL_RISE_UPRIGHT;
      while (body.length > 0 && rise > 0 && !shows(toward(rise))) rise = Math.max(0, rise - TAIL_RISE_STEP);
      target = toward(rise);
    }
    if (target) {
      const Q = rotationBetween(s.dir, target);
      s = rotateAbout(s, Q, s.head);
      s.dir = target;
    }
    if (slot) s = translate(s, sub(slot.head, s.head));
    if (plate) {
      // Centred on the surface point, sunk so it stands proud by under half its radius.
      const sink = bone.shape === "box" ? -0.6 * r : round ? -0.45 * r : -0.1 * r;
      const mid = madd(plate.point, plate.normal, sink);
      const want = round ? mid : madd(mid, s.dir, -len / 2);
      s = translate(s, sub(want, s.head));
    }
    // Same-anchor siblings of another role: the biggest unpaired part keeps
    // the anchor, the rest slide along the surface out from under it.
    const cross_ = crossOf.get(i);
    if (cross_ && anchor && p >= 0) {
      let keeper = -1;
      let best = -1;
      for (const j of cross_) {
        if (paired(j)) continue;
        const e = extentOf(j);
        if (e > best + 1e-12) {
          best = e;
          keeper = j;
        }
      }
      if (keeper >= 0 && keeper !== i) {
        const A = normalize(mulMV(rot[p]!, AXIS[anchor]!));
        const sideAnchor = anchor === "left" || anchor === "right";
        const own = bone.side !== 0 ? bone.side : s.head[0] >= 0 ? 1 : -1;
        const R0 = Math.max(out[p]!.radius, 1e-4);
        const angle = clampN(Math.asin(Math.min(1, (best + extentOf(i)) / R0)), SLIDE_MIN, SLIDE_MAX);
        const d = normalize(sub(s.head, out[p]!.centre), A);
        const off = sub(d, scale(A, dot(d, A)));
        // A pair slides toward its own side; a part already off the anchor
        // (a fanned stack) keeps its bearing; a centred one takes the default.
        const towards: Vec3 =
          paired(i) && !sideAnchor
            ? mulMV(rot[p]!, [own, 0, 0])
            : Math.sqrt(dot(off, off)) > 0.15
              ? off
              : mulMV(rot[p]!, SLIDE_DEFAULT[anchor]!);
        const w = perp(towards, A, perp([0, 0, -1], A, [1, 0, 0]));
        // Already far enough from the anchor (a splayed pair): leave it be.
        const curA = Math.acos(clampN(dot(d, A), -1, 1));
        if (curA < angle) s = orbit(i, s, normalize(madd(scale(A, Math.cos(angle)), w, Math.sin(angle))));
      }
    }
    // A sphere tail sits up on the back, where it shows past the body.
    if (backTail && round && p >= 0) {
      const back = normalize([s.head[0] - out[p]!.centre[0], 0, s.head[2] - out[p]!.centre[2]], [0, 0, -1]);
      s = orbit(i, s, normalize(madd(scale(back, Math.cos(SPHERE_TAIL_RISE)), UP, Math.sin(SPHERE_TAIL_RISE))));
    }
    // Big add-ons keep their share of the parent: a grown sphere sits further
    // out, a grown capsule or cone sinks in a little (boxes keep their faces).
    if (isBigAddOn(i) && r > bone.radius && anchor && p >= 0 && bone.shape !== "box") {
      const pd = normalize(mulMV(rot[p]!, AXIS[anchor]!));
      s = translate(s, scale(pd, sinkOf(bone.shape, r) - sinkOf(bone.shape, bone.radius)));
      if (anchor === "back") s = translate(s, scale(UP, 0.15 * out[p]!.radius));
    }
    // Snouts, beaks and tongues root on the lower face and stay short.
    let snoutShape: { kind: "muzzle" | "ball" | "beak" | "tongue"; reach: number } | null = null;
    if (isSnout(i) && face && !skipped) {
      const lf = face;
      const fb = out[faceIndex]!;
      const sdf = chainSdf(prims, lf.chain, lf.scale * 0.5);
      const rf = lf.scale;
      // 0.4 of the face radius under the eye line (an arc on a round face).
      const yRoot = STD_EYE_Y - (SNOUT_DROP * rf) / lf.eye;
      const rootSpot = faceSpot(lf, sdf, fb, 0, yRoot, lf.eye, lf.lift);
      const forward = normalize([lf.normal[0], 0, lf.normal[2]], [0, 0, 1]);
      const tongue = isTongue(i);
      const kind = tongue ? "tongue" : bone.shape === "cone" ? "beak" : round ? "ball" : "muzzle";
      const down = kind === "tongue" ? TONGUE_DOWN : kind === "beak" ? BEAK_DOWN : MUZZLE_DOWN;
      const ndir = normalize(madd(scale(forward, Math.cos(down)), UP, -Math.sin(down)));
      s = rotateAbout(s, rotationBetween(s.dir, ndir), s.head);
      s.dir = ndir;
      let want: Vec3;
      let reach = len;
      if (kind === "ball") {
        // A muzzle ball is at least 0.42 of the face; a small one stays a button nose.
        const R = part?.size === "S" ? r : Math.max(r, MUZZLE_MIN * rf);
        renderR[i] = R;
        const along = part?.elongation === "stubby" ? R * SPHERE_STUBBY.along : R;
        // Attached like any sphere, but never reaching past 0.55 of the face radius.
        want = madd(rootSpot.point, ndir, Math.min(sinkOf("sphere", R), MUZZLE_REACH * rf - along));
      } else if (kind === "muzzle") {
        reach = Math.min(len, Math.max(0.05 * rf, MUZZLE_REACH * rf + 0.35 * r - MUZZLE_TIP * r));
        want = madd(rootSpot.point, ndir, -0.35 * r);
      } else {
        reach = Math.min(len, BEAK_LENGTH * rf);
        want = madd(rootSpot.point, ndir, -0.15 * r);
      }
      s = translate(s, sub(want, s.head));
      s.tail = madd(s.head, ndir, reach);
      snoutShape = { kind, reach };
      lf.snoutBone = i;
    }
    // No hidden parts: push arms, tails, horns, ears and fins on the torso or a
    // head out along the surface normal until enough of them shows.
    if (onBody(i) && PROTRUDE_ROLES.has(bone.role) && !plate && !isSnout(i) && !skipped) {
      const pp = preparePrims(primsOf[p]!, 0);
      if (pp.length > 0) {
        const f = (q: Vec3) => fieldAt(pp, q[0], q[1], q[2]);
        const e = 0.05 * Math.max(out[p]!.radius, 1e-3);
        const h0 = s.head;
        let nrm: Vec3 = normalize(
          [
            f([h0[0] + e, h0[1], h0[2]]) - f([h0[0] - e, h0[1], h0[2]]),
            f([h0[0], h0[1] + e, h0[2]]) - f([h0[0], h0[1] - e, h0[2]]),
            f([h0[0], h0[1], h0[2] + e]) - f([h0[0], h0[1], h0[2] - e]),
          ],
          normalize(sub(h0, out[p]!.centre), [0, 1, 0]),
        );
        if (dot(nrm, sub(h0, out[p]!.centre)) < 0) nrm = normalize(sub(h0, out[p]!.centre), nrm);
        const segLen = Math.sqrt(dot(sub(s.tail, s.head), sub(s.tail, s.head)));
        const sphereish = round;
        const along = sphereish
          ? part?.elongation === "stubby" && bone.role !== "ear"
            ? r * SPHERE_STUBBY.along
            : part?.elongation === "long" && bone.role !== "ear"
              ? r * SPHERE_LONG.along
              : r
          : 0;
        const ok = (d: number) => {
          if (sphereish) {
            const c = madd(s.head, nrm, d);
            return f(c) >= PROTRUDE_SPHERE * along;
          }
          let outside = 0;
          for (let k = 0; k <= 8; k += 1) {
            const q = madd(lerp(s.head, s.tail, k / 8), nrm, d);
            if (f(q) > 0) outside += 1;
          }
          return outside / 9 >= PROTRUDE_SEGMENT;
        };
        if (!ok(0)) {
          const cap = 1.2 * r + 0.5 * segLen;
          const step = Math.max(0.08 * r, cap / 24);
          let d = step;
          while (d < cap && !ok(d)) d += step;
          s = translate(s, scale(nrm, Math.min(d, cap)));
        }
      }
    }
    // Legs show: stretch a torso leg from its lifted hip to its unchanged foot.
    // A sphere leg is all foot (no length to stretch): it stays where it stood,
    // as far as it can while still touching the lifted torso.
    const lifted = legLift > 0 && bone.role === "leg" && isRootChild(i);
    if (lifted && bone.shape === "sphere") {
      const gap = fieldAt(preparePrims(primsOf[p]!, 2 * r + legLift), s.head[0], s.head[1], s.head[2]);
      const drop = clampN(SPHERE_LEG_ATTACH * r - gap, 0, legLift);
      if (drop > 0) s = translate(s, scale(UP, -drop));
    }
    const torsoLeg = lifted && bone.shape !== "sphere";
    if (torsoLeg) {
      s.tail = madd(s.tail, UP, -legLift);
      s.T = madd(s.T, UP, -legLift);
    }
    head = s.head;
    tail = s.tail;
    dir = torsoLeg ? normalize(sub(tail, head), s.dir) : s.dir;
    R = s.R;
    T = s.T;
    if (bone.role === "wing" && len > WING_MAX_LENGTH * height) {
      const capped = madd(head, dir, WING_MAX_LENGTH * height);
      const d = sub(capped, tail);
      childShift[i] = () => d;
      tail = capped;
    }
    rot[i] = R;
    tr[i] = T;

    const k = blend(i, renderR[i]!);
    const flatRole = FLATTEN[bone.role] ?? 1;
    let renderLen = Math.sqrt(dot(sub(tail, head), sub(tail, head)));
    // A thinned long limb keeps its far end (feet stay on the ground).
    if (renderR[i]! < bone.radius && !round && renderLen > 1e-6 && (bone.role === "leg" || bone.role === "arm" || bone.role === "head")) {
      tail = madd(tail, dir, bone.radius - renderR[i]!);
      renderLen = Math.sqrt(dot(sub(tail, head), sub(tail, head)));
    }
    const rr = renderR[i]!;
    let centre = lerp(head, tail, 0.5);
    let axis: Vec3 = renderLen > 1e-6 ? dir : [0, 1, 0];
    let half = renderLen / 2 + rr;
    let radius = rr;
    const away = dir;
    const sphere = bone.shape === "sphere" || (renderLen < 1e-6 && bone.shape !== "box");

    if (skipped) {
      // Drawn as a modelled prop: no primitive.
    } else if (bone.role === "wing") {
      const W = rr * WING_CHORD;
      const fa = flatAxisOf("wing", dir);
      if (sphere) {
        // A round flat paddle reaching out from the shoulder.
        centre = madd(head, dir, 0.7 * W);
        push({ bone: i, kind: PRIM.Sphere, head: centre, tail: centre, r0: 0.9 * W, r1: 0.9 * W, round: 0, flat: FLATTEN.wing!, flatAxis: fa, k });
        radius = 0.9 * W;
        half = radius;
      } else {
        const shape = bone.shape === "cone" ? "cone" : bone.shape === "box" ? "box" : "capsule";
        const kind = shape === "box" ? PRIM.CappedCone : PRIM.RoundCone;
        const round0 = shape === "box" ? 0.15 * W : 0;
        // A narrow root widening to the full chord just outside the body, so
        // the membrane's broad base never pokes through the torso (or tears it
        // when the wing flaps).
        let from = head;
        if (renderLen > 1.5 * W) {
          from = madd(head, dir, WING_ROOT * renderLen);
          push({ bone: i, kind, head, tail: from, r0: WING_ROOT_RADIUS * W, r1: W, round: round0, flat: FLATTEN.wing!, flatAxis: fa, k });
        }
        push({
          bone: i,
          kind,
          head: from,
          tail,
          r0: W,
          r1: W * WING_TIP[shape],
          round: round0,
          flat: FLATTEN.wing!,
          flatAxis: fa,
          k: from === head ? k : 0.3 * W,
        });
        radius = W;
        half = renderLen / 2 + W;
      }
    } else if (snoutShape && snoutShape.kind === "ball") {
      const R0 = rr;
      const stubby = part?.elongation === "stubby";
      const shape = stubby ? SPHERE_STUBBY : { along: 1, across: 1 };
      const Rc = R0 * shape.across;
      push({ bone: i, kind: PRIM.Sphere, head, tail: head, r0: Rc, r1: Rc, round: 0, flat: shape.along / shape.across, flatAxis: dir, k: MUZZLE_BLEND * R0 });
      centre = head;
      axis = dir;
      radius = Rc;
      half = R0 * shape.along;
    } else if (snoutShape && snoutShape.kind === "muzzle") {
      push({ bone: i, kind: PRIM.RoundCone, head, tail, r0: rr, r1: MUZZLE_TIP * rr, round: 0, flat: 1, flatAxis: [0, 1, 0], k: MUZZLE_BLEND * rr });
    } else if (sphere) {
      let R0 = rr;
      let flat = 1;
      let flatAxis: Vec3 = [0, 1, 0];
      const elongation = part?.elongation ?? "normal";
      const grown = rr / Math.max(bone.radius, 1e-9);
      if (bone.role === "ear") {
        flat = flatRole;
        flatAxis = [0, 0, 1];
      } else if (elongation !== "normal" && bone.role !== "item") {
        const shape = elongation === "stubby" ? SPHERE_STUBBY : SPHERE_LONG;
        flatAxis = p < 0 ? [0, 1, 0] : normalize(sub(head, out[p]!.centre), [0, 1, 0]);
        R0 = rr * shape.across;
        flat = shape.along / shape.across;
        const c0 = head;
        let c1 = head;
        const legged = children[i]!.some((c) => bones[c]!.role === "leg");
        if (p < 0 && !legged) c1 = [head[0], head[1] - rr + rr * shape.along, head[2]];
        centre = c1;
        axis = flatAxis;
        const across = shape.across * grown;
        const along = shape.along * grown;
        const nrm = flatAxis;
        const r0 = bone.radius;
        // Children ride the reshaped surface (legs keep their footing).
        childShift[i] = (h: Vec3) => {
          const q = madd(c0, normalize(sub(h, c0), nrm), r0);
          const v = sub(q, c0);
          const mapped = add(scale(v, across), scale(nrm, (along - across) * dot(v, nrm)));
          return sub(add(c1, mapped), q);
        };
      } else if (grown > 1 + 1e-9) {
        const c0 = head;
        const r0 = bone.radius;
        childShift[i] = (h: Vec3) => scale(normalize(sub(h, c0), [0, 1, 0]), rr - r0);
      }
      push({ bone: i, kind: PRIM.Sphere, head: centre, tail: centre, r0: R0, r1: R0, round: 0, flat, flatAxis, k });
      radius = R0;
      half = axis === flatAxis ? R0 * flat : R0;
    } else if (bone.shape === "capsule" || (bone.shape === "cone" && isTentacle(i))) {
      const flatAxis = plate
        ? perp(plate.normal, dir, plate.normal)
        : flatRole < 1
          ? flatAxisOf(bone.role, dir)
          : ([0, 1, 0] as Vec3);
      const leafTail = isLeafTail(i);
      const multiLeg = isMultiLeg(i) && renderLen > 2.5 * rr;
      if (isTentacle(i) && renderLen > 1e-6) {
        // A tentacle or drip: hangs, kinks sideways at 30%, curls out from 60%, tapering.
        const tip = bone.shape === "cone" ? TENTACLE_CONE_TIP : TAIL_TIP;
        const rAt = (t: number) => rr + (tip * rr - rr) * t;
        const pc = p >= 0 ? out[p]!.centre : head;
        const outward = perp(sub(head, pc), [0, 1, 0], [0, 0, 1]);
        const out2 = perp([outward[0], 0, outward[2]], dir, perp([0, 0, 1], dir, [1, 0, 0]));
        const a = madd(head, dir, WAVE_AT * renderLen);
        const swirl = normalize(cross(dir, out2), perp([1, 0, 0], dir, [0, 0, 1]));
        const dir2 = tilt(dir, swirl, -WAVE_ANGLE);
        const b = madd(a, dir2, (CURL_START - WAVE_AT) * renderLen);
        const dir3 = tilt(dir, out2, CURL_ANGLE);
        const end = madd(b, dir3, (1 - CURL_START) * renderLen);
        push({ bone: i, kind: PRIM.RoundCone, head, tail: a, r0: rr, r1: rAt(WAVE_AT), round: 0, flat: flatRole, flatAxis, k });
        push({ bone: i, kind: PRIM.RoundCone, head: a, tail: b, r0: rAt(WAVE_AT), r1: rAt(CURL_START), round: 0, flat: flatRole, flatAxis, k: 0.5 * rAt(WAVE_AT) });
        push({ bone: i, kind: PRIM.RoundCone, head: b, tail: end, r0: rAt(CURL_START), r1: tip * rr, round: 0, flat: flatRole, flatAxis, k: 0.5 * rAt(CURL_START) });
        tail = end;
      } else if (leafTail && backTail && renderLen > 1e-6) {
        // A back tail: up and over, its last part curling further up; a big one plumes.
        const plume = part?.size === "L" || part?.size === "XL";
        const rAt = (t: number) =>
          plume
            ? t <= 0.5
              ? rr + (PLUME_MID * rr - rr) * (t / 0.5)
              : PLUME_MID * rr + (PLUME_TIP * rr - PLUME_MID * rr) * ((t - 0.5) / 0.5)
            : rr + (TAIL_TIP * rr - rr) * t;
        const curlDir = tilt(dir, UP, TAIL_CURL);
        const c = madd(head, dir, TAIL_CURL_AT * renderLen);
        const end = madd(c, curlDir, (1 - TAIL_CURL_AT) * renderLen);
        if (plume) {
          const m = madd(head, dir, 0.5 * renderLen);
          push({ bone: i, kind: PRIM.RoundCone, head, tail: m, r0: rr, r1: rAt(0.5), round: 0, flat: flatRole, flatAxis, k });
          push({ bone: i, kind: PRIM.RoundCone, head: m, tail: c, r0: rAt(0.5), r1: rAt(TAIL_CURL_AT), round: 0, flat: flatRole, flatAxis, k: 0.4 * rr });
        } else {
          push({ bone: i, kind: PRIM.RoundCone, head, tail: c, r0: rr, r1: rAt(TAIL_CURL_AT), round: 0, flat: flatRole, flatAxis, k });
        }
        push({ bone: i, kind: PRIM.RoundCone, head: c, tail: end, r0: rAt(TAIL_CURL_AT), r1: rAt(1), round: 0, flat: flatRole, flatAxis, k: 0.4 * rr });
        tail = end;
        if (plume) radius = PLUME_MID * rr;
      } else if (leafTail) {
        push({ bone: i, kind: PRIM.RoundCone, head, tail, r0: rr, r1: TAIL_TIP * rr, round: 0, flat: flatRole, flatAxis, k });
      } else if (multiLeg) {
        // A spider's leg: hip up to a raised knee, then down to the foot.
        const outward = perp([dir[0], 0, dir[2]], [0, 1, 0], [bone.side || 1, 0, 0]);
        const knee = madd(madd(lerp(head, tail, 0.45), [0, 1, 0], 0.35 * renderLen), outward, 0.1 * renderLen);
        push({ bone: i, kind: PRIM.Capsule, head, tail: knee, r0: rr, r1: rr, round: 0, flat: 1, flatAxis, k });
        push({ bone: i, kind: PRIM.RoundCone, head: knee, tail, r0: rr, r1: 0.8 * rr, round: 0, flat: 1, flatAxis, k: 0.35 * rr });
      } else {
        push({ bone: i, kind: PRIM.Capsule, head, tail, r0: rr, r1: rr, round: 0, flat: flatRole, flatAxis, k });
        if (isBigAddOn(i) && rr > bone.radius) {
          const ax = dir;
          const h0 = head;
          const r0 = bone.radius;
          childShift[i] = (h: Vec3) => {
            const q = sub(h, h0);
            const lateral = sub(q, scale(ax, dot(q, ax)));
            return scale(normalize(lateral, [0, 1, 0]), rr - r0);
          };
        }
      }
    } else if (bone.shape === "cone") {
      const fan = bone.role === "fin" && anchor === "back" && isRootChild(i) && out[p]!.level;
      const flatAxis = plate
        ? perp(plate.normal, dir, plate.normal)
        : fan
          ? perp([1, 0, 0], dir, [1, 0, 0])
          : flatRole < 1
            ? flatAxisOf(bone.role, dir)
            : ([0, 1, 0] as Vec3);
      const r1 = rr * CONE_TIP_RATIO;
      // The tip disc sits where the old round tip ended, so parts on top still touch it.
      const tip = renderLen > 1e-6 ? madd(tail, dir, r1) : tail;
      tail = tip;
      // A cone torso stands on a flat base where its old round bottom was.
      const base = p < 0 ? madd(head, dir, -rr) : head;
      if (p < 0 && renderLen > 1e-6) {
        // That cone is slimmer at mid height than the resolver's (head to
        // tail); parts on its sides slide in to stay on the surface.
        const h0 = head;
        const ax = dir;
        const L = renderLen;
        childShift[i] = (h: Vec3) => {
          const v = sub(h, h0);
          const a = dot(v, ax);
          if (a <= 0 || a >= L) return [0, 0, 0];
          const q = sub(v, scale(ax, a));
          const rho = Math.sqrt(dot(q, q));
          const was = rr + (r1 - rr) * (a / L);
          if (rho < 0.5 * was) return [0, 0, 0];
          const now = rr + (r1 - rr) * ((a + rr) / (L + rr + r1));
          return scale(q, -(was - now) / rho);
        };
      } else if (isBigAddOn(i) && rr > bone.radius) {
        const ax = dir;
        const h0 = head;
        const grow = rr / bone.radius;
        childShift[i] = (h: Vec3) => {
          const q = sub(h, h0);
          const lateral = sub(q, scale(ax, dot(q, ax)));
          return scale(lateral, grow - 1);
        };
      }
      push({
        bone: i,
        kind: PRIM.CappedCone,
        // A tail fan is a cone turned round: narrow at the body, broad at the end.
        head: base,
        tail: tip,
        r0: fan ? r1 : rr,
        r1: fan ? rr : r1,
        round: CONE_ROUND * rr,
        flat: fan ? FAN_FLATTEN : flatRole,
        flatAxis,
        k,
      });
      centre = lerp(base, tail, 0.5);
      half = Math.sqrt(dot(sub(tail, base), sub(tail, base))) / 2;
    } else {
      // A box. A grown add-on widens but keeps its faces along its axis.
      let bh = head;
      let bt = tail;
      let flat = 1;
      let flatAxis: Vec3 = [0, 1, 0];
      if (rr > bone.radius + 1e-9) {
        const ax = renderLen > 1e-6 ? dir : normalize(mulMV(rot[p >= 0 ? p : i]!, AXIS[anchor ?? "top"] ?? UP));
        const near = madd(head, ax, -bone.radius);
        const far = madd(tail, ax, bone.radius);
        const extent = Math.sqrt(dot(sub(far, near), sub(far, near)));
        if (extent >= 2 * rr) {
          bh = madd(near, ax, rr);
          bt = madd(far, ax, -rr);
        } else {
          const mid = lerp(near, far, 0.5);
          bh = madd(mid, ax, -1e-4);
          bt = madd(mid, ax, 1e-4);
          flat = extent / (2 * rr);
          flatAxis = ax;
        }
        centre = lerp(near, far, 0.5);
        half = extent / 2;
        axis = ax;
        const h0 = head;
        const r0 = bone.radius;
        const { u: bu, v: bv } = boxFrame({ head: bh, tail: bt });
        childShift[i] = (h: Vec3) => {
          const q = sub(h, h0);
          let d: Vec3 = [0, 0, 0];
          for (const w of [bu, bv]) {
            const c = dot(q, w);
            d = Math.abs(c) >= 0.9 * r0 ? madd(d, w, Math.sign(c) * (rr - r0)) : madd(d, w, c * (rr / r0 - 1));
          }
          return d;
        };
      }
      push({ bone: i, kind: PRIM.Box, head: bh, tail: bt, r0: rr, r1: rr, round: BOX_ROUND * rr, flat, flatAxis, k });
    }

    out[i] = {
      head,
      tail,
      centre,
      axis,
      half,
      radius,
      away,
      sphere,
      level: !sphere && renderLen > 1e-6 && Math.abs(axis[1]) < 0.6,
      skip: skipped,
      root: p < 0,
    };

    // Legs show: once the torso is drawn, lift it (and so everything on it)
    // until every leg shows enough below it; the legs stretch to their feet.
    if (p < 0 && plan !== "MULTIPED") {
      legLift = legLiftFor(i);
      if (legLift > 0) {
        const d: Vec3 = [0, legLift, 0];
        for (const prim of primsOf[i]!) {
          prim.head = add(prim.head, d);
          prim.tail = add(prim.tail, d);
        }
        tr[i] = add(tr[i]!, d);
        const rb = out[i]!;
        out[i] = { ...rb, head: add(rb.head, d), tail: add(rb.tail, d), centre: add(rb.centre, d) };
        const inner = childShift[i];
        if (inner) {
          // Shapes laid out before the lift; children arrive lifted.
          childShift[i] = (h: Vec3) => inner(sub(h, d));
        }
      }
    }
    if (i === faceIndex) face = buildLayoutFace({ input, faceIndex, out, prims, parent, children, height });
  }

  /** How far the torso must rise so its legs show (0 when they already do). */
  function legLiftFor(root: number): number {
    let bottom = Infinity;
    let frontZ = -Infinity;
    for (const prim of primsOf[root]!) {
      const b = primBounds(prim);
      bottom = Math.min(bottom, b.min[1]);
      frontZ = Math.max(frontZ, b.max[2]);
    }
    if (!Number.isFinite(bottom)) return 0;
    const legs = children[root]!.filter((c) => bones[c]!.role === "leg" && bones[c]!.shape !== "sphere" && boneLength(bones[c]!) > 1e-6);
    if (legs.length === 0) return 0;
    const boxTorso = bones[root]!.shape === "box";
    let frontLeg = -Infinity;
    for (const c of legs) frontLeg = Math.max(frontLeg, bones[c]!.head[2]);
    let need = 0;
    for (const c of legs) {
      let foot = Infinity;
      const stack = [c];
      while (stack.length) {
        const j = stack.pop()!;
        const b = bones[j]!;
        foot = Math.min(foot, Math.min(b.head[1], b.tail[1]) - b.radius);
        for (const k2 of children[j]!) if (bones[k2]!.role === "leg") stack.push(k2);
      }
      const e = partOf(c)?.elongation ?? "normal";
      let want = e === "stubby" ? LEG_SHOW_STUBBY * radiusOf(c) : e === "long" ? LEG_SHOW_LONG * height : LEG_SHOW_NORMAL * height;
      if (boxTorso && bones[c]!.head[2] >= frontLeg - 1e-6) {
        want += BOX_OVERHANG_HIDE * Math.max(0, frontZ - (bones[c]!.head[2] + radiusOf(c)));
      }
      need = Math.max(need, want - (bottom - foot));
    }
    return clampN(need, 0, LEG_LIFT_MAX * height);
  }

  return { prims, bones: out, face, height };
}
