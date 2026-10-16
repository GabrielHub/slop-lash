import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vite-plus/test";
import {
  crc32,
  EARLIER_LAYER_OPACITY,
  encodePng,
  rasterizeDoodle,
  RASTER_SIZE,
  renderDoodlePng,
  strokesPng,
  type RasterImage,
} from "./raster";
import type { Stroke, StrokeBatch } from "./strokes";
import { DRAWING_CANVAS_HEX, ERASER_INDEX, MATERIAL_INKS, PHONE_PALETTE } from "./vocab";

/** zlib with stored (uncompressed) deflate blocks: the smallest valid deflate, no node:zlib. */
function storedDeflate(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65_535));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let offset = 2;
  for (let block = 0; block < blocks; block += 1) {
    const start = block * 65_535;
    const length = Math.min(65_535, data.length - start);
    out[offset] = block === blocks - 1 ? 1 : 0;
    out[offset + 1] = length & 0xff;
    out[offset + 2] = length >> 8;
    out[offset + 3] = ~length & 0xff;
    out[offset + 4] = (~length >> 8) & 0xff;
    out.set(data.subarray(start, start + length), offset + 5);
    offset += 5 + length;
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  new DataView(out.buffer).setUint32(offset, ((b << 16) | a) >>> 0);
  return out;
}

const zlibDeflate = (data: Uint8Array) => new Uint8Array(deflateSync(data));

interface PngChunk {
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

function readPng(png: Uint8Array): { signatureOk: boolean; chunks: PngChunk[] } {
  const signatureOk = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
    (byte, index) => png[index] === byte,
  );
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    chunks.push({ type, data, crcOk: crc === crc32(png, offset + 4, offset + 8 + length) });
    offset += 12 + length;
  }
  return { signatureOk, chunks };
}

/** Decodes our own PNGs (filter 0 rows) back to RGBA. */
function decodePixels(png: Uint8Array): RasterImage {
  const { chunks } = readPng(png);
  const header = new DataView(chunks[0]!.data.buffer, chunks[0]!.data.byteOffset, 13);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  const raw = new Uint8Array(inflateSync(chunks.find((part) => part.type === "IDAT")!.data));
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    expect(raw[row * (width * 4 + 1)]).toBe(0);
    data.set(raw.subarray(row * (width * 4 + 1) + 1, (row + 1) * (width * 4 + 1)), row * width * 4);
  }
  return { width, height, data };
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function pixel(image: RasterImage, x: number, y: number): [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset]!,
    image.data[offset + 1]!,
    image.data[offset + 2]!,
    image.data[offset + 3]!,
  ];
}

/** Grid units to the pixel under them at 512. */
const at = (grid: number) => Math.floor((grid * RASTER_SIZE) / 1000);

const CREAM = rgb(DRAWING_CANVAS_HEX);
const CHARCOAL = rgb(PHONE_PALETTE[0].hex);
const TOMATO = rgb(PHONE_PALETTE[1].hex);

/** A stick-figure cat: head circle, body line, four legs, tail, red ears. */
const CAT: Stroke[] = [
  { c: 0, w: 1, p: [300, 300, 340, 260, 400, 250, 460, 260, 500, 300, 460, 340, 400, 350, 340, 340, 300, 300] },
  { c: 0, w: 1, p: [500, 300, 750, 320] },
  { c: 0, w: 1, p: [540, 310, 520, 500] },
  { c: 0, w: 1, p: [600, 315, 610, 500] },
  { c: 0, w: 1, p: [680, 318, 670, 500] },
  { c: 0, w: 1, p: [740, 320, 760, 500] },
  { c: 0, w: 1, p: [750, 320, 820, 220, 860, 200] },
  { c: 1, w: 1, p: [330, 270, 320, 200, 370, 255] },
  { c: 1, w: 1, p: [430, 255, 470, 200, 470, 270] },
];

