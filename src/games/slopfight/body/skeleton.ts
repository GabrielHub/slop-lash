// Body resolver: a champion's parts list (relative placement, no coordinates)
// becomes a rest-pose skeleton of capsule bones in creature space. The fight
// sim builds its physics proxies from it and the renderer meshes and rigs it,
// so it is pure, deterministic and uses only + - * / and Math.sqrt (no trig,
// no randomness; the same bits on every JS engine).
//
// Creature space: y up, the creature faces +z, its left is +x (side 1) and its
// right is -x (side -1), the ground is y = 0.
//
// Fixed anchor rules
// - Size and role set the radius: ROLE_BASE[role].r * SIZE_SCALE[size]. Size,
//   role and elongation set the capsule length (between the two end centres):
//   ROLE_BASE[role].len * SIZE_SCALE[size] * ELONGATION_LENGTH[elongation].
//   Spheres have no length (tail = head) and ignore elongation.
// - Shape picks the SDF primitive the renderer meshes: capsule (round segment),
//   sphere, cone (round cone, base radius at `head`, CONE_TIP_RATIO at `tail`)
//   and box (rounded box spanning the segment plus `radius`, cross-section
//   2 * radius square; boneFrame() gives its axes).
// - `head` is the attachment end and `tail` the far end. The torso is centred
//   on the origin: upright (axis +y) for bipeds and hoppers, level (axis +z)
//   for quadrupeds, multipeds and slitherers, nose-up level for fliers; a
//   torso's head end is its bottom / back.
// - top / bottom / front / back / left / right put the child on the parent's
//   surface along that creature axis (+y, -y, +z, -z, +x, -x), slightly sunk in
//   so the metaball joins. A mirrored part on a centre anchor is offset to the
//   left and its copy to the right (horn pairs, eye stalks).
// - Children of a limb-like part (leg, arm, tail, wing, horn, ear, fin, spike)
//   attach at its far end and continue along it, bent toward the anchor axis
//   (feet, hands, tail tips, neck-free chains). Children of the torso, a head or
//   an item use the surface rule.
// - legN: legs in left/right pairs front to back under the parent (odd = left,
//   even = right), pointing down. An odd highest leg index puts that last leg on
//   the midline (three-legged stools stand). Multipeds splay their legs out and
//   fan them front to back.
// - armN: pairs on the upper sides (arm1/arm2 the shoulders, arm3/arm4 lower),
//   pointing out and down; on a level torso they sit at the front and reach
//   forward (crab claws).
// - Wings sit on the back upper sides, spread for fliers and folded down the
//   back otherwise. Wings always come in pairs: an unmirrored wing on a centre
//   anchor is treated as mirrored.
// - Tails leave the back (lower back of an upright torso), angled slightly up;
//   a slitherer's tail segments run straight back along the floor.
// - Heads sit on top of an upright torso; on a level torso a head on `top` or
//   `front` goes to the front-top, looking forward.
// - Horns and ears go up from the top (splayed when paired), or out and up
//   from the sides on left / right anchors.
// - An item attached to an arm (or any limb-like part: a beak, a tail) sits at
//   its far end, the hand: boxes hang (briefcase), capsules and cones point
//   forward and up (sword), spheres sit in the palm. On the torso, a head or
//   another item, an item is placed by the surface rule (a jetpack on the back).
// - `mirror: true` adds a copy reflected across x = 0 with id `${id}~m`; the
//   descendants of a mirrored part are copied with it. A mirror flag on a part
//   whose parent is already off the midline (and not mirrored) is ignored.
// - Normalization: the creature is lifted so its lowest point rests on y = 0
//   and scaled so its height is STANDARD_HEIGHT * scale. Long, low bodies
//   (snakes, spiders) are capped instead by their longest horizontal extent:
//   the fitted size is max(height, LONG_BODY_FACTOR * max(width, depth)).
//   Passing `unit` skips the fit and uses a fixed raw-to-world factor (live
//   growth, so the body grows instead of shrinking as parts land).
//
// Robustness: any prefix of a streamed parts list resolves (parts whose
// parent has not arrived are skipped), extra torsos become tail segments, a
// missing anchor gets the role's default, duplicate ids are dropped, and an
// empty list gives an empty skeleton (no bones, torso "").

