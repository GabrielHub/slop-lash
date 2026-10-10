// Vector and quaternion helpers for the sim: plain tuples, + - * / and
// Math.sqrt only (trig goes through dmath), so results are bit-identical on
// every engine. Quaternions are [x, y, z, w].

import { cos, sin } from "./dmath";

export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const vAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
/** a + b * s */
export const vMadd = (a: V3, b: V3, s: number): V3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
export const vDot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vLen = (a: V3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export const vDist = (a: V3, b: V3): number => vLen(vSub(a, b));
export const vLerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export function vNorm(a: V3, fallback: V3 = [0, 1, 0]): V3 {
  const len = vLen(a);
  return len > 1e-9
    ? [a[0] / len, a[1] / len, a[2] / len]
    : [fallback[0], fallback[1], fallback[2]];
}
/** Horizontal (xz) length. */
export const hLen = (x: number, z: number): number => Math.sqrt(x * x + z * z);

export const Q_IDENTITY: Q4 = [0, 0, 0, 1];

export function qMul(a: Q4, b: Q4): Q4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const qConj = (q: Q4): Q4 => [-q[0], -q[1], -q[2], q[3]];

export function qNorm(q: Q4): Q4 {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return len > 1e-12 ? [q[0] / len, q[1] / len, q[2] / len, q[3] / len] : [0, 0, 0, 1];
}

/** v rotated by unit quaternion q. */
export function qRotate(q: Q4, v: V3): V3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Rotation about +Y by `yaw` (three.js convention: yaw 0 faces +Z, yaw PI/2 faces +X). */
export function qYaw(yaw: number): Q4 {
  const half = yaw * 0.5;
  return [0, sin(half), 0, cos(half)];
}

export function qAxisAngle(axis: V3, angle: number): Q4 {
  const half = angle * 0.5;
  const s = sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, cos(half)];
}

/** The shortest rotation taking unit vector `from` onto unit vector `to` (no trig). */
export function qFromTo(from: V3, to: V3): Q4 {
  const d = vDot(from, to);
  if (d < -0.999999) {
    // Opposite: rotate PI about any axis perpendicular to `from`.
    let axis = vCross([1, 0, 0], from);
    if (vLen(axis) < 1e-6) axis = vCross([0, 0, 1], from);
    const n = vNorm(axis);
    return [n[0], n[1], n[2], 0];
  }
  const c = vCross(from, to);
  return qNorm([c[0], c[1], c[2], 1 + d]);
}

/**
 * The rotation vector (axis * angle, small-angle form 2 * xyz) that takes `from`
 * to `to` in world space, shortest way round. Saturates gracefully for large
 * errors, which is what a PD servo wants.
 */
export function qErrorVec(to: Q4, from: Q4): V3 {
  const e = qMul(to, qConj(from));
  const s = e[3] < 0 ? -2 : 2;
  return [e[0] * s, e[1] * s, e[2] * s];
}

/** Slerp-free blend for small steps: normalized lerp along the shorter arc. */
export function qNlerp(a: Q4, b: Q4, t: number): Q4 {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  return qNorm([
    a[0] + (b[0] * s - a[0]) * t,
    a[1] + (b[1] * s - a[1]) * t,
    a[2] + (b[2] * s - a[2]) * t,
    a[3] + (b[3] * s - a[3]) * t,
  ]);
}

/** Closest points between segments p1-q1 and p2-q2; returns the squared distance and both points. */
export function segmentSegment(p1: V3, q1: V3, p2: V3, q2: V3): { dist2: number; c1: V3; c2: V3 } {
  const d1 = vSub(q1, p1);
  const d2 = vSub(q2, p2);
  const r = vSub(p1, p2);
  const a = vDot(d1, d1);
  const e = vDot(d2, d2);
  const f = vDot(d2, r);
  let s: number;
  let t: number;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = vDot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = vDot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1 = vMadd(p1, d1, s);
  const c2 = vMadd(p2, d2, t);
  const diff = vSub(c1, c2);
  return { dist2: vDot(diff, diff), c1, c2 };
}

/** Closest point on segment a-b to p. */
export function closestOnSegment(a: V3, b: V3, p: V3): V3 {
  const ab = vSub(b, a);
  const len2 = vDot(ab, ab);
  if (len2 < 1e-12) return [a[0], a[1], a[2]];
  return vMadd(a, ab, clamp01(vDot(vSub(p, a), ab) / len2));
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Tuple to Rapier vector. */
export const vec = (v: V3) => ({ x: v[0], y: v[1], z: v[2] });

/** Millimetre precision for public event and pose targets. */
const round3 = (value: number) => Math.round(value * 1000) / 1000;
export const point3 = (p: V3): V3 => [round3(p[0]), round3(p[1]), round3(p[2])];
