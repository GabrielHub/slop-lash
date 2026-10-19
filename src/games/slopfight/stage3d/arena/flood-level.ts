// The Flooded Garage finale's water height as the stage draws it: the flood
// sheet over the pad and the surround rising toward the pad top. Pure
// TypeScript (no three.js), so the set, the conductor's splashes and the
// playback's landing scan agree.

import type { ArenaGeometry, FloodFinale } from "../../arenas";

/** The surround's rise at full flood: from surround.y to just under the pad top (its baked ripples stay below it). */
export const FLOOD_SURROUND_RISE = 0.29;

/** How far the surround has risen (m) at a finale strength. It runs ahead of the sheet, so the pad's sides go under first. */
export function floodRiseAt(strength: number): number {
  const x = Math.min(1, strength * 1.8);
  return FLOOD_SURROUND_RISE * x * x * (3 - 2 * x);
}

/** The water's surface at (x, z): the flood sheet over the pad, else the surround (risen with the flood). */
export function waterSurfaceAt(geometry: ArenaGeometry, flood: FloodFinale | null, strength: number, x: number, z: number): number {
  if (!flood || strength <= 0) return geometry.surround.y;
  if (Math.max(Math.abs(x), Math.abs(z)) <= geometry.halfSize) return flood.waterY;
  return geometry.surround.y + floodRiseAt(strength);
}
