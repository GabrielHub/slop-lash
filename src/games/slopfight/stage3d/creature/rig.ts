// Rig data for one resolved skeleton: three.js vectors for the rest pose plus
// the chains the procedural animation drives (legs, arms, wings, the slither
// spine, secondary parts).

import { Vector3 } from "three";
import type { Bone, Skeleton } from "../../body/skeleton";
import type { BodyPlan, PartRole, PartShape } from "../../vocab";

export interface RigBone {
  index: number;
  id: string;
  partId: string;
  parent: number;
  children: number[];
  role: PartRole;
  shape: PartShape;
  side: -1 | 0 | 1;
  load: boolean;
  head: Vector3;
  tail: Vector3;
  /** Unit rest axis head -> tail ((0, 1, 0) for spheres, or the direction away from the parent). */
  dir: Vector3;
  length: number;
  radius: number;
}

export interface LegChain {
  /** The leg bone attached to the body (the IK bone). */
  root: number;
  /** Chain end (the foot). */
  end: number;
  /** Rest position of the root's tail, creature space (the IK target at rest). */
  home: Vector3;
  /** Rest length from hip to the root's tail. */
  reach: number;
  side: -1 | 0 | 1;
  /** Gait group (0 or 1): alternating, trot or tripod by position. */
  group: number;
}

export interface Rig {
  skeleton: Skeleton;
  plan: BodyPlan;
  bones: RigBone[];
  index: Map<string, number>;
  torso: number;
  head: number;
  legs: LegChain[];
  /** Arm bones attached to the body (each with its chain below). */
  arms: number[];
  /** Hand (chain end) per arm, same order. */
  hands: number[];
  wings: number[];
  /** Slitherers: the torso and the level tail chain behind it, front to back. */
  spine: number[];
  /** Non-load-bearing bones that follow their parent with spring lag. */
  secondary: number[];
  item: number;
  height: number;
}

const v3 = (p: readonly number[]) => new Vector3(p[0], p[1], p[2]);

export function buildRig(skeleton: Skeleton, plan: BodyPlan): Rig {
  const index = new Map(skeleton.bones.map((bone, i) => [bone.id, i]));
  const bones: RigBone[] = skeleton.bones.map((bone: Bone, i) => {
    const head = v3(bone.head);
    const tail = v3(bone.tail);
    const length = head.distanceTo(tail);
    return {
      index: i,
      id: bone.id,
      partId: bone.partId,
      parent: bone.parent === null ? -1 : (index.get(bone.parent) ?? -1),
      children: [],
      role: bone.role,
      shape: bone.shape,
      side: bone.side,
      load: bone.load,
      head,
      tail,
      dir: new Vector3(0, 1, 0),
      length,
      radius: bone.radius,
    };
  });
  for (const bone of bones) {
    if (bone.parent >= 0) bones[bone.parent]!.children.push(bone.index);
    if (bone.length > 1e-6) {
      bone.dir.subVectors(bone.tail, bone.head).normalize();
    } else if (bone.parent >= 0) {
      const p = bones[bone.parent]!;
      const centre = p.head.clone().lerp(p.tail, 0.5);
      bone.dir.subVectors(bone.head, centre);
      if (bone.dir.lengthSq() < 1e-9) bone.dir.set(0, 1, 0);
      bone.dir.normalize();
    }
  }

  const torso = index.get(skeleton.torso) ?? 0;
  const head = skeleton.head ? (index.get(skeleton.head) ?? -1) : -1;
  const chainEnd = (start: number, role: PartRole) => {
    let current = start;
    for (;;) {
      const next = bones[current]!.children.find((c) => bones[c]!.role === role);
      if (next === undefined) return current;
      current = next;
    }
  };

  // Legs: roots are leg bones whose parent is not a leg.
  const legRoots = bones.filter(
    (bone) => bone.role === "leg" && (bone.parent < 0 || bones[bone.parent]!.role !== "leg"),
  );
  // Rank legs front to back per side (centre legs count as left) for the gait groups.
  const rank = new Map<number, number>();
  for (const sideLegs of [legRoots.filter((b) => b.side >= 0), legRoots.filter((b) => b.side < 0)]) {
    sideLegs.sort((a, b) => b.head.z - a.head.z).forEach((bone, i) => rank.set(bone.index, i));
  }
  const legs: LegChain[] = legRoots.map((bone) => {
    const row = rank.get(bone.index) ?? 0;
    return {
      root: bone.index,
      end: chainEnd(bone.index, "leg"),
      home: bone.tail.clone(),
      reach: Math.max(bone.length, 1e-3),
      side: bone.side,
      group: (row + (bone.side === -1 ? 1 : 0)) % 2,
    };
  });

  const arms = bones
    .filter((bone) => bone.role === "arm" && (bone.parent < 0 || bones[bone.parent]!.role !== "arm"))
    .map((bone) => bone.index);
  const hands = arms.map((arm) => chainEnd(arm, "arm"));
  const wings = bones
    .filter((bone) => bone.role === "wing" && (bone.parent < 0 || bones[bone.parent]!.role !== "wing"))
    .map((bone) => bone.index);

  const spine: number[] = [];
  if (plan === "SLITHER") {
    spine.push(torso);
    let current = torso;
    for (;;) {
      const next = bones[current]!.children.find(
        (c) => bones[c]!.role === "tail" && bones[c]!.dir.z < -0.5 && Math.abs(bones[c]!.dir.y) < 0.6,
      );
      if (next === undefined) break;
      spine.push(next);
      current = next;
    }
  }
  const inSpine = new Set(spine);
  const secondary = bones
    .filter(
      (bone) =>
        !bone.load &&
        !inSpine.has(bone.index) &&
        bone.parent >= 0 &&
        !(plan === "FLIER" && wings.includes(bone.index)),
    )
    .map((bone) => bone.index);

  return {
    skeleton,
    plan,
    bones,
    index,
    torso,
    head,
    legs,
    arms,
    hands,
    wings,
    spine,
    secondary,
    item: skeleton.item ? (index.get(skeleton.item) ?? -1) : -1,
    height: Math.max(skeleton.height, 0.05),
  };
}
