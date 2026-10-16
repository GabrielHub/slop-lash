// How each finish looks, wobbles, bursts and sounds on the stage. Mechanics
// live in finishes.ts; this is the renderer's side. Pure TS (no three.js), so
// the mesher worker can use the colours.
//
// - FINISH_ID: the per-vertex id the toon shader branches on (look/toon.ts
//   SLOP_FINISH). It is the index in FINISHES, so vinyl is 0.
// - finishColor: the vertex colour tint baked by the mesher. The face's lids
//   sample it, so they match the part they sit on.
// - FINISH_WOBBLE: the jelly wobble's scale (rigid finishes barely wobble,
//   slime wobbles twice as much). The mesher blends it smoothly across seams.
// - FINISH_BURST and the sounds: the growth beat when a finished part lands,
//   and the extra layer on a hit that a finished part lands or takes.

import type { SfxName } from "../../audio";
import { FINISHES, type Finish } from "../../vocab";
import { clamp01 } from "../director/noise";
import type { Rgb } from "./paint";

export const FINISH_ID: Readonly<Record<Finish, number>> = Object.fromEntries(
  FINISHES.map((finish, index) => [finish, index]),
) as Record<Finish, number>;

/** The finish for a shader id (unknown ids are vinyl). */
export function finishOfId(id: number): Finish {
  return FINISHES[Math.round(id)] ?? "vinyl";
}

/** Jelly wobble scale per finish (breath, ripple and hit jiggle). */
export const FINISH_WOBBLE: Readonly<Record<Finish, number>> = {
  vinyl: 1,
  metal: 0.25,
  gold: 0.25,
  crystal: 0.25,
  stone: 0.25,
  wood: 0.25,
  ice: 0.25,
  lava: 1,
  slime: 2,
  glow: 1,
};

// Linear RGB anchors (sRGB hex in the comments).
const STEEL: Rgb = [0.4, 0.45, 0.52]; // #A9B3BF
const GOLD: Rgb = [0.86, 0.5, 0.075]; // #EEBA4E
const WOOD: Rgb = [0.32, 0.12, 0.037]; // #9A6236
const STONE: Rgb = [0.27, 0.254, 0.223]; // #8E8A82
const ICE: Rgb = [0.42, 0.7, 0.9]; // #ADDAF3
const CRUST: Rgb = [0.085, 0.042, 0.032]; // #523A33
const DIAMOND: Rgb = [0.86, 0.92, 1]; // #EFF5FF

export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRgb = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * The vertex colour of a finished part, from its vinyl colour `c` (linear,
 * floor shade included). `shade` is how much the floor shade darkened the
 * slot colour (1 above mid height), for finishes that replace the hue.
 */
export function finishColor(c: Rgb, finish: Finish, shade = 1): Rgb {
  switch (finish) {
    case "vinyl":
    case "glow":
      // Glow keeps the palette: the shader makes it emissive.
      return c;
    case "metal":
      // A hint of the palette hue over steel.
      return mixRgb(c, scaleRgb(STEEL, shade), 0.7);
    case "gold":
      return scaleRgb(GOLD, shade);
    case "crystal": {
      // Keep the hue, lift the value: red reads ruby, blue sapphire, bone diamond.
      const peak = Math.max(c[0], c[1], c[2], 1e-4);
      const lifted = scaleRgb(c, (peak + (1 - peak) * 0.2) / peak);
      // Saturated colours stay gems; pale ones whiten toward diamond.
      const white = 0.04 + 0.62 * smooth(0.3, 0.75, luminance(c));
      return mixRgb(lifted, scaleRgb(DIAMOND, shade), white);
    }
    case "stone": {
      const g = luminance(c);
      return mixRgb(mixRgb(c, [g, g, g], 0.85), scaleRgb(STONE, shade), 0.65);
    }
    case "wood":
      return mixRgb(c, scaleRgb(WOOD, shade), 0.72);
    case "ice":
      return mixRgb(c, scaleRgb(ICE, shade), 0.8);
    case "lava":
      return mixRgb(scaleRgb(c, 0.35), scaleRgb(CRUST, shade), 0.75);
    case "slime": {
      const g = luminance(c);
      const s: Rgb = [g + (c[0] - g) * 1.5, g + (c[1] - g) * 1.5, g + (c[2] - g) * 1.5];
      return [clamp01(s[0] * 1.05), clamp01(s[1] * 1.05), clamp01(s[2] * 1.05)];
    }
  }
}

