import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { contoursToShapes, createTitleGeometry, inflateZlib, parseWoff, type WoffFont } from "./font-geometry";

const FONT = join(process.cwd(), "public/fonts/slopfight/fredoka-latin-700-normal.woff");

let font: WoffFont;

const fontBuffer = () => {
  const bytes = readFileSync(FONT);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

beforeAll(() => {
  font = parseWoff(fontBuffer());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const gid = (char: string) => font.glyphIndex(char.codePointAt(0)!);

describe("parseWoff (Fredoka 700)", () => {
  it("reads the metrics, the character map and the advances", () => {
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.ascender).toBeGreaterThan(0);
    for (const char of "ABCXYZ0129!?-") {
      expect(gid(char), char).toBeGreaterThan(0);
      expect(font.advance(gid(char)), char).toBeGreaterThan(0);
    }
    expect(font.advance(gid("W"))).toBeGreaterThan(font.advance(gid("I")));
  });

  it("reads outlines: O has an outer contour and a counter", () => {
    expect(font.outline(gid("O"))).toHaveLength(2);
    expect(font.outline(gid("L")).length).toBeGreaterThanOrEqual(1);
    expect(font.outline(gid(" "))).toHaveLength(0);
    const shapes = contoursToShapes(font.outline(gid("O")), 0.001, 0);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.holes).toHaveLength(1);
  });

  it("reads pair kerning from GPOS", () => {
    const pairs = ["AV", "AT", "TA", "LT", "VA", "AY", "To", "Te"];
    const kerned = pairs.filter((pair) => font.kerning(gid(pair[0]!), gid(pair[1]!)) !== 0);
    expect(kerned.length).toBeGreaterThan(0);
  });
});

describe("reading the font without DecompressionStream (older TV browsers)", () => {
  it("inflates zlib data in pure JS", () => {
    const original = new TextEncoder().encode("SLOPFIGHT ".repeat(200));
    const packed = new Uint8Array(deflateSync(original));
    expect(Array.from(inflateZlib(packed))).toEqual(Array.from(original));
    expect(Array.from(inflateZlib(packed, original.length))).toEqual(Array.from(original));
  });

  it("parses the shipped font with DecompressionStream undefined", () => {
    vi.stubGlobal("DecompressionStream", undefined);
    expect(typeof globalThis.DecompressionStream).toBe("undefined");
    const parsed = parseWoff(fontBuffer());
    expect(parsed.numGlyphs).toBe(font.numGlyphs);
    expect(parsed.outline(parsed.glyphIndex(0x4f))).toHaveLength(2);
  });

  it("throws (rather than hanging) on a file it cannot read", () => {
    expect(() => parseWoff(new TextEncoder().encode("not a font at all, sorry").buffer)).toThrow();
    const truncated = fontBuffer().slice(0, 600);
    expect(() => parseWoff(truncated)).toThrow();
  });
});

describe("createTitleGeometry", () => {
  it("builds one centred, two-group geometry", () => {
    const { geometry, width, height } = createTitleGeometry(font, "FIGHT!", { size: 1 });
    expect(width).toBeGreaterThan(2);
    expect(height).toBe(1);
    expect(geometry.groups).toHaveLength(2);
    expect(geometry.groups[0]!.count).toBeGreaterThan(0);
    expect(geometry.groups[1]!.count).toBeGreaterThan(0);
    const box = geometry.boundingBox!;
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.2);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.9);
    geometry.dispose();
  });
});
