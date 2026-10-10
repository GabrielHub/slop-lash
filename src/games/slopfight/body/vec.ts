// Tiny 3-vector helpers for the body resolver. Plain tuples, no three.js, and
// only + - * / and Math.sqrt, so every JS engine computes the same bits (the
// fight sim builds its physics proxies from the resolved skeleton).

export type Vec3 = [number, number, number];

export const vec = (x: number, y: number, z: number): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
/** a + b * s */
export const madd = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Unit vector; `fallback` for a zero vector. */
export function normalize(a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 {
  const len = length(a);
  return len > 1e-9 ? [a[0] / len, a[1] / len, a[2] / len] : [...fallback];
}
/** Mirror across the creature's midline (x = 0). */
export const reflectX = (a: Vec3): Vec3 => [-a[0], a[1], a[2]];
export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;