/** The growth beat's burst for a finished part landing (vinyl keeps the plain puff). */
export type FinishBurst = "sparks" | "glints" | "dust" | "splinters" | "frost" | "embers" | "goo" | "ring";

export const FINISH_BURST: Readonly<Record<Finish, FinishBurst | null>> = {
  vinyl: null,
  metal: "sparks",
  gold: "sparks",
  crystal: "glints",
  stone: "dust",
  wood: "splinters",
  ice: "frost",
  lava: "embers",
  slime: "goo",
  glow: "ring",
};

/** Particle colours (sRGB hex) for a finish's bursts; `palette` stands in for the part's own colour. */
export function burstColors(finish: Finish, palette: string): readonly string[] {
  switch (finish) {
    case "metal":
      return ["#fff2c4", "#ffd27a", "#ffffff"];
    case "gold":
      return ["#ffe08a", "#ffc23d", "#fff6d6"];
    case "crystal":
      return ["#ffffff", "#e8f4ff", palette];
    case "stone":
      return ["#a59f94", "#8a847a", "#c2bcb0"];
    case "wood":
      return ["#a8703f", "#c48a52", "#7c4f2a"];
    case "ice":
      return ["#e6f8ff", "#bfe9f7", "#ffffff"];
    case "lava":
      return ["#ff8a2a", "#ffc04d", "#ff5a1f"];
    case "slime":
    case "glow":
    case "vinyl":
      return [palette];
  }
}

export interface FinishSound {
  name: SfxName;
  /** Gain of this layer under the main sound. */
  gain: number;
  intensity: number;
}

/** The sound a finished part makes as it lands on the growing body (over the part pop). */
export const FINISH_LAND_SOUND: Readonly<Record<Finish, FinishSound | null>> = {
  vinyl: null,
  metal: { name: "landingClang", gain: 0.45, intensity: 0.45 },
  gold: { name: "nameCardDing", gain: 0.55, intensity: 0.5 },
  crystal: { name: "sketchDissolve", gain: 0.45, intensity: 0.5 },
  stone: { name: "landingThud", gain: 0.6, intensity: 0.5 },
  wood: { name: "trickBonk", gain: 0.6, intensity: 0.45 },
  ice: { name: "healthCrunch", gain: 0.5, intensity: 0.4 },
  lava: { name: "healthCrunch", gain: 0.45, intensity: 0.65 },
  slime: { name: "landingSplash", gain: 0.45, intensity: 0.35 },
  glow: { name: "sketchDissolve", gain: 0.4, intensity: 0.6 },
};

/** The layer a finish adds to a hit's strike sound (a short one: hits come fast). */
export const FINISH_HIT_SOUND: Readonly<Record<Finish, FinishSound | null>> = {
  vinyl: null,
  metal: { name: "landingClang", gain: 0.55, intensity: 0.6 },
  gold: { name: "landingClang", gain: 0.5, intensity: 0.4 },
  crystal: { name: "nameCardDing", gain: 0.5, intensity: 0.5 },
  stone: { name: "landingThud", gain: 0.65, intensity: 0.6 },
  wood: { name: "trickBonk", gain: 0.6, intensity: 0.5 },
  ice: { name: "healthCrunch", gain: 0.6, intensity: 0.5 },
  lava: { name: "healthCrunch", gain: 0.5, intensity: 0.7 },
  slime: { name: "landingSplash", gain: 0.5, intensity: 0.4 },
  glow: { name: "nameCardDing", gain: 0.3, intensity: 0.4 },
};

export interface HitFinishLayer {
  finish: Finish;
  /** Which part made it: the target's (where it landed) or the attacker's (what landed). */
  from: "guard" | "attack";
  sound: FinishSound;
}

/**
 * The finish layers a hit adds: what it landed on first (a clang off a metal
 * body), then what landed it (a metal fist on vinyl), each once. Empty for a
 * vinyl-on-vinyl hit, which stays exactly as it was.
 */
export function hitFinishLayers(hit: { attackFinish?: Finish; guardFinish?: Finish }): HitFinishLayer[] {
  const layers: HitFinishLayer[] = [];
  const add = (finish: Finish | undefined, from: HitFinishLayer["from"]) => {
    if (!finish || finish === "vinyl" || layers.some((layer) => layer.finish === finish)) return;
    const sound = FINISH_HIT_SOUND[finish];
    if (sound) layers.push({ finish, from, sound: layers.length ? { ...sound, gain: sound.gain * 0.6 } : sound });
  };
  add(hit.guardFinish, "guard");
  add(hit.attackFinish, "attack");
  return layers;
}
