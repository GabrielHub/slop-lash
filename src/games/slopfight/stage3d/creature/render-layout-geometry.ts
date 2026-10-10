// Pure geometry used by the ordered body layout and face placement.

import { add, cross, dot, madd, normalize, scale, sub, type Vec3 } from "../../body/vec";
import type { Bone } from "../../body/skeleton";
import type { PartRole } from "../../vocab";
import type { RenderBone } from "./render-layout-types";

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const mulMV = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

export function mulMM(a: Mat3, b: Mat3): Mat3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out;
}

/** Rotation by `angle` about unit `axis` (Rodrigues). */
export function rotationAbout(axis: Vec3, angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const [x, y, z] = axis;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/** The shortest rotation taking unit `a` to unit `b`. */
export function rotationBetween(a: Vec3, b: Vec3): Mat3 {
  const c = dot(a, b);
  if (c > 1 - 1e-9) return I3;
  if (c < -1 + 1e-9) {
    const ortho = Math.abs(a[0]) < 0.9 ? normalize(cross(a, [1, 0, 0])) : normalize(cross(a, [0, 1, 0]));
    return rotationAbout(ortho, Math.PI);
  }
  const axis = normalize(cross(a, b));
  return rotationAbout(axis, Math.acos(Math.max(-1, Math.min(1, c))));
}

/** Tilt unit `v` toward `toward` by `angle`. */
export function tilt(v: Vec3, toward: Vec3, angle: number): Vec3 {
  const w = sub(toward, scale(v, dot(v, toward)));
  const l = Math.sqrt(dot(w, w));
  if (l < 1e-6 || angle === 0) return v;
  return normalize(madd(scale(v, Math.cos(angle)), w, Math.sin(angle) / l));
}

export const perp = (v: Vec3, axis: Vec3, fallback: Vec3): Vec3 => normalize(sub(v, scale(axis, dot(v, axis))), fallback);
export const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The thin direction of a flattened wing, fin or ear segment, perpendicular to its axis. */
export function flatAxisOf(role: PartRole, axis: Vec3): Vec3 {
  let n: Vec3;
  if (role === "wing") {
    // The wing plane holds the wing axis and the creature's forward axis: n = axis x z.
    n = Math.abs(axis[0]) + Math.abs(axis[1]) < 1e-3 ? [0, 1, 0] : normalize([axis[1], -axis[0], 0]);
    if (Math.abs(axis[0]) > 0.55) {
      // A spread wing tilts its membrane halfway toward the front, so it reads
      // from the stage camera instead of showing only its edge.
      if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
      const d = axis[2];
      const zp = normalize([-axis[0] * d, -axis[1] * d, 1 - axis[2] * d]);
      n = normalize(add(n, zp));
    }
  } else if (role === "ear") {
    n = Math.abs(axis[2]) > 0.7 ? [1, 0, 0] : [0, 0, 1];
  } else {
    n = Math.abs(axis[0]) > 0.6 ? [0, 1, 0] : [1, 0, 0];
  }
  return perp(n, axis, [1, 0, 0]);
}

/** Attachment offset along the surface normal, by shape (the resolver's attachEnd). */
export function sinkOf(shape: Bone["shape"], r: number): number {
  switch (shape) {
    case "sphere":
      return r * 0.45;
    case "cone":
      return -r * 0.15;
    case "box":
      return r * 0.15;
    default:
      return -r * 0.2;
  }
}

/** A box's frame (the resolver's boneFrame), from its render segment. */
export function boxFrame(b: Pick<RenderBone, "head" | "tail">): { axis: Vec3; u: Vec3; v: Vec3 } {
  const axis = normalize(sub(b.tail, b.head), [0, 1, 0]);
  const ref: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  const u = normalize(madd(ref, axis, -dot(ref, axis)), [1, 0, 0]);
  return { axis, u, v: cross(axis, u) };
}