import { championScale, type BodyPlan, type Champion, type Part, type PartRole, type PartShape } from "../sheet";
import type { Anchor, Elongation, PartSize } from "../vocab";
import {
  add,
  clamp,
  cross,
  distance,
  dot,
  lerp,
  madd,
  normalize,
  reflectX,
  scale as scaleVec,
  sub,
  length,
  type Vec3,
} from "./vec";

export type { Vec3 } from "./vec";

export interface Bone {
  /** Part id, or `${partId}~m` for a mirrored copy. */
  id: string;
  partId: string;
  role: PartRole;
  shape: PartShape;
  /** Parent bone id; null for the torso. */
  parent: string | null;
  /** Creature faces +z; its left is +x (side 1), its right is -x (side -1). */
  side: -1 | 0 | 1;
  /** Rest-pose position of the attachment end, creature space (y up, +z forward, ground at y = 0). */
  head: Vec3;
  /** Far end of the capsule axis; equals head for spheres. */
  tail: Vec3;
  radius: number;
  color: "primary" | "secondary" | "accent";
  /** Torso, head, legs and arms carry the body (and a slitherer's tail chain); the rest is secondary. */
  load: boolean;
}

export interface Skeleton {
  bones: Bone[];
  height: number;
  torso: string;
  head: string | null;
  feet: string[];
  hands: string[];
  wings: string[];
  item: string | null;
  face: { pos: Vec3; normal: Vec3; scale: number };
  bounds: { min: Vec3; max: Vec3 };
}

export interface ResolveOptions {
  /** Height multiplier (championScale); default 1. */
  scale?: number;
  /** Orients the torso; inferred from the parts when absent. */
  bodyPlan?: BodyPlan;
  /** Fixed raw-to-world factor instead of fitting the standard height (times `scale`). */
  unit?: number;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const SIZE_SCALE: Record<PartSize, number> = { S: 0.62, M: 1, L: 1.38, XL: 1.85 };
export const ELONGATION_LENGTH: Record<Elongation, number> = { stubby: 0.55, normal: 1, long: 1.75 };

/** Radius and capsule length of a size-M, normal part, in raw units (before fitting). */
export const ROLE_BASE: Record<PartRole, { r: number; len: number }> = {
  torso: { r: 0.36, len: 0.42 },
  head: { r: 0.3, len: 0.3 },
  leg: { r: 0.14, len: 0.36 },
  arm: { r: 0.11, len: 0.38 },
  wing: { r: 0.15, len: 0.55 },
  tail: { r: 0.13, len: 0.4 },
  horn: { r: 0.09, len: 0.22 },
  ear: { r: 0.11, len: 0.18 },
  fin: { r: 0.14, len: 0.2 },
  spike: { r: 0.07, len: 0.16 },
  item: { r: 0.13, len: 0.26 },
};

/** A cone's tip radius as a fraction of its base radius. */
export const CONE_TIP_RATIO = 0.18;
export const STANDARD_HEIGHT = 1;
export const LONG_BODY_FACTOR = 0.6;
/**
 * Raw-to-world factor for live growth (`unit`): about the median fit factor of
 * the sample champions, so a growing body ends near its fitted size.
 */
export const GROWTH_UNIT = 0.6;

const LIMB_LIKE: ReadonlySet<PartRole> = new Set([
  "leg",
  "arm",
  "tail",
  "wing",
  "horn",
  "ear",
  "fin",
  "spike",
]);

const AXIS: Record<"top" | "bottom" | "front" | "back" | "left" | "right", Vec3> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};

const DEFAULT_ANCHOR: Record<PartRole, Anchor> = {
  torso: "back",
  head: "top",
  leg: "bottom",
  arm: "left",
  wing: "back",
  tail: "back",
  horn: "top",
  ear: "top",
  fin: "back",
  spike: "back",
  item: "front",
};

const isSideAnchor = (anchor: Anchor) => anchor === "left" || anchor === "right";
const legIndex = (anchor: Anchor) => (anchor.startsWith("leg") ? Number(anchor.slice(3)) : 0);
const armIndex = (anchor: Anchor) => (anchor.startsWith("arm") ? Number(anchor.slice(3)) : 0);

// ---------------------------------------------------------------------------
// Geometry helpers (shared with the renderer)
// ---------------------------------------------------------------------------

