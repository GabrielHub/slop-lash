// Seeded randomness for the fight sim: sfc32 (Small Fast Chaotic, 128-bit
// state) seeded through splitmix32. Integer-only state updates, so every
// engine draws the same sequence. Each consumer gets its own named stream
// (one per fighter brain, one for the referee), so one fighter's Chaos draws
// never shift the other's.

import { stableHash } from "../../../lib/hash";

export interface Rng {
  /** A uint32. */
  next(): number;
  /** A float in [0, 1). */
  float(): number;
  /** A float in [min, max). */
  range(min: number, max: number): number;
  /** A float in [-1, 1). */
  signed(): number;
  chance(probability: number): boolean;
  /** An integer in [0, count). */
  int(count: number): number;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  const mix = splitmix32(seed);
  let a = mix();
  let b = mix();
  let c = mix();
  let d = mix();
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Warm up so nearby seeds decorrelate.
  for (let index = 0; index < 12; index += 1) next();
  const float = () => next() / 4294967296;
  return {
    next,
    float,
    range: (min, max) => min + (max - min) * float(),
    signed: () => float() * 2 - 1,
    chance: (probability) => float() < probability,
    int: (count) => Math.floor(float() * count),
  };
}

/** A named stream derived from the fight seed: the same (seed, name) always draws the same numbers. */
export function rngStream(seed: number, name: string): Rng {
  return createRng(stableHash(`${seed >>> 0}:${name}`));
}
