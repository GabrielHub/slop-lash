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
    fog: { color: "#26352e", near: 13, far: 36 },
    bounce: { sky: "#bfe6bf", ground: "#3f3424", intensity: 0.5 },
    key: { color: "#ffe2bd", intensity: 2.4, position: [4.5, 7.5, 6] },
    fill: { color: "#7fd0ae", intensity: 0.9, position: [-7, 3.2, 3.5] },
    rim: { color: "#eaffd6", intensity: 3.4, position: [-1.5, 2.6, -7.5] },
    toonShade: 0.42,
    practicalScale: 2.4,
    emissiveBoost: 3.2,
    grade: { contrast: 1.1, saturation: 1.06, tint: "#ecffe6" },
    bloom: { intensity: 0.9, threshold: 1.5, smoothing: 0.3 },
    vignette: 0.42,
    shadow: "#0f2a22",
    water: { deep: "#0f2b26", shallow: "#2d6b5a", sheen: "#d9f5d0" },
  },
  // Warm evening window, butcher block, a lavender fill.
  KITCHEN_COUNTER: {
    sky: { top: "#3a2742", horizon: "#f2a26e", bottom: "#4f3229", stars: 0 },
    fog: { color: "#6e4b45", near: 16, far: 44 },
    bounce: { sky: "#f6c9a0", ground: "#5a3428", intensity: 0.32 },
    key: { color: "#ffbf85", intensity: 1.8, position: [-5, 7, 6.5] },
    fill: { color: "#9d95e0", intensity: 0.6, position: [7, 2.8, 3] },
    rim: { color: "#ff9a4f", intensity: 3, position: [0.5, 2.4, -8] },
    toonShade: 0.4,
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
    sky: { top: "#1d1532", horizon: "#c4643c", bottom: "#2a1822", stars: 1 },
    fog: { color: "#3b2337", near: 18, far: 70 },
    bounce: { sky: "#6a5aa8", ground: "#3a2018", intensity: 0.3 },
    key: { color: "#ffac63", intensity: 1.35, position: [5, 7, 6] },
    fill: { color: "#8a7ce0", intensity: 1.05, position: [-7, 3, 2.5] },
    rim: { color: "#ff8c3c", intensity: 3, position: [-1, 2.2, -8] },
    toonShade: 0.3,
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
