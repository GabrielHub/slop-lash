import { describe, expect, test } from "vite-plus/test";
import {
  DRAWING_CANVAS_HEX,
  ERASER_INDEX,
  EYE_STYLE_INFO,
  EYE_STYLES,
  MOUTH_STYLE_INFO,
  MOUTH_STYLES,
  NEUTRAL_TRAITS,
  PHONE_PALETTE,
  PROP_INFO,
  PROP_TAGS,
  TOY_COLOR_VALUES,
  TOY_COLORS,
  TRAIT_INFO,
  TRAITS,
} from "./vocab";

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("traits", () => {
  test("cover the spec's required tags, about forty, unique, each with a line", () => {
    for (const trait of [
      "heavy",
      "slippery",
      "armed",
      "flammable",
      "electric",
      "aquatic",
      "tiny",
      "smug",
      "fragile",
      "sticky",
      "spiky",
      "cowardly",
      "relentless",
    ] as const) {
      expect(TRAITS).toContain(trait);
    }
    expect(TRAITS.length).toBeGreaterThanOrEqual(38);
    expect(TRAITS.length).toBeLessThanOrEqual(44);
    expect(new Set(TRAITS).size).toBe(TRAITS.length);
    for (const trait of TRAITS) {
      expect(TRAIT_INFO[trait].length).toBeGreaterThan(10);
      expect(TRAIT_INFO[trait].length).toBeLessThanOrEqual(70);
    }
    expect(NEUTRAL_TRAITS.length).toBeGreaterThanOrEqual(2);
  });
});

describe("toy colours", () => {
  test("twenty named, matte (never neon) colours with darker outline tints", () => {
    expect(TOY_COLORS).toHaveLength(20);
    for (const name of TOY_COLORS) {
      const { hex, dark } = TOY_COLOR_VALUES[name];
      expect(hex).toMatch(/^#[0-9A-F]{6}$/u);
      expect(dark).toMatch(/^#[0-9A-F]{6}$/u);
      expect(luminance(dark)).toBeLessThan(luminance(hex));
      expect(dark).not.toBe("#000000");
      const [r, g, b] = channels(hex);
      const max = Math.max(r, g, b);
      const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      expect(saturation).toBeLessThanOrEqual(0.85);
    }
  });
});

describe("phone palette", () => {
  test("six inks plus the eraser, each mapped to a toy colour and visible on the canvas", () => {
    expect(PHONE_PALETTE.map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5, ERASER_INDEX]);
    const inks = PHONE_PALETTE.filter((entry) => entry.index !== ERASER_INDEX);
    for (const ink of inks) {
      expect(ink.toy).not.toBeNull();
      expect(ink.hex).toBe(TOY_COLOR_VALUES[ink.toy!].hex);
      // Thick strokes, so 2:1 reads clearly; everything but orange clears 3:1.
      expect(contrast(ink.hex, DRAWING_CANVAS_HEX)).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(inks.map((ink) => ink.toy)).size).toBe(6);
    expect(PHONE_PALETTE.at(-1)!.toy).toBeNull();
  });
});

describe("face and props", () => {
  test("about ten eye and mouth styles, each described for the prompt", () => {
    expect(EYE_STYLES.length).toBeGreaterThanOrEqual(10);
    expect(MOUTH_STYLES.length).toBeGreaterThanOrEqual(10);
    for (const eyes of EYE_STYLES) expect(EYE_STYLE_INFO[eyes].length).toBeGreaterThan(5);
    for (const mouth of MOUTH_STYLES) expect(MOUTH_STYLE_INFO[mouth].length).toBeGreaterThan(5);
  });

  test("about twenty-five held items including the spec's ten and a generic thing", () => {
    for (const tag of [
      "knife",
      "bat",
      "umbrella",
      "leaf_blower",
      "fish",
      "briefcase",
      "wand",
      "pan",
      "trumpet",
      "laptop",
      "thing",
    ] as const) {
      expect(PROP_TAGS).toContain(tag);
    }
    expect(PROP_TAGS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(PROP_TAGS).size).toBe(PROP_TAGS.length);
    for (const tag of PROP_TAGS) expect(PROP_INFO[tag].description.length).toBeGreaterThan(5);
  });
});