/** Distance between the bone's end centres. */
export const boneLength = (bone: Pick<Bone, "head" | "tail">): number =>
  length(sub(bone.tail, bone.head));

/** Radius at the far end (a cone tapers). */
export const tipRadius = (bone: Pick<Bone, "shape" | "radius">): number =>
  bone.shape === "cone" ? bone.radius * CONE_TIP_RATIO : bone.radius;

/**
 * An orthonormal frame for a bone: `axis` from head to tail (up for spheres),
 * `u` the cross axis closest to world up (or forward when the axis is
 * vertical), `v = axis x u`. Boxes are aligned to it.
 */
export function boneFrame(bone: Pick<Bone, "head" | "tail">): { axis: Vec3; u: Vec3; v: Vec3 } {
  const axis = normalize(sub(bone.tail, bone.head), [0, 1, 0]);
  const ref: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  const u = normalize(madd(ref, axis, -dot(ref, axis)), [1, 0, 0]);
  const v = cross(axis, u);
  return { axis, u, v };
}

/** Axis-aligned extent of one bone's primitive. */
export function boneBounds(bone: Pick<Bone, "head" | "tail" | "radius" | "shape">): {
  min: Vec3;
  max: Vec3;
} {
  if (bone.shape === "box") {
    const { axis, u, v } = boneFrame(bone);
    const centre = lerp(bone.head, bone.tail, 0.5);
    const half = boneLength(bone) / 2 + bone.radius;
    const ext: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i += 1) {
      ext[i] = Math.abs(axis[i]!) * half + (Math.abs(u[i]!) + Math.abs(v[i]!)) * bone.radius;
    }
    return { min: sub(centre, ext), max: add(centre, ext) };
  }
  const r0 = bone.radius;
  const r1 = tipRadius(bone);
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    min[i] = Math.min(bone.head[i]! - r0, bone.tail[i]! - r1);
    max[i] = Math.max(bone.head[i]! + r0, bone.tail[i]! + r1);
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** What surfacePoint needs: a laid-out primitive. */
interface Laid {
  head: Vec3;
  tail: Vec3;
  radius: number;
  shape: PartShape;
  /** Unit direction the part was laid out along (its axis, or its outward normal for spheres). */
  dir: Vec3;
}

interface Placed extends Laid {
  id: string;
  part: Part;
  role: PartRole;
  parentId: string | null;
  side: -1 | 0 | 1;
  /** Gets a reflected copy (mirrored itself or descended from a mirrored part). */
  copied: boolean;
}

interface Context {
  plan: BodyPlan;
  /** Level body plans put heads at the front and tails out the rear. */
  level: boolean;
  /** Highest leg index used on each parent. */
  maxLeg: Map<string, number>;
  rootId: string;
}

function inferBodyPlan(parts: readonly Part[]): BodyPlan {
  if (parts.some((part) => part.role === "wing")) return "FLIER";
  const roleOf = new Map(parts.map((part) => [part.id, part.role]));
  const legs = parts
    .filter((part) => part.role === "leg" && (part.parent === null || roleOf.get(part.parent) !== "leg"))
    .reduce((count, part) => count + (part.mirror ? 2 : 1), 0);
  if (legs >= 6) return "MULTIPED";
  if (legs >= 4) return "QUADRUPED";
  if (legs >= 1) return "BIPED";
  return "HOPPER";
}

const upright = (bone: Pick<Laid, "head" | "tail" | "dir">): boolean =>
  boneLength(bone) < 1e-6 || Math.abs(bone.dir[1]) >= 0.6;

/** A point on the bone's surface roughly along `d` (face centres, not corners). */
function surfacePoint(bone: Laid, d: Vec3): Vec3 {
  const len = boneLength(bone);
  if (len < 1e-6) return madd(bone.head, d, bone.radius);
  if (bone.shape === "box") {
    const { axis, u, v } = boneFrame(bone);
    const centre = lerp(bone.head, bone.tail, 0.5);
    const half = len / 2 + bone.radius;
    let p = madd(centre, axis, clamp(dot(axis, d) * 2, -1, 1) * half);
    p = madd(p, u, clamp(dot(u, d) * 2, -1, 1) * bone.radius);
    return madd(p, v, clamp(dot(v, d) * 2, -1, 1) * bone.radius);
  }
  const t = clamp(0.5 + dot(bone.dir, d), 0, 1);
  const r = bone.shape === "cone" ? bone.radius + (tipRadius(bone) - bone.radius) * t : bone.radius;
  return madd(lerp(bone.head, bone.tail, t), d, r);
}

