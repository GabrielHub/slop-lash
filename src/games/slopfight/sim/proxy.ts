// A fighter's physics proxy, built from the shared skeleton so the hitboxes are
// the bones the TV shows. Torso, head, legs, arms, tails and wings get their
// own rigid body (key = bone id); horns, ears, fins, spikes and held items weld
// onto their parent's body. Every body's frame at rest is the creature frame
// (identity relative rotation) with its origin at the bone's head, so joint
// anchors and pose targets are plain creature-space offsets.

import { championScale, type Champion } from "../sheet";
import type { BodyPlan, Finish, PartRole } from "../vocab";
import { resolveSkeleton, type Bone } from "./skeleton";
import {
  BODY_MASS_SHARE_MIN,
  LIMB_MASS_RATIO_MIN,
  MASS_BASE,
  MASS_HEFT_BASE,
  MASS_PER_HEFT,
  MAX_BODIES,
  PLAN_MASS,
  TORSO_MASS_SHARE_MIN,
} from "./tuning";
import type { FighterLayout, ProxyShape } from "./types";
import { vLen, vNorm, vScale, vSub, type V3 } from "./vec";

const BODY_ROLES: ReadonlySet<PartRole> = new Set(["torso", "head", "leg", "arm", "tail", "wing"]);
const PI = 3.141592653589793;

export interface ProxyBodyDef {
  key: string;
  role: PartRole;
  side: -1 | 0 | 1;
  /** Index into ProxyDef.bodies of the parent body; -1 for the torso. */
  parent: number;
  /** Bone head in creature space (the body origin at rest). */
  head: V3;
  /** Rest axis head -> tail of the body's own bone (unit; [0, 1, 0] for spheres). */
  restDir: V3;
  length: number;
  radius: number;
  /** Bone tail relative to the head (creature axes). */
  tip: V3;
  bones: string[];
  shapes: ProxyShape[];
  /** What each shape's part is made of (same order as bones and shapes). */
  finishes: Finish[];
  /** Mass per shape (same order). */
  shapeMass: number[];
  mass: number;
  /** Depth from the torso in body hops. */
  depth: number;
  /** Index of the root of this body's limb chain (the body attached to the torso). */
  chainRoot: number;
}

export interface ProxyDef {
  bodyPlan: BodyPlan;
  scale: number;
  height: number;
  bodies: ProxyBodyDef[];
  boneBody: Map<string, number>;
  totalMass: number;
  /** Rest centre of mass of the torso body alone, creature space. */
  torsoCom: V3;
  /** Horizontal footprint radius around the torso origin. */
  footprint: number;
  /** Lowest point of any leg relative to the floor (0 at rest), for clearance. */
  legBottom: number;
  /** Max distance from the torso origin to any shape surface, at rest (broadphase). */
  extent: number;
}

const shapeVolume = (shape: ProxyShape): number => {
  if (shape.kind === "ball") return (4 / 3) * PI * shape.radius * shape.radius * shape.radius;
  const len = vLen(vSub(shape.b, shape.a));
  return PI * shape.radius * shape.radius * (len + (4 / 3) * shape.radius);
};

function boneShape(bone: Bone, origin: V3): ProxyShape {
  const a = vSub(bone.head as V3, origin);
  const b = vSub(bone.tail as V3, origin);
  const radius = Math.max(bone.radius, 0.012);
  if (bone.shape === "sphere" || vLen(vSub(b, a)) < 1e-4) {
    return { kind: "ball", center: a, radius };
  }
  return { kind: "capsule", a, b, radius };
}

export function fighterMass(champion: Champion, scale: number): number {
  return (
    MASS_BASE *
    (MASS_HEFT_BASE + MASS_PER_HEFT * champion.stats.heft) *
    scale *
    PLAN_MASS[champion.bodyPlan]
  );
}

