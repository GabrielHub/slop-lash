// A small WOFF (1.0, TrueType-flavoured) reader for extruded 3D titles: the
// glyph outlines (glyf, simple and composite), the character map (cmap
// format 4 / 12), advances (hmtx) and pair kerning (GPOS PairPos, formats 1
// and 2). three.js's own TTFLoader pulls opentype.js from a CDN, and the
// typeface-JSON route needs a build step, so the stage reads the shipped
// Fredoka WOFF directly. Tables are zlib-inflated with the fflate build that
// ships inside three (synchronous, pure JS): DecompressionStream is missing
// from older TV browsers (Chromium < 80), Safari < 16.4 and Firefox < 113.
// Layout is single-line, left to right: what a title needs, nothing more.

import { ExtrudeGeometry, BufferGeometry, Float32BufferAttribute, ShapePath, type Shape } from "three";
import { unzlibSync } from "three/examples/jsm/libs/fflate.module.js";

export interface GlyphPoint {
  x: number;
  y: number;
  on: boolean;
}
export type Contour = GlyphPoint[];

interface TableEntry {
  offset: number;
  compLength: number;
  origLength: number;
}

const tag = (view: DataView, offset: number) =>
  String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

/** Inflate a zlib stream (WOFF tables use zlib's format: deflate with a 2-byte header). */
export function inflateZlib(data: Uint8Array, originalLength?: number): Uint8Array {
  return unzlibSync(data, originalLength !== undefined ? { out: new Uint8Array(originalLength) } : undefined);
}

export class WoffFont {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly numGlyphs: number;
  private readonly cmap = new Map<number, number>();
  private readonly advances: Uint16Array;
  private readonly glyphOffsets: Uint32Array;
  private readonly glyf: DataView;
  private readonly kernPairs = new Map<number, number>();
  private readonly kernClasses: Array<{
    coverage: Map<number, number>;
    class1: Map<number, number>;
    class2: Map<number, number>;
    class2Count: number;
    values: Int16Array;
  }> = [];
  private readonly outlineCache = new Map<number, Contour[]>();

  constructor(tables: Map<string, DataView>) {
    const need = (name: string) => {
      const table = tables.get(name);
      if (!table) throw new Error(`font has no ${name} table`);
      return table;
    };
    const head = need("head");
    const hhea = need("hhea");
    const maxp = need("maxp");
    const hmtx = need("hmtx");
    const loca = need("loca");
    this.glyf = need("glyf");
    this.unitsPerEm = head.getUint16(18);
    const longLoca = head.getInt16(50) === 1;
    this.ascender = hhea.getInt16(4);
    this.descender = hhea.getInt16(6);
    const metrics = hhea.getUint16(34);
    this.numGlyphs = maxp.getUint16(4);

    this.advances = new Uint16Array(this.numGlyphs);
    let last = 0;
    for (let gid = 0; gid < this.numGlyphs; gid += 1) {
      if (gid < metrics) last = hmtx.getUint16(gid * 4);
      this.advances[gid] = last;
    }
    this.glyphOffsets = new Uint32Array(this.numGlyphs + 1);
    for (let gid = 0; gid <= this.numGlyphs; gid += 1) {
      this.glyphOffsets[gid] = longLoca ? loca.getUint32(gid * 4) : loca.getUint16(gid * 2) * 2;
    }
    this.readCmap(need("cmap"));
    const gpos = tables.get("GPOS");
    if (gpos) {
      try {
        this.readKerning(gpos);
      } catch {
        // Kerning is a nicety; a GPOS we cannot read just means none.
        this.kernPairs.clear();
        this.kernClasses.length = 0;
      }
    }
  }