/** The end centres extended a little into the caps, ordered front (larger z) then back. */
function frontBack(bone: Placed): [Vec3, Vec3] {
  const [front, back] = bone.head[2] >= bone.tail[2] ? [bone.head, bone.tail] : [bone.tail, bone.head];
  const axis = normalize(sub(front, back), [0, 0, 1]);
  return [madd(front, axis, bone.radius * 0.3), madd(back, axis, -bone.radius * 0.3)];
}

const lowerEnd = (bone: Placed): Vec3 => (bone.head[1] <= bone.tail[1] ? bone.head : bone.tail);
const upperEnd = (bone: Placed): Vec3 => (bone.head[1] > bone.tail[1] ? bone.head : bone.tail);

function partRadius(part: Part, role: PartRole): number {
  return ROLE_BASE[role].r * SIZE_SCALE[part.size];
}

function partLength(part: Part, role: PartRole): number {
  if (part.shape === "sphere") return 0;
  return ROLE_BASE[role].len * SIZE_SCALE[part.size] * ELONGATION_LENGTH[part.elongation];
}

/** Attachment end for a child laid out along `cd` from surface point `s` with outward normal `pd`. */
function attachEnd(shape: PartShape, s: Vec3, pd: Vec3, r: number): Vec3 {
  switch (shape) {
    case "sphere":
      return madd(s, pd, r * 0.45);
    case "cone":
      return madd(s, pd, -r * 0.15);
    case "box":
      return madd(s, pd, r * 0.15);
    default:
      return madd(s, pd, -r * 0.2);
  }
}

interface Layout {
  head: Vec3;
  tail: Vec3;
  dir: Vec3;
  side: -1 | 0 | 1;
}

/** Spider and centipede legs: longer and thinner than a walker's, splayed wide. */
export const MULTI_LEG_LENGTH = 1.5;
export const MULTI_LEG_RADIUS = 0.8;

function isMultiLeg(ctx: Context, rows: number): boolean {
  return ctx.plan === "MULTIPED" || rows >= 3;
}

function layoutLeg(part: Part, parent: Placed, ctx: Context, r: number, len: number): Layout {
  const n = legIndex(part.anchor!);
  const maxLeg = ctx.maxLeg.get(parent.id) ?? n;
  const rows = Math.max(1, Math.ceil(maxLeg / 2));
  const row = Math.ceil(n / 2) - 1;
  const lone = n % 2 === 1 && n === maxLeg;
  const side: -1 | 0 | 1 = lone ? 0 : n % 2 === 1 ? 1 : -1;
  const t = rows === 1 ? 0.5 : row / (rows - 1); // 0 = front row, 1 = back row
  const pr = parent.radius;
  const multi = isMultiLeg(ctx, rows);
  // Rows spread front to back along the body; many legs spread over at least
  // 1.5 body radii so neighbouring hips never overlap.
  let mid: Vec3;
  let axis: Vec3 = [0, 0, 1];
  let half: number;
  if (upright(parent)) {
    mid = lowerEnd(parent);
    half = pr * (multi ? 0.75 : 0.5);
  } else {
    const [front, back] = frontBack(parent);
    mid = lerp(front, back, 0.5);
    axis = normalize(sub(front, back), [0, 0, 1]);
    half = Math.max(distance(front, back) / 2, multi ? pr * 0.75 : 0);
  }
  const base = rows === 1 ? mid : madd(mid, axis, half * (1 - 2 * t));
  // A round leg is a foot: tucked under the body so it peeks out below it.
  // A box body is flat underneath, so legs start near its bottom face.
  // Many legs leave from the lower sides.
  const drop = len < 1e-6 ? pr - r * 0.9 : parent.shape === "box" ? pr * 0.85 : multi ? pr * 0.3 : pr * 0.55;
  const hip = add(base, [side * pr * (multi ? 0.78 : 0.5), -drop, 0]);
  // Many legs splay wide and fan out front to back like a spider's, sloping
  // just enough that the feet land a little below the belly.
  let dir: Vec3 = normalize([side * 0.1, -1, 0]);
  if (multi && len > 1e-6) {
    const fan = rows > 1 ? (0.5 - t) * 2.2 : 0;
    const out = normalize([side * 1.3, 0, fan], [0, 0, -1]);
    const bottom = Math.min(parent.head[1], parent.tail[1]) - pr;
    const footY = bottom - pr * 0.18 + r;
    const down = clamp((hip[1] - footY) / len, 0.3, 1);
    const across = Math.sqrt(1 - down * down);
    dir = [out[0] * across, -down, out[2] * across];
  }
  return { head: hip, tail: madd(hip, dir, len), dir, side };
}