/** The proxy layout for a champion: pure data, no Rapier. Deterministic. */
export function buildProxyDef(champion: Champion): ProxyDef {
  const scale = championScale(champion);
  const skeleton = resolveSkeleton(champion.parts, { scale, bodyPlan: champion.bodyPlan });
  const bones = skeleton.bones;
  const boneIndex = new Map<string, number>();
  bones.forEach((bone, index) => boneIndex.set(bone.id, index));
  const torsoBone = bones.find((bone) => bone.id === skeleton.torso) ?? bones[0]!;

  // Depth of each bone from the torso, for the body budget.
  const depthOf = (bone: Bone): number => {
    let depth = 0;
    let current: Bone | undefined = bone;
    while (current && current.parent !== null && depth < 64) {
      current = bones[boneIndex.get(current.parent) ?? -1];
      depth += 1;
    }
    return depth;
  };

  // Choose bodied bones: the torso, then body roles by depth (then skeleton order) up to the cap.
  const candidates = bones
    .map((bone, index) => ({ bone, index, depth: depthOf(bone) }))
    .filter(({ bone }) => bone !== torsoBone && BODY_ROLES.has(bone.role))
    .sort((x, y) => x.depth - y.depth || x.index - y.index)
    .slice(0, MAX_BODIES - 1);
  const bodied = new Set<string>([torsoBone.id, ...candidates.map(({ bone }) => bone.id)]);

  // Bodies in skeleton order (parents precede children there), torso first.
  const order = [torsoBone, ...bones.filter((bone) => bone !== torsoBone && bodied.has(bone.id))];
  const bodies: ProxyBodyDef[] = [];
  const boneBody = new Map<string, number>();
  const nearestBodied = (bone: Bone): number => {
    let current: Bone | undefined = bone;
    for (let guard = 0; current && guard < 64; guard += 1) {
      const found = boneBody.get(current.id);
      if (found !== undefined) return found;
      if (current.parent === null) break;
      current = bones[boneIndex.get(current.parent) ?? -1];
    }
    return 0;
  };

  for (const bone of order) {
    const parentIndex = bone === torsoBone ? -1 : nearestBodied(bones[boneIndex.get(bone.parent ?? "") ?? -1] ?? torsoBone);
    const head = [bone.head[0], bone.head[1], bone.head[2]] as V3;
    const tip = vSub(bone.tail as V3, head);
    const length = vLen(tip);
    const index = bodies.length;
    const parent = parentIndex >= 0 ? bodies[parentIndex]! : null;
    bodies.push({
      key: bone.id,
      role: bone.role,
      side: bone.side,
      parent: parentIndex,
      head,
      restDir: length > 1e-4 ? vNorm(tip) : [0, 1, 0],
      length,
      radius: bone.radius,
      tip,
      bones: [bone.id],
      shapes: [boneShape(bone, head)],
      finishes: [bone.finish],
      shapeMass: [],
      mass: 0,
      depth: parent ? parent.depth + 1 : 0,
      chainRoot: parent ? (parent.parent === -1 ? index : parent.chainRoot) : 0,
    });
    boneBody.set(bone.id, index);
  }

  // Weld every other bone onto its nearest bodied ancestor, in skeleton order.
  for (const bone of bones) {
    if (boneBody.has(bone.id)) continue;
    const parentBone = bone.parent === null ? torsoBone : bones[boneIndex.get(bone.parent) ?? -1] ?? torsoBone;
    const target = nearestBodied(parentBone);
    const body = bodies[target]!;
    body.bones.push(bone.id);
    body.shapes.push(boneShape(bone, body.head));
    body.finishes.push(bone.finish);
    boneBody.set(bone.id, target);
  }

  // Mass: the torso keeps at least its share; the rest goes by volume.
  const totalMass = fighterMass(champion, scale);
  const volumes = bodies.map((body) => body.shapes.reduce((sum, shape) => sum + shapeVolume(shape), 0));
  const totalVolume = volumes.reduce((sum, value) => sum + value, 0) || 1;
  const torsoShare = Math.max(TORSO_MASS_SHARE_MIN, volumes[0]! / totalVolume);
  const restVolume = totalVolume - volumes[0]! || 1;
  const raw = bodies.map((_, index) =>
    index === 0
      ? torsoShare
      : Math.max(BODY_MASS_SHARE_MIN, torsoShare * LIMB_MASS_RATIO_MIN, ((1 - torsoShare) * volumes[index]!) / restVolume),
  );
  const rawSum = raw.reduce((sum, value) => sum + value, 0);
  bodies.forEach((body, index) => {
    body.mass = (totalMass * raw[index]!) / rawSum;
    const shapeVolumes = body.shapes.map(shapeVolume);
    const sum = shapeVolumes.reduce((acc, value) => acc + value, 0) || 1;
    body.shapeMass = shapeVolumes.map((value) => (body.mass * value) / sum);
  });

  // Torso centre of mass (volume-weighted shape centres) and the footprint.
  const torso = bodies[0]!;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  torso.shapes.forEach((shape, index) => {
    const m = torso.shapeMass[index]!;
    const c = shape.kind === "ball" ? shape.center : vScale([shape.a[0] + shape.b[0], shape.a[1] + shape.b[1], shape.a[2] + shape.b[2]], 0.5);
    cx += c[0] * m;
    cy += c[1] * m;
    cz += c[2] * m;
  });
  const torsoCom: V3 = [torso.head[0] + cx / torso.mass, torso.head[1] + cy / torso.mass, torso.head[2] + cz / torso.mass];

  let footprint = 0;
  let extent = 0;
  let legBottom = Number.POSITIVE_INFINITY;
  for (const body of bodies) {
    for (const shape of body.shapes) {
      const points = shape.kind === "ball" ? [shape.center] : [shape.a, shape.b];
      for (const point of points) {
        const world: V3 = [body.head[0] + point[0], body.head[1] + point[1], body.head[2] + point[2]];
        const dx = world[0] - torsoCom[0];
        const dz = world[2] - torsoCom[2];
        const dy = world[1] - torsoCom[1];
        const horizontal = Math.sqrt(dx * dx + dz * dz) + shape.radius;
        if (body.role === "torso" || body.role === "head" || body.role === "leg") {
          footprint = Math.max(footprint, horizontal);
        }
        extent = Math.max(extent, Math.sqrt(dx * dx + dy * dy + dz * dz) + shape.radius);
        if (body.role === "leg") legBottom = Math.min(legBottom, world[1] - shape.radius);
      }
    }
  }
  return {
    bodyPlan: champion.bodyPlan,
    scale,
    height: skeleton.bounds.max[1] - Math.min(0, skeleton.bounds.min[1]),
    bodies,
    boneBody,
    totalMass,
    torsoCom,
    footprint: Math.max(footprint * 0.85, torso.radius),
    legBottom: Number.isFinite(legBottom) ? legBottom : 0,
    extent,
  };
}

export function layoutOf(def: ProxyDef): FighterLayout {
  const boneBody: Record<string, string> = {};
  for (const [bone, index] of def.boneBody) boneBody[bone] = def.bodies[index]!.key;
  return {
    bodyPlan: def.bodyPlan,
    bodies: def.bodies.map((body) => ({
      key: body.key,
      parent: body.parent >= 0 ? def.bodies[body.parent]!.key : null,
      bones: [...body.bones],
      shapes: body.shapes.map((shape) =>
        shape.kind === "ball"
          ? { kind: "ball", center: [...shape.center], radius: shape.radius }
          : { kind: "capsule", a: [...shape.a], b: [...shape.b], radius: shape.radius },
      ),
      mass: body.mass,
    })),
    boneBody,
    totalMass: def.totalMass,
  };
}

/** Bodies of the limb chain rooted at `root` (root first, then descendants in order). */
export function chainOf(def: ProxyDef, root: number): number[] {
  const members = [root];
  for (let index = root + 1; index < def.bodies.length; index += 1) {
    if (members.includes(def.bodies[index]!.parent)) members.push(index);
  }
  return members;
}
