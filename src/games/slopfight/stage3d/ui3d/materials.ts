// Shared materials and colours for the in-scene UI. Cards, chips, pips,
// tokens and plates all use the stage's toon material (lit by the rig, so
// they read as objects in the set) and its inverted-hull outline, tinted a
// dark version of their colour (never black). Materials are cached per
// colour and live as long as the page: the kit uses a small, fixed palette.

import { Color, DoubleSide, type Material, type Object3D } from "three";
import { TOY_COLOR_VALUES, TOY_COLORS, type ToyColor } from "../../vocab";
import { createOutlineMaterial, type OutlineMaterial } from "../look/outline";
import { createToonMaterial, type ToonMaterial } from "../look/toon";

/** The kit's house colours (cardstock, ink, accents). */
export const UI_COLORS = {
  /** Cream cardstock for cards and plates. */
  card: "#fbf1dc",
  /** The card's edge (a toasted cream). */
  cardEdge: "#d9b98a",
  /** Ink for text on cream. */
  ink: "#2b1d24",
  /** Dim ink (labels, empty pips). */
  inkDim: "#8a7a6e",
  /** The plum slab under The Voice's captions and dark cards. */
  plum: "#3a2138",
  plumEdge: "#24131f",
  /** Warm bone text on dark slabs. */
  bone: "#fff2d6",
  gold: "#f5c94c",
  tomato: TOY_COLOR_VALUES.tomato.hex,
  /** Empty pip / bar track. */
  track: "#4a3a44",
} as const;

/** Darken toward a warm ink (outlines are never pure black). */
export function darkOf(color: string, amount = 0.6): string {
  return `#${new Color(color).lerp(new Color("#1d1418"), amount).getHexString()}`;
}

/** Lighten toward warm white. */
export function lightOf(color: string, amount = 0.5): string {
  return `#${new Color(color).lerp(new Color("#fff6e6"), amount).getHexString()}`;
}

/** Relative luminance of a colour (linear, 0..1). */
export function luminance(color: string): number {
  const c = new Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * True for colours on which ink reads better than bone (the higher WCAG
 * contrast wins; mid tones such as tomato, moss and teal take ink).
 */
export function isLightColor(color: string): boolean {
  return contrastRatio(color, UI_COLORS.ink) >= contrastRatio(color, UI_COLORS.bone);
}

/** Text colour that reads on a surface of `color`: ink or bone, whichever contrasts more. */
export function textOn(color: string): string {
  return isLightColor(color) ? UI_COLORS.ink : UI_COLORS.bone;
}

/**
 * Self-glow for text drawn on a surface of `color` (StageText `glow`). Bone
 * text on a dark surface glows more, so it stays bright where the rig leaves
 * a card in shade instead of greying out; ink on a light surface keeps `base`.
 */
export function textGlowOn(color: string, base = 0.12): number {
  return isLightColor(color) ? base : Math.max(base, 0.62);
}

/**
 * A colour that stands out on cream cardstock: very light colours (cream,
 * white, butter) are darkened so a chip or a filled pip never vanishes into
 * the card.
 */
export function onCardTone(color: string): string {
  const l = luminance(color);
  return l > 0.3 ? darkOf(color, Math.min(0.5, 0.15 + (l - 0.3) * 0.9)) : color;
}

/** A toy colour's tuned hex. */
export function toyHex(color: ToyColor): string {
  return TOY_COLOR_VALUES[color].hex;
}

/**
 * The toy colour nearest to any hex (a player's colour on the TV stays in the
 * style sheet: matte, saturated, never neon).
 */
export function nearestToy(hex: string): ToyColor {
  const target = new Color(hex);
  let best: ToyColor = "bone";
  let bestDistance = Infinity;
  const candidate = new Color();
  for (const toy of TOY_COLORS) {
    if (toy === "charcoal" || toy === "bone" || toy === "sand") continue;
    candidate.set(TOY_COLOR_VALUES[toy].hex);
    const distance =
      (candidate.r - target.r) ** 2 * 0.9 + (candidate.g - target.g) ** 2 * 1.2 + (candidate.b - target.b) ** 2 * 0.8;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = toy;
    }
  }
  return best;
}

/**
 * The kit's lit surfaces stay under the arena moods' bloom threshold (1.5):
 * cream cardstock under a set's spots otherwise blooms into a veil over its
 * own text. Bloom is for the arena's emissives.
 */
export const UI_MAX_LUMINANCE = 1.4;

const toonCache = new Map<string, ToonMaterial>();
const outlineCache = new Map<string, OutlineMaterial>();

export interface UiToonOptions {
  /** Self-glow 0..1 so small type and pips never sink into shadow. */
  glow?: number;
  /** Both sides (thin chips seen from behind). */
  doubleSide?: boolean;
  /** Draw on top of the set (camera-fixed captions). */
  overlay?: boolean;
  /** Vinyl highlight strength (default 0.25: cardstock is mostly matte). */
  specular?: number;
}

/** A cached toon material in a flat colour. Do not mutate or dispose it. */
export function uiToon(color: string, options: UiToonOptions = {}): ToonMaterial {
  const glow = options.glow ?? 0.06;
  const key = `${color}|${glow}|${options.doubleSide ? 1 : 0}|${options.overlay ? 1 : 0}|${options.specular ?? 0.25}`;
  let material = toonCache.get(key);
  if (!material) {
    material = createToonMaterial({
      vertexColors: false,
      color,
      emissive: color,
      specular: options.specular ?? 0.25,
      rim: 0.22,
      translucency: 0.2,
      shade: 0.5,
      maxLuminance: UI_MAX_LUMINANCE,
    });
    material.emissiveIntensity = glow;
    if (options.doubleSide) material.side = DoubleSide;
    if (options.overlay) {
      // renderOrder only sorts within a render queue. Keep the caption in the
      // transparent queue so water, contact shadows and FX draw underneath it.
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;
      material.fog = false;
    }
    toonCache.set(key, material);
  }
  return material;
}

/**
 * Troika draws a text's outline with an Object.create copy of its material,
 * so the outline inherits the fill's emissive `glow` and shows as a pale ring
 * around the letters whatever its colour. Call once a text mesh has laid out
 * (before any glyph draws): from then on the copy gets its own zero
 * emissiveIntensity before it draws.
 */
export function keepOutlineDark(mesh: Object3D): void {
  if (Object.hasOwn(mesh, "onBeforeRender")) return;
  const render = mesh.onBeforeRender.bind(mesh);
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    const outline = material as Material & { isTextOutlineMaterial?: boolean; emissiveIntensity?: number };
    if (outline.isTextOutlineMaterial && !Object.hasOwn(outline, "emissiveIntensity")) outline.emissiveIntensity = 0;
    render(renderer, scene, camera, geometry, material, group);
  };
}

/** A cached outline (inverted hull) in a dark version of `color`. */
export function uiOutline(color: string, width = 2.2, options: { overlay?: boolean } = {}): OutlineMaterial {
  const key = `${color}|${width}|${options.overlay ? 1 : 0}`;
  let material = outlineCache.get(key);
  if (!material) {
    material = createOutlineMaterial({ color: darkOf(color, 0.62), width });
    if (options.overlay) {
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;
      material.fog = false;
    }
    outlineCache.set(key, material);
  }
  return material;
}