function layoutArm(part: Part, parent: Placed, ctx: Context, r: number, len: number): Layout {
  const n = armIndex(part.anchor!);
  const row = Math.ceil(n / 2) - 1;
  const side: -1 | 1 = n % 2 === 1 ? 1 : -1;
  const pr = parent.radius;
  let shoulder: Vec3;
  let dir: Vec3;
  // A round torso on a level body plan reaches forward like a level one (crab claws).
  if (upright(parent) && !(ctx.level && boneLength(parent) < 1e-6)) {
    const p =
      boneLength(parent) > 1e-6
        ? lerp(lowerEnd(parent), upperEnd(parent), clamp(0.88 - 0.4 * row, 0, 1))
        : add(parent.head, [0, pr * (0.22 - 0.38 * row), 0]);
    shoulder = add(p, [side * pr * 0.78, 0, pr * 0.05]);
    dir = normalize([side * 0.8, -1, 0.15]);
  } else {
    const [front, back] = frontBack(parent);
    shoulder = add(lerp(front, back, 0.1 + 0.28 * row), [side * pr * 0.72, pr * 0.1, 0]);
    dir = normalize([side * 0.6, -0.25, 1]);
  }
  const head = madd(shoulder, dir, r * 0.1);
  return { head, tail: madd(head, dir, len), dir, side };
}

/** The far end of a limb-like parent, where its children hang. */
function distalPoint(parent: Placed): Vec3 {
  const len = boneLength(parent);
  return madd(parent.tail, parent.dir, tipRadius(parent) * (len > 1e-6 ? 0.35 : 0.75));
}

function layoutHeld(part: Part, parent: Placed, r: number, len: number): Layout {
  const s = distalPoint(parent);
  const side = parent.side;
  let dir: Vec3;
  let head: Vec3;
  if (part.shape === "box") {
    dir = [0, -1, 0];
    head = madd(s, dir, r * 0.85);
  } else if (part.shape === "sphere") {
    dir = parent.dir;
    head = madd(s, dir, r * 0.4);
  } else {
    dir = normalize([side * 0.2, 0.5, 1]);
    head = madd(s, dir, r * 0.2);
  }
  return { head, tail: madd(head, dir, len), dir, side };
}

function layoutDistal(
  part: Part,
  parent: Placed,
  anchorAxis: Vec3,
  ownSide: -1 | 0 | 1,
  r: number,
  len: number,
): Layout {
  const s = distalPoint(parent);
  // A mirrored pair on a midline tip fans out left and right (leaves on a sprout).
  const axis = ownSide !== 0 && anchorAxis[0] === 0 ? normalize(add(anchorAxis, [ownSide * 0.9, 0, 0])) : anchorAxis;
  const along = dot(axis, parent.dir) > 0.3;
  const dir = normalize(madd(axis, parent.dir, along ? 1.6 : 0.5), parent.dir);
  const head = part.shape === "sphere" ? madd(s, dir, r * 0.35) : madd(s, dir, -r * 0.1);
  return { head, tail: madd(head, dir, len), dir, side: ownSide !== 0 ? ownSide : parent.side };
}

