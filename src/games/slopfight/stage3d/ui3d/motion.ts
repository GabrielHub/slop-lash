// The in-scene UI's motion language (spec 6: "anticipation, overshoot,
// settle"): every element that appears squashes in and overshoots; every
// element that leaves anticipates first. Pure functions of time so they can
// be tested and shared by every kit component (cards, chips, plates, tokens).
//
// A pose is an offset from the element's rest transform: a translation, a
// non-uniform scale (squash and stretch, volume roughly kept) and a small
// rotation. Times are seconds since the beat started.

export interface MotionPose {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Rotation about the element's local X (tilt toward / away), radians. */
  rx: number;
  /** Rotation about local Z (swing), radians. */
  rz: number;
}

export function restPose(out: MotionPose = createPose()): MotionPose {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.sx = 1;
  out.sy = 1;
  out.sz = 1;
  out.rx = 0;
  out.rz = 0;
  return out;
}

export function createPose(): MotionPose {
  return { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rx: 0, rz: 0 };
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeInBack = (t: number, s = 1.70158) => {
  const x = clamp01(t);
  return (s + 1) * x * x * x - s * x * x;
};

/**
 * Step response of an underdamped spring from 0 to 1: rises past 1
 * (overshoot), rings and settles. `freq` in Hz, `damping` 0..1 (the ratio).
 */
export function springTo1(t: number, freq = 3, damping = 0.45): number {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = Math.min(0.999, Math.max(0.01, damping));
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** A decaying wobble around 0 (for squash after an impact): starts at `amount`. */
export function ringDown(t: number, amount: number, freq = 4, decay = 6): number {
  if (t < 0) return 0;
  return amount * Math.exp(-decay * t) * Math.cos(2 * Math.PI * freq * t);
}

/** Squash/stretch with volume roughly kept: sy = 1 + s, sx = sz = 1 / sqrt(sy). */
export function squashInto(out: MotionPose, stretch: number): MotionPose {
  const sy = Math.max(0.2, 1 + stretch);
  const side = 1 / Math.sqrt(sy);
  out.sx *= side;
  out.sy *= sy;
  out.sz *= side;
  return out;
}

export type EnterKind = "rise" | "drop" | "pop" | "none";

/** How long each entrance takes to settle (seconds). */
export const ENTER_SECONDS: Record<EnterKind, number> = { rise: 1.05, drop: 1.4, pop: 0.7, none: 0 };
export const EXIT_SECONDS = 0.5;

export interface EnterOptions {
  /** rise: how far below rest it starts; drop: how far above (world units). */
  distance?: number;
  /** Seed for small per-element variation (swing direction). */
  seed?: number;
}

/**
 * The entrance pose at `t` seconds. Returns true once settled.
 *
 * - rise: up from below (the floor hides it), stretched while it accelerates,
 *   overshoots above its mark, squashes as it settles.
 * - drop: down from the rig on a cable: stretched on the fall, a bounce at
 *   the end of the cable with a squash, and a swing that decays.
 * - pop: from nothing, overshooting to 1.15 with a little twist, then settles.
 */
export function enterPose(kind: EnterKind, t: number, out: MotionPose, options: EnterOptions = {}): boolean {
  restPose(out);
  const seedSign = (options.seed ?? 1) % 2 === 0 ? 1 : -1;
  switch (kind) {
    case "none":
      return true;
    case "rise": {
      const distance = options.distance ?? 1.4;
      if (t <= 0) {
        out.y = -distance;
        out.sy = 0.001;
        return false;
      }
      const s = springTo1(t, 1.7, 0.42);
      out.y = -distance * (1 - s);
      // Stretch while travelling fast, squash on the overshoot's turn.
      const v = (springTo1(t + 0.01, 1.7, 0.42) - s) / 0.01;
      squashInto(out, Math.min(0.28, v * distance * 0.05) - Math.max(0, s - 1) * 1.6);
      out.rx = -0.25 * (1 - Math.min(1, s));
      out.rz = seedSign * 0.05 * Math.exp(-3 * t) * Math.sin(t * 9);
      return t >= ENTER_SECONDS.rise;
    }
    case "drop": {
      const distance = options.distance ?? 3;
      const fall = 0.42;
      if (t < fall) {
        // Gravity-ish acceleration, stretched along the fall.
        const p = easeInCubic(t / fall);
        out.y = distance * (1 - p);
        squashInto(out, 0.22 * p);
        out.rz = seedSign * 0.08 * (1 - p);
        return false;
      }
      const after = t - fall;
      // The cable catches: a vertical bounce, a squash, and a decaying swing.
      out.y = -0.16 * Math.exp(-5 * after) * Math.sin(2 * Math.PI * 2.4 * after);
      squashInto(out, ringDown(after, -0.24, 3.2, 7));
      out.rz = seedSign * ringDown(after, 0.12, 0.9, 2.4);
      return t >= ENTER_SECONDS.drop;
    }
    case "pop": {
      if (t <= 0) {
        out.sx = out.sy = out.sz = 0.001;
        return false;
      }
      const s = springTo1(t, 2.6, 0.38);
      out.sx = out.sy = out.sz = Math.max(0.001, s);
      squashInto(out, ringDown(t, 0.18, 3.5, 6));
      out.rz = seedSign * ringDown(t, 0.18, 2.2, 5);
      return t >= ENTER_SECONDS.pop;
    }
  }
}

/**
 * The exit ("flick off"): a short anticipation (dip and squash), then a
 * flick up and sideways with a spin, shrinking away. Returns true when gone.
 */
export function exitPose(t: number, out: MotionPose, options: { seed?: number } = {}): boolean {
  restPose(out);
  const side = (options.seed ?? 1) % 2 === 0 ? 1 : -1;
  const anticipate = 0.13;
  if (t < anticipate) {
    const p = easeOutCubic(t / anticipate);
    out.y = -0.06 * p;
    squashInto(out, -0.18 * p);
    out.rz = -side * 0.06 * p;
    return false;
  }
  const p = clamp01((t - anticipate) / (EXIT_SECONDS - anticipate));
  const e = easeInBack(p, 1.2);
  out.y = -0.06 + 1.6 * e;
  out.x = side * 0.9 * e;
  squashInto(out, 0.3 * Math.sin(Math.PI * Math.min(1, p * 1.4)));
  out.rz = side * (-0.06 + 1.4 * e);
  const shrink = Math.max(0.001, 1 - easeInCubic(p));
  out.sx *= shrink;
  out.sy *= shrink;
  out.sz *= shrink;
  return t >= EXIT_SECONDS;
}

/** Idle life so nothing is ever static: a slow bob and sway, per-element phase. */
export function idlePose(t: number, out: MotionPose, options: { seed?: number; amount?: number; hanging?: boolean } = {}): MotionPose {
  const seed = options.seed ?? 0;
  const amount = options.amount ?? 1;
  const phase = seed * 1.618;
  out.y += Math.sin(t * 1.25 + phase) * 0.008 * amount;
  out.rz += Math.sin(t * (options.hanging ? 1.1 : 0.8) + phase * 2.1) * (options.hanging ? 0.035 : 0.012) * amount;
  out.rx += Math.sin(t * 0.7 + phase * 0.7) * 0.01 * amount;
  return out;
}

export interface Arc {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  /** Peak height above the higher end. */
  height: number;
  duration: number;
}

/**
 * Flight along an arc from `from` to `to` (fly-to, a token tossed from the
 * crowd): a wind-up away from the target, a parabolic flight stretched along
 * its speed, then a landing squash and bounce. Writes the absolute position
 * into out.x/y/z (not an offset). Returns true once landed and settled.
 */
export function arcPose(arc: Arc, t: number, out: MotionPose): boolean {
  restPose(out);
  const windup = 0.14;
  const dx = arc.toX - arc.fromX;
  const dy = arc.toY - arc.fromY;
  const dz = arc.toZ - arc.fromZ;
  if (t < windup) {
    const p = Math.sin((Math.PI / 2) * (t / windup));
    const len = Math.max(1e-6, Math.hypot(dx, dz));
    out.x = arc.fromX - (dx / len) * 0.08 * p;
    out.y = arc.fromY - 0.04 * p;
    out.z = arc.fromZ - (dz / len) * 0.08 * p;
    squashInto(out, -0.16 * p);
    return false;
  }
  const flightT = t - windup;
  const p = clamp01(flightT / arc.duration);
  // Slightly eased so it launches fast and floats at the top.
  const s = p < 1 ? 1 - (1 - p) * (1 - p) * 0.35 - 0.65 * (1 - p) : 1;
  const peak = Math.max(arc.fromY, arc.toY) + arc.height - (arc.fromY + arc.toY) / 2;
  out.x = arc.fromX + dx * s;
  out.y = arc.fromY + dy * s + 4 * peak * s * (1 - s);
  out.z = arc.fromZ + dz * s;
  if (p < 1) {
    squashInto(out, 0.22 * Math.sin(Math.PI * p));
    out.rz = -Math.sign(dx || 1) * 0.6 * Math.sin(Math.PI * p);
    return false;
  }
  const after = flightT - arc.duration;
  out.y += Math.max(0, 0.09 * Math.exp(-7 * after) * Math.sin(2 * Math.PI * 2.6 * after));
  squashInto(out, ringDown(after, -0.32, 3.4, 7));
  return after >= 0.7;
}

/** How long an arc flight takes for a given distance (a readable toss, never a teleport). */
export function arcDuration(distance: number): number {
  return Math.min(1.25, 0.45 + distance * 0.07);
}