describe("encodePng", () => {
  it("writes a valid 512 x 512 RGBA PNG for a known stroke set", () => {
    const png = strokesPng(CAT, storedDeflate);
    const { signatureOk, chunks } = readPng(png);
    expect(signatureOk).toBe(true);
    expect(chunks.map((part) => part.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(chunks.every((part) => part.crcOk)).toBe(true);
    const header = new DataView(chunks[0]!.data.buffer, chunks[0]!.data.byteOffset, 13);
    expect(header.getUint32(0)).toBe(512);
    expect(header.getUint32(4)).toBe(512);
    expect([...chunks[0]!.data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
    expect(chunks[2]!.data.length).toBe(0);
  });

  it("decodes to the pixels it encoded, with either deflate", () => {
    const image = rasterizeDoodle([{ layer: 0, seq: 0, strokes: CAT }], 0);
    const stored = decodePixels(encodePng(image, storedDeflate));
    const zipped = decodePixels(encodePng(image, zlibDeflate));
    // Buffer.equals: a deep toEqual over a megabyte of pixels takes seconds.
    expect(Buffer.from(stored.data).equals(Buffer.from(image.data))).toBe(true);
    expect(Buffer.from(zipped.data).equals(Buffer.from(image.data))).toBe(true);
    // A mostly cream canvas compresses a lot.
    expect(encodePng(image, zlibDeflate).length).toBeLessThan(40_000);
  });
});

describe("rasterizeDoodle", () => {
  it("renders blank input as an all-cream canvas", () => {
    const image = decodePixels(renderDoodlePng([], 0, zlibDeflate));
    expect(image.width).toBe(512);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (
        image.data[offset] !== CREAM[0] ||
        image.data[offset + 1] !== CREAM[1] ||
        image.data[offset + 2] !== CREAM[2] ||
        image.data[offset + 3] !== 255
      ) {
        throw new Error(`pixel ${offset / 4} is not cream`);
      }
    }
  });

  it("paints a thick round antialiased brush in the stroke's ink", () => {
    const image = rasterizeDoodle([{ layer: 0, seq: 0, strokes: CAT }], 0);
    // The middle of a leg is solid charcoal; the ear is tomato.
    expect(pixel(image, at(605), at(400)).slice(0, 3)).toEqual(CHARCOAL);
    expect(pixel(image, at(320), at(210)).slice(0, 3)).toEqual(TOMATO);
    // About 12 px wide at 512: solid 4 px off the line, cream 9 px off it.
    const legX = at(605);
    expect(pixel(image, legX + 4, at(400)).slice(0, 3)).toEqual(CHARCOAL);
    expect(pixel(image, legX + 9, at(400)).slice(0, 3)).toEqual(CREAM);
    // The edge pixels blend (antialiasing).
    const row = Array.from({ length: 10 }, (_, dx) => pixel(image, legX + dx, at(400))[0]);
    expect(row.some((value) => value !== CHARCOAL[0] && value !== CREAM[0])).toBe(true);
    expect(pixel(image, 10, 10).slice(0, 3)).toEqual(CREAM);
  });

  it("draws a single point as a round dot", () => {
    const image = rasterizeDoodle([{ layer: 0, seq: 0, strokes: [{ c: 4, w: 1, p: [500, 500] }] }], 0);
    expect(pixel(image, 256, 256).slice(0, 3)).toEqual(rgb(PHONE_PALETTE[4].hex));
    expect(pixel(image, 256, 270).slice(0, 3)).toEqual(CREAM);
  });

  it("paints a material ink as a tube: its bright core down the middle of its own colour", () => {
    for (const material of MATERIAL_INKS) {
      const image = rasterizeDoodle([{ layer: 0, seq: 0, strokes: [{ c: material.index, w: 1, p: [100, 500, 900, 500] }] }], 0);
      expect(pixel(image, at(500), at(500)).slice(0, 3)).toEqual(rgb(material.core));
      expect(pixel(image, at(500), at(500) + 5).slice(0, 3)).toEqual(rgb(material.hex));
      expect(pixel(image, at(500), at(500) + 9).slice(0, 3)).toEqual(CREAM);
    }
  });

  it("erases with the canvas colour", () => {
    const strokes: Stroke[] = [
      { c: 0, w: 1, p: [100, 500, 900, 500] },
      { c: ERASER_INDEX, w: 1, p: [500, 400, 500, 600] },
    ];
    const image = rasterizeDoodle([{ layer: 0, seq: 0, strokes }], 0);
    expect(pixel(image, at(500), at(500)).slice(0, 3)).toEqual(CREAM);
    expect(pixel(image, at(200), at(500)).slice(0, 3)).toEqual(CHARCOAL);
  });

  it("fades earlier layers to about 35% under an upgrade's new layer", () => {
    const batches: StrokeBatch[] = [
      { layer: 0, seq: 0, strokes: [{ c: 0, w: 1, p: [100, 300, 900, 300] }] },
      { layer: 1, seq: 0, strokes: [{ c: 1, w: 1, p: [100, 700, 900, 700] }] },
    ];
    const upgraded = rasterizeDoodle(batches, 1);
    const faded = pixel(upgraded, at(500), at(300));
    for (let channel = 0; channel < 3; channel += 1) {
      const expected = CREAM[channel]! + (CHARCOAL[channel]! - CREAM[channel]!) * EARLIER_LAYER_OPACITY;
      expect(Math.abs(faded[channel]! - expected)).toBeLessThanOrEqual(1);
    }
    expect(pixel(upgraded, at(500), at(700)).slice(0, 3)).toEqual(TOMATO);

    // Layer 0 alone, or an upgrade layer with no strokes, is drawn at full strength.
    expect(pixel(rasterizeDoodle(batches, 0), at(500), at(300)).slice(0, 3)).toEqual(CHARCOAL);
    expect(pixel(rasterizeDoodle(batches.slice(0, 1), 2), at(500), at(300)).slice(0, 3)).toEqual(
      CHARCOAL,
    );
    // Layers past the requested one are left out.
    expect(pixel(rasterizeDoodle(batches, 0), at(500), at(700)).slice(0, 3)).toEqual(CREAM);
  });
});
