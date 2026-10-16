// Strokes to pixels for the forge: the doodle the model sees is a 512 x 512
// PNG painted with the phone's round brush on the cream canvas. Pure
// TypeScript with the deflate step injected, so it runs in a Convex Node
// action (`node:zlib` deflateSync) and in tests alike. Nothing here is stored;
// the PNG goes straight into the forge call.

import { STROKE_GRID } from "./constants";
import {
  BRUSH_WIDTH,
  ERASER_WIDTH,
  isEraser,
  MATERIAL_CORE_WIDTH,
  strokesByLayer,
  type Stroke,
  type StrokeBatch,
} from "./strokes";
import { DRAWING_CANVAS_HEX, INKS, MATERIAL_INKS } from "./vocab";

/** The forge image size: about 350 input tokens on Claude, enough to count legs. */
export const RASTER_SIZE = 512;

/** How strongly earlier layers still show under an upgrade's new layer. */
export const EARLIER_LAYER_OPACITY = 0.35;

/** zlib-format compression (RFC 1950: header, deflate data, Adler-32), e.g. `deflateSync`. */
export type Deflate = (data: Uint8Array) => Uint8Array;

/** An 8-bit RGBA image, rows top to bottom. */
export interface RasterImage {
  width: number;
  height: number;
  data: Uint8Array;
}

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const CANVAS_RGB = hexToRgb(DRAWING_CANVAS_HEX);
/** Every ink by stroke colour index. */
const INK_RGB: readonly Rgb[] = INKS.map((ink) => hexToRgb(ink.hex));
/** A material ink's bright core, by stroke colour index. */
const CORE_RGB: ReadonlyMap<number, Rgb> = new Map(MATERIAL_INKS.map((ink) => [ink.index, hexToRgb(ink.core)]));

/** A blank cream canvas. */
export function blankRaster(size = RASTER_SIZE): RasterImage {
  const data = new Uint8Array(size * size * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = CANVAS_RGB[0];
    data[offset + 1] = CANVAS_RGB[1];
    data[offset + 2] = CANVAS_RGB[2];
    data[offset + 3] = 255;
  }
  return { width: size, height: size, data };
}

/**
 * Paints strokes in order onto `image` with an antialiased round brush (one
 * pixel of soft edge). Each stroke's coverage is the max over its segments,
 * so joints never double up; the eraser paints the canvas colour, and a
 * material ink paints its bright core down the middle of the stroke.
 */
export function paintStrokes(image: RasterImage, strokes: readonly Stroke[]): void {
  const scale = image.width / STROKE_GRID;
  const coverage = new Float32Array(image.width * image.height);
  for (const stroke of strokes) {
    if (stroke.p.length < 2) continue;
    const erase = isEraser(stroke);
    const radius = Math.max(1, ((erase ? ERASER_WIDTH : BRUSH_WIDTH) / 2) * scale);
    paintPath(image, coverage, stroke.p, scale, radius, erase ? CANVAS_RGB : (INK_RGB[stroke.c] ?? INK_RGB[0]!));
    const core = CORE_RGB.get(stroke.c);
    if (core) paintPath(image, coverage, stroke.p, scale, Math.max(1, radius * MATERIAL_CORE_WIDTH), core);
  }
}