  glyphIndex(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  advance(gid: number): number {
    return this.advances[gid] ?? 0;
  }

  /** Pair adjustment to the first glyph's advance, font units. */
  kerning(left: number, right: number): number {
    const pair = this.kernPairs.get(left * 65536 + right);
    if (pair !== undefined) return pair;
    for (const table of this.kernClasses) {
      if (!table.coverage.has(left)) continue;
      const c1 = table.class1.get(left) ?? 0;
      const c2 = table.class2.get(right) ?? 0;
      const value = table.values[c1 * table.class2Count + c2] ?? 0;
      if (value !== 0) return value;
    }
    return 0;
  }

  /** The glyph's contours in font units (composites resolved). */
  outline(gid: number, depth = 0): Contour[] {
    const cached = this.outlineCache.get(gid);
    if (cached) return cached;
    const start = this.glyphOffsets[gid] ?? 0;
    const end = this.glyphOffsets[gid + 1] ?? start;
    let contours: Contour[] = [];
    if (end > start && depth < 8) {
      const count = this.glyf.getInt16(start);
      contours = count >= 0 ? this.simpleGlyph(start, count) : this.compositeGlyph(start, depth);
    }
    this.outlineCache.set(gid, contours);
    return contours;
  }

  private simpleGlyph(start: number, count: number): Contour[] {
    const view = this.glyf;
    let p = start + 10;
    const ends: number[] = [];
    for (let i = 0; i < count; i += 1) {
      ends.push(view.getUint16(p));
      p += 2;
    }
    const points = count > 0 ? ends[count - 1]! + 1 : 0;
    const instructions = view.getUint16(p);
    p += 2 + instructions;
    const flags = new Uint8Array(points);
    for (let i = 0; i < points; ) {
      const flag = view.getUint8(p++);
      flags[i++] = flag;
      if (flag & 8) {
        let repeat = view.getUint8(p++);
        while (repeat-- > 0 && i < points) flags[i++] = flag;
      }
    }
    const xs = new Int32Array(points);
    const ys = new Int32Array(points);
    let x = 0;
    for (let i = 0; i < points; i += 1) {
      const flag = flags[i]!;
      if (flag & 2) {
        const dx = view.getUint8(p++);
        x += flag & 16 ? dx : -dx;
      } else if (!(flag & 16)) {
        x += view.getInt16(p);
        p += 2;
      }
      xs[i] = x;
    }
    let y = 0;
    for (let i = 0; i < points; i += 1) {
      const flag = flags[i]!;
      if (flag & 4) {
        const dy = view.getUint8(p++);
        y += flag & 32 ? dy : -dy;
      } else if (!(flag & 32)) {
        y += view.getInt16(p);
        p += 2;
      }
      ys[i] = y;
    }
    const contours: Contour[] = [];
    let first = 0;
    for (const last of ends) {
      const contour: Contour = [];
      for (let i = first; i <= last; i += 1) contour.push({ x: xs[i]!, y: ys[i]!, on: (flags[i]! & 1) === 1 });
      if (contour.length > 1) contours.push(contour);
      first = last + 1;
    }
    return contours;
  }

  private compositeGlyph(start: number, depth: number): Contour[] {
    const view = this.glyf;
    let p = start + 10;
    const contours: Contour[] = [];
    let more = true;
    while (more) {
      const flags = view.getUint16(p);
      const component = view.getUint16(p + 2);
      p += 4;
      let dx = 0;
      let dy = 0;
      if (flags & 1) {
        dx = view.getInt16(p);
        dy = view.getInt16(p + 2);
        p += 4;
      } else {
        dx = view.getInt8(p);
        dy = view.getInt8(p + 1);
        p += 2;
      }
      if (!(flags & 2)) {
        // Point-matched placement is rare in Latin fonts; treat as no offset.
        dx = 0;
        dy = 0;
      }
      let a = 1;
      let b = 0;
      let c = 0;
      let d = 1;
      const f2dot14 = (offset: number) => view.getInt16(offset) / 16384;
      if (flags & 8) {
        a = d = f2dot14(p);
        p += 2;
      } else if (flags & 0x40) {
        a = f2dot14(p);
        d = f2dot14(p + 2);
        p += 4;
      } else if (flags & 0x80) {
        a = f2dot14(p);
        b = f2dot14(p + 2);
        c = f2dot14(p + 4);
        d = f2dot14(p + 6);
        p += 8;
      }
      for (const contour of this.outline(component, depth + 1)) {
        contours.push(contour.map((pt) => ({ x: pt.x * a + pt.y * c + dx, y: pt.x * b + pt.y * d + dy, on: pt.on })));
      }
      more = (flags & 0x20) !== 0;
    }
    return contours;
  }

  private readCmap(view: DataView): void {
    const count = view.getUint16(2);
    let best: { offset: number; format: number } | null = null;
    for (let i = 0; i < count; i += 1) {
      const platform = view.getUint16(4 + i * 8);
      const encoding = view.getUint16(6 + i * 8);
      const offset = view.getUint32(8 + i * 8);
      const format = view.getUint16(offset);
      const unicode = (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0;
      if (!unicode || (format !== 4 && format !== 12)) continue;
      if (!best || format === 12) best = { offset, format };
    }
    if (!best) throw new Error("font has no unicode cmap");
    const o = best.offset;
    if (best.format === 12) {
      const groups = view.getUint32(o + 12);
      for (let g = 0; g < groups; g += 1) {
        const startChar = view.getUint32(o + 16 + g * 12);
        const endChar = view.getUint32(o + 20 + g * 12);
        const startGlyph = view.getUint32(o + 24 + g * 12);
        for (let ch = startChar; ch <= endChar && ch - startChar < 0x10000; ch += 1) {
          this.cmap.set(ch, startGlyph + ch - startChar);
        }
      }
      return;
    }
    const segments = view.getUint16(o + 6) / 2;
    const endsAt = o + 14;
    const startsAt = endsAt + segments * 2 + 2;
    const deltasAt = startsAt + segments * 2;
    const rangesAt = deltasAt + segments * 2;
    for (let s = 0; s < segments; s += 1) {
      const end = view.getUint16(endsAt + s * 2);
      const begin = view.getUint16(startsAt + s * 2);
      const delta = view.getInt16(deltasAt + s * 2);
      const rangeOffset = view.getUint16(rangesAt + s * 2);
      for (let ch = begin; ch <= end && ch !== 0xffff; ch += 1) {
        let gid: number;
        if (rangeOffset === 0) gid = (ch + delta) & 0xffff;
        else {
          const at = rangesAt + s * 2 + rangeOffset + (ch - begin) * 2;
          gid = view.getUint16(at);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) this.cmap.set(ch, gid);
      }
    }
  }

  private readKerning(view: DataView): void {
    const featureList = view.getUint16(6);
    const lookupList = view.getUint16(8);
    const lookups = new Set<number>();
    const features = view.getUint16(featureList);
    for (let i = 0; i < features; i += 1) {
      const record = featureList + 2 + i * 6;
      if (tag(view, record) !== "kern") continue;
      const feature = featureList + view.getUint16(record + 4);
      const count = view.getUint16(feature + 2);
      for (let k = 0; k < count; k += 1) lookups.add(view.getUint16(feature + 4 + k * 2));
    }
    for (const index of lookups) {
      const lookup = lookupList + view.getUint16(lookupList + 2 + index * 2);
      let type = view.getUint16(lookup);
      const subtables = view.getUint16(lookup + 4);
      for (let s = 0; s < subtables; s += 1) {
        let sub = lookup + view.getUint16(lookup + 6 + s * 2);
        if (type === 9) {
          // Extension: the real subtable sits behind a 32-bit offset.
          type = view.getUint16(sub + 2);
          sub = sub + view.getUint32(sub + 4);
        }
        if (type === 2) this.readPairPos(view, sub);
      }
    }
  }

  private readPairPos(view: DataView, sub: number): void {
    const format = view.getUint16(sub);
    const coverage = readCoverage(view, sub + view.getUint16(sub + 2));
    const format1 = view.getUint16(sub + 4);
    const format2 = view.getUint16(sub + 6);
    const size1 = valueSize(format1);
    const size2 = valueSize(format2);
    const xAdvance = (offset: number) => (format1 & 4 ? view.getInt16(offset + valueOffset(format1, 4)) : 0);
    if (format === 1) {
      const sets = view.getUint16(sub + 8);
      for (const [glyph, index] of coverage) {
        if (index >= sets) continue;
        const set = sub + view.getUint16(sub + 10 + index * 2);
        const count = view.getUint16(set);
        const record = 2 + size1 + size2;
        for (let r = 0; r < count; r += 1) {
          const at = set + 2 + r * record;
          const second = view.getUint16(at);
          const value = xAdvance(at + 2);
          if (value !== 0 && !this.kernPairs.has(glyph * 65536 + second)) this.kernPairs.set(glyph * 65536 + second, value);
        }
      }
    } else if (format === 2) {
      const class1 = readClassDef(view, sub + view.getUint16(sub + 8));
      const class2 = readClassDef(view, sub + view.getUint16(sub + 10));
      const class1Count = view.getUint16(sub + 12);
      const class2Count = view.getUint16(sub + 14);
      const values = new Int16Array(class1Count * class2Count);
      const record = size1 + size2;
      for (let c1 = 0; c1 < class1Count; c1 += 1) {
        for (let c2 = 0; c2 < class2Count; c2 += 1) {
          values[c1 * class2Count + c2] = xAdvance(sub + 16 + (c1 * class2Count + c2) * record);
        }
      }
      this.kernClasses.push({ coverage, class1, class2, class2Count, values });
    }
  }
}

const bits = (value: number) => {
  let n = 0;
  for (let v = value; v; v &= v - 1) n += 1;
  return n;
};
const valueSize = (format: number) => bits(format & 0xff) * 2;
/** Byte offset of `field` (a ValueFormat bit) inside a value record. */
const valueOffset = (format: number, field: number) => bits(format & (field - 1)) * 2;

function readCoverage(view: DataView, at: number): Map<number, number> {
  const map = new Map<number, number>();
  const format = view.getUint16(at);
  const count = view.getUint16(at + 2);
  if (format === 1) {
    for (let i = 0; i < count; i += 1) map.set(view.getUint16(at + 4 + i * 2), i);
  } else if (format === 2) {
    for (let r = 0; r < count; r += 1) {
      const start = view.getUint16(at + 4 + r * 6);
      const end = view.getUint16(at + 6 + r * 6);
      const index = view.getUint16(at + 8 + r * 6);
      for (let g = start; g <= end; g += 1) map.set(g, index + g - start);
    }
  }
  return map;
}

function readClassDef(view: DataView, at: number): Map<number, number> {
  const map = new Map<number, number>();
  const format = view.getUint16(at);
  if (format === 1) {
    const startGlyph = view.getUint16(at + 2);
    const count = view.getUint16(at + 4);
    for (let i = 0; i < count; i += 1) map.set(startGlyph + i, view.getUint16(at + 6 + i * 2));
  } else if (format === 2) {
    const count = view.getUint16(at + 2);
    for (let r = 0; r < count; r += 1) {
      const start = view.getUint16(at + 4 + r * 6);
      const end = view.getUint16(at + 6 + r * 6);
      const value = view.getUint16(at + 8 + r * 6);
      for (let g = start; g <= end; g += 1) map.set(g, value);
    }
  }
  return map;
}

/** Read a WOFF 1.0 file (TrueType outlines). Throws on anything it cannot read. */
export function parseWoff(buffer: ArrayBuffer): WoffFont {
  const view = new DataView(buffer);
  if (tag(view, 0) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  if (view.getUint32(4) !== 0x00010000) throw new Error("only TrueType-flavoured WOFF is supported");
  const count = view.getUint16(12);
  const entries = new Map<string, TableEntry>();
  for (let i = 0; i < count; i += 1) {
    const at = 44 + i * 20;
    entries.set(tag(view, at), {
      offset: view.getUint32(at + 4),
      compLength: view.getUint32(at + 8),
      origLength: view.getUint32(at + 12),
    });
  }
  const wanted = ["head", "hhea", "maxp", "hmtx", "loca", "glyf", "cmap", "GPOS"];
  const tables = new Map<string, DataView>();
  for (const name of wanted) {
    const entry = entries.get(name);
    if (!entry) continue;
    const raw = new Uint8Array(buffer, entry.offset, entry.compLength);
    const bytes = entry.compLength < entry.origLength ? inflateZlib(raw, entry.origLength) : raw.slice();
    if (bytes.byteLength !== entry.origLength) throw new Error(`font table ${name} inflated to the wrong length`);
    tables.set(name, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }
  return new WoffFont(tables);
}

/** Contours to three.js shapes (three decides holes by containment, so winding does not matter). */
export function contoursToShapes(contours: readonly Contour[], scale: number, offsetX: number): Shape[] {
  const path = new ShapePath();
  const px = (point: { x: number }) => point.x * scale + offsetX;
  const py = (point: { y: number }) => point.y * scale;
  for (const contour of contours) {
    const n = contour.length;
    // Start on an on-curve point, or on the implied midpoint of two off-curve ones.
    const onIndex = contour.findIndex((point) => point.on);
    let start: { x: number; y: number };
    const rest: GlyphPoint[] = [];
    if (onIndex >= 0) {
      start = contour[onIndex]!;
      for (let k = 1; k < n; k += 1) rest.push(contour[(onIndex + k) % n]!);
    } else {
      start = { x: (contour[0]!.x + contour[n - 1]!.x) / 2, y: (contour[0]!.y + contour[n - 1]!.y) / 2 };
      rest.push(...contour);
    }
    path.moveTo(px(start), py(start));
    const sub = path.currentPath!;
    let control: GlyphPoint | null = null;
    for (const point of rest) {
      if (point.on) {
        if (control) sub.quadraticCurveTo(px(control), py(control), px(point), py(point));
        else sub.lineTo(px(point), py(point));
        control = null;
      } else {
        if (control) {
          const mx = (control.x + point.x) / 2;
          const my = (control.y + point.y) / 2;
          sub.quadraticCurveTo(px(control), py(control), mx * scale + offsetX, my * scale);
        }
        control = point;
      }
    }
    if (control) sub.quadraticCurveTo(px(control), py(control), px(start), py(start));
    else sub.lineTo(px(start), py(start));
  }
  return path.toShapes();
}

export interface TitleGeometryOptions {
  /** Cap height of the text in world units (approximately the em size x 0.7). */
  size?: number;
  /** Extrusion depth, world units. */
  depth?: number;
  bevel?: number;
  /** Extra space between letters, in em. */
  tracking?: number;
  curveSegments?: number;
}

export interface TitleGeometry {
  /** Two groups: 0 the faces (front and back), 1 the sides and bevel. */
  geometry: BufferGeometry;
  width: number;
  height: number;
}

/**
 * One merged, centred geometry for a line of text: each glyph extruded and
 * bevelled, faces in group 0 and sides in group 1 (two materials).
 */
export function createTitleGeometry(font: WoffFont, text: string, options: TitleGeometryOptions = {}): TitleGeometry {
  const capHeight = options.size ?? 1;
  const em = capHeight / 0.7;
  const scale = em / font.unitsPerEm;
  const depth = options.depth ?? capHeight * 0.22;
  const bevel = options.bevel ?? capHeight * 0.045;
  const tracking = (options.tracking ?? 0.02) * font.unitsPerEm;
  const faces: number[] = [];
  const faceNormals: number[] = [];
  const sides: number[] = [];
  const sideNormals: number[] = [];

  let pen = 0;
  let previous = -1;
  const chars = Array.from(text);
  chars.forEach((char, index) => {
    const gid = font.glyphIndex(char.codePointAt(0) ?? 32);
    if (previous >= 0) pen += font.kerning(previous, gid);
    const contours = font.outline(gid);
    if (contours.length > 0) {
      const shapes = contoursToShapes(contours, scale, pen * scale);
      const extruded = new ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel * 0.8,
        bevelSegments: 2,
        curveSegments: options.curveSegments ?? 5,
      });
      const position = extruded.getAttribute("position");
      const normal = extruded.getAttribute("normal");
      for (const group of extruded.groups) {
        const targetPos = group.materialIndex === 0 ? faces : sides;
        const targetNor = group.materialIndex === 0 ? faceNormals : sideNormals;
        for (let i = group.start; i < group.start + group.count; i += 1) {
          targetPos.push(position.getX(i), position.getY(i), position.getZ(i));
          targetNor.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        }
      }
      extruded.dispose();
    }
    pen += font.advance(gid) + (index < chars.length - 1 ? tracking : 0);
    previous = gid;
  });

  const width = pen * scale;
  const positions = new Float32Array(faces.length + sides.length);
  positions.set(faces, 0);
  positions.set(sides, faces.length);
  const normals = new Float32Array(faceNormals.length + sideNormals.length);
  normals.set(faceNormals, 0);
  normals.set(sideNormals, faceNormals.length);
  // Centre: x on the advance width, y on the cap height, z on the slab.
  const cx = width / 2;
  const cy = capHeight / 2;
  const cz = depth / 2;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i]! - cx;
    positions[i + 1] = positions[i + 1]! - cy;
    positions[i + 2] = positions[i + 2]! - cz;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.addGroup(0, faces.length / 3, 0);
  geometry.addGroup(faces.length / 3, sides.length / 3, 1);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return { geometry, width, height: capHeight };
}
