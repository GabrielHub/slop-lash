import type { AmbientPulseKind } from "@/lib/ambient-events";
import type { AmbientPalette, SpriteCache } from "./palette";

/**
 * What every field sees each frame. Energy, urgency, and mood arrive already
 * eased, so fields never jump.
 */
export interface FieldEnv {
  /** Viewport size in CSS pixels. */
  w: number;
  h: number;
  /** Device pixels per CSS pixel on the crisp layer. */
  dpr: number;
  /** Device pixels per CSS pixel on the soft (half-resolution) layer. */
  softScale: number;
  phone: boolean;
  palette: AmbientPalette;
  sprites: SpriteCache;
  /** Bumps whenever the palette or pixel ratio changes, so fields rebuild their sprites. */
  version: number;
  /** Seconds since the engine started. */
  t: number;
  /** Speed multiplier (energy, swell, urgency). */
  speed: number;
  /** Fraction of particles shown, 0-1. */
  density: number;
  /** Alpha multiplier (energy, swell). */
  alpha: number;
  /** 0-1: the last seconds of a countdown. */
  urgent: number;
  /** 0-1, eased; 0.5 when the game sets no mood. */
  mood: number;
  /** Particle count multiplier (surface, screen size, adaptive drop). */
  countScale: number;
  /** Pointer parallax offset in CSS pixels (desktop only). */
  px: number;
  py: number;
  /** The calm zone: an alpha multiplier that quietens the centre, where text lives, and clears the top band (the rail). */
  calm(x: number, y: number): number;
}

/** A pulse resolved to CSS pixels. */
export interface FieldPulse {
  kind: AmbientPulseKind;
  x: number;
  y: number;
  strength: number;
}

export interface FieldLayers {
  /** Full resolution (DPR capped at 1.5). */
  crisp: CanvasRenderingContext2D;
  /** Half resolution, upscaled by CSS: free blur for bokeh. */
  soft: CanvasRenderingContext2D;
}

/** One ambient scene. The engine owns the loop; a field owns its particles. */
export interface Field {
  /** Whether this field draws on the soft layer (so the engine clears it). */
  readonly usesSoft: boolean;
  /** Particles alive, for stats. */
  count(): number;
  /** (Re)builds particles for the current size and count, keeping what it can. */
  seed(env: FieldEnv): void;
  update(dt: number, env: FieldEnv): void;
  /** `alpha` is the crossfade weight while scenes change. */
  draw(layers: FieldLayers, env: FieldEnv, alpha: number): void;
  pulse(pulse: FieldPulse, env: FieldEnv): void;
}

/**
 * The shared physics of a reaction: a particle knocked outward by a pulse
 * (`kx`, `ky`, px/s, decaying) and lit up for a moment (`lift`, 0-1).
 */
export interface Mote {
  x: number;
  y: number;
  kx: number;
  ky: number;
  lift: number;
  /** 0-1: particles with `rank < density` are shown; this fades them in and out. */
  rank: number;
}

/** Pulses reach this fraction of the screen diagonal. */
const SHOCK_REACH = 0.35;

/**
 * The one shockwave every scene shares: particles within reach of the origin
 * get an outward impulse and an alpha lift, both proportional to closeness.
 */
export function shock(motes: readonly Mote[], pulse: FieldPulse, env: FieldEnv, impulse: number) {
  const reach = Math.hypot(env.w, env.h) * SHOCK_REACH;
  for (const mote of motes) {
    const dx = mote.x - pulse.x;
    const dy = mote.y - pulse.y;
    const d = Math.hypot(dx, dy);
    if (d >= reach) continue;
    const f = (1 - d / reach) * pulse.strength;
    const nx = d > 1 ? dx / d : Math.random() - 0.5;
    const ny = d > 1 ? dy / d : Math.random() - 0.5;
    mote.kx += nx * impulse * f;
    mote.ky += ny * impulse * f;
    mote.lift = Math.max(mote.lift, f);
  }
}

/** Decays a mote's impulse (about 350ms) and lift (about 600ms). */
export function relax(mote: Mote, dt: number) {
  const k = Math.exp(-dt / 0.35);
  mote.kx *= k;
  mote.ky *= k;
  mote.lift *= Math.exp(-dt / 0.6);
}

/** A mote's alpha from its density rank (soft edge) and lift (up to 1.8x). */
export function presence(mote: Mote, env: FieldEnv) {
  const shown = Math.min(1, Math.max(0, (env.density - mote.rank) / 0.08));
  return shown * (1 + 0.8 * mote.lift);
}

export function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Moves `value` toward `target` with time constant `tau` seconds. */
export function approach(value: number, target: number, dt: number, tau: number) {
  return target + (value - target) * Math.exp(-dt / tau);
}

/** Picks an index from cumulative-free weights, e.g. [0.7, 0.15, 0.1, 0.05]. */
export function pick(weights: readonly number[]) {
  let roll = Math.random();
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/** Wraps a coordinate into [-margin, size + margin). */
export function wrap(value: number, size: number, margin: number) {
  const span = size + margin * 2;
  return ((((value + margin) % span) + span) % span) - margin;
}