function layoutSurface(
  part: Part,
  role: PartRole,
  parent: Placed,
  ctx: Context,
  anchor: Anchor,
  ownSide: -1 | 0 | 1,
  r: number,
  len: number,
): Layout {
  const axis = AXIS[anchor as keyof typeof AXIS];
  const onTorso = parent.id === ctx.rootId;
  const side = ownSide !== 0 ? ownSide : parent.side;
  let pd: Vec3;
  let cd: Vec3 | null = null;

  if (role === "head" && ctx.level && onTorso && (anchor === "top" || anchor === "front")) {
    pd = anchor === "top" ? normalize([0, 1, 0.9]) : normalize([0, 0.45, 1]);
    cd = anchor === "top" ? normalize([0, 1, 0.35]) : normalize([0, 0.55, 1]);
  } else if (role === "wing") {
    const ws = side === 0 ? 1 : side;
    pd = upright(parent) ? normalize([ws * 0.8, 0.5, -0.5]) : normalize([ws * 0.95, 0.55, 0]);
    cd = ctx.plan === "FLIER" ? normalize([ws, 0.45, -0.2]) : normalize([ws * 0.35, -0.6, -0.7]);
  } else if ((role === "tail" || role === "torso") && anchor === "back" && onTorso) {
    if (ctx.plan === "SLITHER") {
      pd = [0, 0, -1];
      cd = [0, 0, -1];
    } else if (upright(parent)) {
      pd = normalize([0, -0.5, -1]);
      cd = normalize([0, 0.35, -1]);
    } else {
      pd = normalize([0, 0.2, -1]);
      cd = normalize([0, 0.22, -1]);
    }
  } else if ((role === "ear" || role === "horn") && isSideAnchor(anchor)) {
    pd = normalize([axis[0], 0.6, 0]);
  } else {
    pd = axis;
  }
  // A mirrored part on a centre anchor: the original leans left, the copy right.
  if (ownSide !== 0 && !isSideAnchor(anchor) && role !== "wing") {
    pd = normalize(add(pd, [ownSide * 0.6, 0, 0]));
    if (cd !== null) cd = normalize(add(cd, [ownSide * 0.4, 0, 0]));
  }

  if (cd === null) {
    switch (role) {
      case "leg":
        cd = normalize([side * 0.12, -1, 0]);
        break;
      case "arm":
        cd = normalize(add(pd, [0, -1, 0.15]));
        break;
      case "horn":
        cd = normalize(add(pd, [0, 0.35, 0]));
        break;
      case "ear":
        cd = normalize(add(pd, [0, 0.3, 0]));
        break;
      default:
        cd = pd;
    }
  }
  const s = surfacePoint(parent, pd);
  const head = attachEnd(part.shape, s, pd, r);
  return { head, tail: madd(head, cd, len), dir: cd, side };
}

function torsoAxis(plan: BodyPlan, shape: PartShape): Vec3 {
  if (shape === "sphere") return [0, 1, 0];
  switch (plan) {
    case "BIPED":
    case "HOPPER":
      return [0, 1, 0];
    case "FLIER":
      return normalize([0, 0.27, 1]);
    default:
      return [0, 0, 1];
  }
}

/** A complete champion's skeleton, fitted to its championScale and oriented by its body plan. */
export function resolveChampionSkeleton(champion: Champion): Skeleton {
  return resolveSkeleton(champion.parts, {
    scale: championScale(champion),
    bodyPlan: champion.bodyPlan,
  });
}

