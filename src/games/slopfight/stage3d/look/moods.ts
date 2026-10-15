// Per-arena light and grade presets. Each arena gets the same three-point
// stage rig (warm key, cool fill, strong rim) tinted to its mood, a coloured
// bounce instead of a plain hemisphere, fog tuned to the set's depth, a sky
// gradient so there is never a flat void behind the set, and a three-parameter
// grade (contrast, saturation, tint). Practical lights come from the set's
// Light_* empties and are scaled here.
//
// Palettes are warm-led on purpose. Never cyan with magenta (spec 7, avoid
// list): cool notes are green-teal (garage) or violet (kitchen fill, rooftop
// moonlight), and the rooftop's neon is amber and tangerine.

import type { ArenaId } from "../../arenas";

export type Vec3Tuple = readonly [number, number, number];

export interface RigLight {
  color: string;
  intensity: number;
  position: Vec3Tuple;
}

export interface ArenaMood {
  sky: { top: string; horizon: string; bottom: string; stars: number };
  fog: { color: string; near: number; far: number };
  bounce: { sky: string; ground: string; intensity: number };
  key: RigLight;
  fill: RigLight;
  rim: RigLight;
  /** Brightness of the toon dark band on the set (lower reads as night). */
  toonShade: number;
  /** Multiplier from the Blender light_intensity extra to three.js candela. */
  practicalScale: number;
  /** HDR multiplier for *_Emissive meshes, so only they cross the bloom threshold. */
  emissiveBoost: number;
  grade: { contrast: number; saturation: number; tint: string };
  bloom: { intensity: number; threshold: number; smoothing: number };
  vignette: number;
  /** Contact-shadow tint (never pure black). */
  shadow: string;
  /** The water surround's colours when the set has Hazard_Water. */
  water: { deep: string; shallow: string; sheen: string };
}

export const ARENA_MOODS: Readonly<Record<ArenaId, ArenaMood>> = {
  // Green-tinted fluorescent, wet reflections, a warm work lamp.
  FLOODED_GARAGE: {
    sky: { top: "#18241f", horizon: "#33463b", bottom: "#101814", stars: 0 },
    fog: { color: "#14251f", near: 13, far: 36 },
    bounce: { sky: "#a1cdbb", ground: "#302c23", intensity: 0.14 },
    key: { color: "#e8fff1", intensity: 0, position: [0, 5.15, -0.4] },
    fill: { color: "#8cbcac", intensity: 0.22, position: [-7, 3.2, 3.5] },
    rim: { color: "#eaffd6", intensity: 0, position: [-1.5, 2.6, -7.5] },
    toonShade: 0.25,
    practicalScale: 2.4,
    emissiveBoost: 3.2,
    grade: { contrast: 1.1, saturation: 1.06, tint: "#ecffe6" },
    bloom: { intensity: 0.9, threshold: 1.5, smoothing: 0.3 },
    vignette: 0.42,
    shadow: "#0f2a22",
    water: { deep: "#071510", shallow: "#18372e", sheen: "#759b83" },
  },
  // Warm evening window, butcher block, a lavender fill.
  KITCHEN_COUNTER: {
    sky: { top: "#3a2742", horizon: "#f2a26e", bottom: "#4f3229", stars: 0 },
    fog: { color: "#3c2d35", near: 16, far: 44 },
    bounce: { sky: "#e2bfa9", ground: "#5a3428", intensity: 0.14 },
    key: { color: "#ffe2b0", intensity: 0, position: [0, 7.2, 0.4] },
    fill: { color: "#a7a0d4", intensity: 0.22, position: [7, 2.8, 3] },
    rim: { color: "#ff9a4f", intensity: 0, position: [0.5, 2.4, -8] },
    toonShade: 0.27,
    practicalScale: 1.1,
    emissiveBoost: 3,
    grade: { contrast: 1.14, saturation: 1.04, tint: "#ffe8d2" },
    bloom: { intensity: 0.85, threshold: 1.5, smoothing: 0.3 },
    vignette: 0.38,
    shadow: "#3a1d14",
    water: { deep: "#3a4a52", shallow: "#7d98a4", sheen: "#fff0dc" },
  },
  // Night, a warm city glow on the horizon, amber neon, violet moonlight.
  ROOFTOP: {
    sky: { top: "#101526", horizon: "#51404a", bottom: "#171a2a", stars: 1 },
    fog: { color: "#151b2b", near: 16, far: 65 },
    bounce: { sky: "#6a75a8", ground: "#3a2018", intensity: 0.12 },
    // Authored floodlights replace the global key/rim, containing their light
    // on the ring. A trace of moon fill keeps the rest of the roof readable.
    key: { color: "#fff0d5", intensity: 0, position: [5, 7, 6] },
    fill: { color: "#a2a8e0", intensity: 0.1, position: [-7, 3, 2.5] },
    rim: { color: "#c6d5ff", intensity: 0, position: [-1, 2.2, -8] },
    toonShade: 0.2,
    practicalScale: 2,
    emissiveBoost: 3.4,
    grade: { contrast: 1.14, saturation: 1.02, tint: "#f4e6f0" },
    bloom: { intensity: 1, threshold: 1.5, smoothing: 0.3 },
    vignette: 0.45,
    shadow: "#1c0f1c",
    water: { deep: "#1c2030", shallow: "#3a3550", sheen: "#ffd9b0" },
  },
};

export function moodFor(arena: ArenaId): ArenaMood {
  return ARENA_MOODS[arena];
}
