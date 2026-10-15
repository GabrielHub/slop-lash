// Small deterministic noise helpers for the stage: camera drift and shake,
// practical-light flicker, crowd murmur. Rendering only (the sim has its own
// deterministic math), so plain Math is fine here.

/** Integer hash to [0, 1). */
export function hash01(n: number, seed = 0): number {
  let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i, seed) * 2 - 1;
  const b = hash01(i + 1, seed) * 2 - 1;
  return a + (b - a) * fade(f);
}

/** Two octaves of value noise in roughly [-1, 1]. */
export function fbm1(x: number, seed = 0): number {
  return (noise1(x, seed) * 2 + noise1(x * 2.13 + 17.3, seed + 7)) / 3;
}

/** A stable seed from a string (light names, node names). */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Gentle emissive variation at time `t` seconds (0 = steady). Never drops out:
 * rapid tube stutters read as rendering defects, especially behind the crowd.
 * Incident light stays constant; only the visible emissive surface breathes.
 */
export function flickerAt(amount: number, t: number, channel = 0): number {
  if (amount <= 0) return 1;
  return 1 - Math.min(1, amount) * 0.1 * (0.5 + 0.5 * noise1(t * 0.65, channel));
}

/** Critically damped spring step toward a target (scalar). Returns [value, velocity]. */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  dt: number,
  halfLife: number,
): [number, number] {
  if (dt <= 0) return [value, velocity];
  const omega = (2 * 0.6931) / Math.max(halfLife, 1e-4);
  const x = value - target;
  const exp = Math.exp(-omega * dt);
  const temp = (velocity + omega * x) * dt;
  return [target + (x + temp) * exp, (velocity - omega * temp) * exp];
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export const easeInCubic = (t: number) => t * t * t;

/** Ease out with a small overshoot (squash in, overshoot, settle). */
export const easeOutBack = (t: number, overshoot = 1.7) => {
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
};