/** Resolve a parts list (complete, or any streamed prefix) into a rest skeleton. */
export function resolveSkeleton(parts: readonly Part[], opts: ResolveOptions = {}): Skeleton {
  const scaleFactor = opts.scale ?? 1;
  // Unique ids, first occurrence wins.
  const unique: Part[] = [];
  const seenIds = new Set<string>();
  for (const part of parts) {
    if (!part.id || seenIds.has(part.id)) continue;
    seenIds.add(part.id);
    unique.push(part);
  }
  if (unique.length === 0) return emptySkeleton();

  const plan = opts.bodyPlan ?? inferBodyPlan(unique);
  const root =
    unique.find((part) => part.role === "torso" && part.parent === null) ??
    unique.find((part) => part.role === "torso") ??
    unique[0]!;

  const maxLeg = new Map<string, number>();
  for (const part of unique) {
    if (part.parent === null || part.anchor === null) continue;
    const n = legIndex(part.anchor);
    if (n > 0) maxLeg.set(part.parent, Math.max(maxLeg.get(part.parent) ?? 0, n));
  }
  const ctx: Context = {
    plan,
    level: plan === "QUADRUPED" || plan === "MULTIPED" || plan === "SLITHER" || plan === "FLIER",
    maxLeg,
    rootId: root.id,
  };

  const placed = new Map<string, Placed>();
  const order: Placed[] = [];

  // The torso, centred on the origin.
  {
    const r = partRadius(root, "torso");
    const len = partLength(root, "torso");
    const dir = torsoAxis(plan, root.shape);
    const torso: Placed = {
      id: root.id,
      part: root,
      role: "torso",
      shape: root.shape,
      parentId: null,
      side: 0,
      head: scaleVec(dir, -len / 2),
      tail: scaleVec(dir, len / 2),
      radius: r,
      dir,
      copied: false,
    };
    placed.set(root.id, torso);
    order.push(torso);
  }

  // Everything else, parents first, in list order.
  let pending = unique.filter((part) => part.id !== root.id);
  let progress = true;
  while (progress && pending.length > 0) {
    progress = false;
    const next: Part[] = [];
    for (const part of pending) {
      const parentId = part.parent ?? root.id;
      const parent = placed.get(parentId);
      if (!parent) {
        next.push(part);
        continue;
      }
      const item = placePart(part, parent, ctx);
      placed.set(item.id, item);
      order.push(item);
      progress = true;
    }
    pending = next;
  }

  // Emit bones: each original, then its reflected copy.
  const raw: Bone[] = [];
  for (const item of order) {
    const bone: Bone = {
      id: item.id,
      partId: item.part.id,
      role: item.role,
      shape: item.part.shape,
      parent: item.parentId,
      side: item.side,
      head: item.head,
      tail: item.tail,
      radius: item.radius,
      color: item.part.color,
      load: isLoadBearing(item.role, plan),
    };
    raw.push(bone);
    if (item.copied) {
      const parent = item.parentId === null ? null : placed.get(item.parentId)!;
      raw.push({
        ...bone,
        id: `${item.id}~m`,
        parent: parent && parent.copied ? `${parent.id}~m` : item.parentId,
        side: (item.side === 0 ? 0 : -item.side) as -1 | 0 | 1,
        head: reflectX(item.head),
        tail: reflectX(item.tail),
      });
    }
  }

  // Fit: lowest point on the ground, standard height (or a fixed unit while growing).
  const rawBounds = boundsOf(raw);
  const height = rawBounds.max[1] - rawBounds.min[1];
  const width = rawBounds.max[0] - rawBounds.min[0];
  const depth = rawBounds.max[2] - rawBounds.min[2];
  const fitSize = Math.max(height, LONG_BODY_FACTOR * Math.max(width, depth));
  const s =
    opts.unit !== undefined
      ? opts.unit * scaleFactor
      : fitSize > 1e-9
        ? (STANDARD_HEIGHT * scaleFactor) / fitSize
        : scaleFactor;
  const lift = -rawBounds.min[1];
  const fit = (p: Vec3): Vec3 => [round(p[0] * s), round((p[1] + lift) * s), round(p[2] * s)];
  const bones = raw.map((bone) => ({
    ...bone,
    head: fit(bone.head),
    tail: fit(bone.tail),
    radius: round(bone.radius * s),
  }));
  const bounds = boundsOf(bones);

  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const childRoles = new Map<string, Set<PartRole>>();
  for (const bone of bones) {
    if (bone.parent === null) continue;
    let set = childRoles.get(bone.parent);
    if (!set) childRoles.set(bone.parent, (set = new Set()));
    set.add(bone.role);
  }
  const chainEnds = (role: PartRole) =>
    bones.filter((bone) => bone.role === role && !childRoles.get(bone.id)?.has(role)).map((bone) => bone.id);
  const wings = bones
    .filter((bone) => bone.role === "wing" && (bone.parent === null || byId.get(bone.parent)?.role !== "wing"))
    .map((bone) => bone.id);
  const headBone =
    bones.find((bone) => bone.role === "head" && !bone.id.endsWith("~m") && !childRoles.get(bone.id)?.has("head")) ??
    null;
  const itemBone = bones.find((bone) => bone.role === "item" && !bone.id.endsWith("~m")) ?? null;
  const torsoBone = byId.get(root.id)!;

  return {
    bones,
    height: round(bounds.max[1]),
    torso: root.id,
    head: headBone ? headBone.id : null,
    feet: chainEnds("leg"),
    hands: chainEnds("arm"),
    wings,
    item: itemBone ? itemBone.id : null,
    face: faceOf(headBone ?? torsoBone, headBone !== null),
    bounds,
  };
}