/** One round-brush polyline in `color`; `coverage` is scratch space, left zeroed. */
function paintPath(
  image: RasterImage,
  coverage: Float32Array,
  points: readonly number[],
  scale: number,
  radius: number,
  color: Rgb,
): void {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const segment = (x0: number, y0: number, x1: number, y1: number) => {
    const reach = radius + 1;
    const left = Math.max(0, Math.floor(Math.min(x0, x1) - reach));
    const right = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + reach));
    const top = Math.max(0, Math.floor(Math.min(y0, y1) - reach));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + reach));
    if (left > right || top > bottom) return;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length2 = dx * dx + dy * dy;
    for (let py = top; py <= bottom; py += 1) {
      const cy = py + 0.5;
      for (let px = left; px <= right; px += 1) {
        const cx = px + 0.5;
        let t = length2 === 0 ? 0 : ((cx - x0) * dx + (cy - y0) * dy) / length2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x0 + t * dx - cx;
        const ey = y0 + t * dy - cy;
        const cover = radius + 0.5 - Math.sqrt(ex * ex + ey * ey);
        if (cover <= 0) continue;
        const index = py * width + px;
        const value = cover >= 1 ? 1 : cover;
        if (value > coverage[index]!) coverage[index] = value;
      }
    }
  };
  if (points.length === 2) {
    segment(points[0]! * scale, points[1]! * scale, points[0]! * scale, points[1]! * scale);
  }
  for (let index = 2; index + 1 < points.length; index += 2) {
    segment(
      points[index - 2]! * scale,
      points[index - 1]! * scale,
      points[index]! * scale,
      points[index + 1]! * scale,
    );
  }
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const index = py * width + px;
      const alpha = coverage[index]!;
      if (alpha === 0) continue;
      coverage[index] = 0;
      const offset = index * 4;
      data[offset] = Math.round(data[offset]! + (color[0] - data[offset]!) * alpha);
      data[offset + 1] = Math.round(data[offset + 1]! + (color[1] - data[offset + 1]!) * alpha);
      data[offset + 2] = Math.round(data[offset + 2]! + (color[2] - data[offset + 2]!) * alpha);
    }
  }
}

/** Blends every pixel toward the canvas colour so only `opacity` of the drawing shows. */
export function fadeRaster(image: RasterImage, opacity = EARLIER_LAYER_OPACITY): void {
  const { data } = image;
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.round(CANVAS_RGB[0] + (data[offset]! - CANVAS_RGB[0]) * opacity);
    data[offset + 1] = Math.round(CANVAS_RGB[1] + (data[offset + 1]! - CANVAS_RGB[1]) * opacity);
    data[offset + 2] = Math.round(CANVAS_RGB[2] + (data[offset + 2]! - CANVAS_RGB[2]) * opacity);
  }
}

/**
 * The doodle a forge sees: every layer up to `layer`. When `layer` > 0 and
 * that layer has strokes (an upgrade's addition), the earlier layers are
 * painted, faded to `EARLIER_LAYER_OPACITY`, and the new layer goes on top
 * at full strength, so the model can tell the addition from the champion.
 */
export function rasterizeDoodle(
  batches: readonly StrokeBatch[],
  layer: number,
  size = RASTER_SIZE,
): RasterImage {
  const image = blankRaster(size);
  const layers = strokesByLayer(batches).filter((group) => group.layer <= layer);
  const top = layer > 0 ? layers.find((group) => group.layer === layer) : undefined;
  const below = top ? layers.filter((group) => group !== top) : layers;
  paintStrokes(
    image,
    below.flatMap((group) => group.strokes),
  );
  if (top) {
    fadeRaster(image);
    paintStrokes(image, top.strokes);
  }
  return image;
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as PNG chunks use it (over the chunk type and data). */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
  return out;
}

/** Encodes an RGBA image as a PNG (8-bit RGBA, no interlace, filter 0 on every row). */
export function encodePng(image: RasterImage, deflate: Deflate): Uint8Array {
  const { width, height, data } = image;
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // compression, filter and interlace methods stay 0
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    raw.set(data.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** `rasterizeDoodle` encoded as PNG bytes: what the forge call attaches. */
export function renderDoodlePng(
  batches: readonly StrokeBatch[],
  layer: number,
  deflate: Deflate,
  size = RASTER_SIZE,
): Uint8Array {
  return encodePng(rasterizeDoodle(batches, layer, size), deflate);
}

/** Every stroke as one layer-0 batch, for callers holding loose strokes. */
export function strokesPng(strokes: readonly Stroke[], deflate: Deflate, size = RASTER_SIZE) {
  return renderDoodlePng([{ layer: 0, seq: 0, strokes }], 0, deflate, size);
}