function placePart(part: Part, parent: Placed, ctx: Context): Placed {
  const role: PartRole = part.role === "torso" ? "tail" : part.role;
  const anchor: Anchor = part.anchor ?? DEFAULT_ANCHOR[role];
  const legRows = legIndex(anchor) > 0 ? Math.ceil((ctx.maxLeg.get(parent.id) ?? legIndex(anchor)) / 2) : 0;
  const multiLeg = legRows > 0 && isMultiLeg(ctx, legRows);
  const r = partRadius(part, role) * (multiLeg ? MULTI_LEG_RADIUS : 1);
  const len = partLength(part, role) * (multiLeg ? MULTI_LEG_LENGTH : 1);
  const centreAnchor = !isSideAnchor(anchor) && legIndex(anchor) === 0 && armIndex(anchor) === 0;
  // Wings come in pairs; a mirror flag only applies off a midline parent.
  const wantsMirror = (part.mirror || (role === "wing" && centreAnchor)) && legIndex(anchor) === 0 && armIndex(anchor) === 0;
  const mirrored = wantsMirror && (parent.side === 0 || parent.copied);
  const ownSide: -1 | 0 | 1 =
    anchor === "left" ? 1 : anchor === "right" ? -1 : mirrored && centreAnchor && !parent.copied ? 1 : 0;

  let layout: Layout;
  if (legIndex(anchor) > 0) {
    layout = layoutLeg({ ...part, anchor }, parent, ctx, r, len);
  } else if (armIndex(anchor) > 0) {
    layout = layoutArm({ ...part, anchor }, parent, ctx, r, len);
  } else if (role === "item" && LIMB_LIKE.has(parent.role)) {
    layout = layoutHeld(part, parent, r, len);
  } else if (LIMB_LIKE.has(parent.role)) {
    layout = layoutDistal(part, parent, AXIS[anchor as keyof typeof AXIS], ownSide, r, len);
  } else {
    layout = layoutSurface(part, role, parent, ctx, anchor, ownSide, r, len);
  }

  return {
    id: part.id,
    part,
    role,
    shape: part.shape,
    parentId: parent.id,
    side: layout.side,
    head: layout.head,
    tail: layout.tail,
    radius: r,
    dir: layout.dir,
      copied: parent.copied || mirrored,
  };
}

function isLoadBearing(role: PartRole, plan: BodyPlan): boolean {
  if (role === "torso" || role === "head" || role === "leg" || role === "arm") return true;
  return role === "tail" && plan === "SLITHER";
}

function faceOf(bone: Bone, isHead: boolean): Skeleton["face"] {
  const dir = normalize(sub(bone.tail, bone.head), [0, 1, 0]);
  const laid: Laid = { head: bone.head, tail: bone.tail, radius: bone.radius, shape: bone.shape, dir };
  const normal = normalize(isHead ? [0, 0.25, 1] : upright(laid) ? [0, 0.45, 1] : [0, 0.3, 1]);
  const pos = surfacePoint(laid, normal);
  return {
    pos: [round(pos[0]), round(pos[1]), round(pos[2])],
    normal: [round(normal[0]), round(normal[1]), round(normal[2])],
    scale: round(isHead ? bone.radius : bone.radius * 0.85),
  };
}

function boundsOf(bones: readonly Bone[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const bone of bones) {
    const b = boneBounds(bone);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i]!, b.min[i]!);
      max[i] = Math.max(max[i]!, b.max[i]!);
    }
  }
  return {
    min: [round(min[0]), round(min[1]), round(min[2])],
    max: [round(max[0]), round(max[1]), round(max[2])],
  };
}

/** Six decimals: stable printing, and every runtime agrees on the stored numbers. */
function round(value: number): number {
  const r = Math.round(value * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

function emptySkeleton(): Skeleton {
  return {
    bones: [],
    height: 0,
    torso: "",
    head: null,
    feet: [],
    hands: [],
    wings: [],
    item: null,
    face: { pos: [0, 0, 0], normal: [0, 0, 1], scale: 0 },
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}
