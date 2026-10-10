// Drawings are strokes, not pixels: polylines in a 0..1000 square with a
// palette colour each. The phone simplifies and batches them, Convex stores one
// row per batch, and the stage easel, the controller card, the recap and the
// server rasterizer all re-render them. Layer 0 is the Build drawing; an
// upgrade's strokes go on layer N (the round number) on top of it.

import { z } from "zod";
import {
  POINTS_PER_STROKE,
  POINTS_PER_DOODLE,
  STROKE_COALESCE_MS,
  STROKE_GRID,
  STROKES_PER_BATCH,
  STROKES_PER_DOODLE,
} from "./constants";
import { ERASER_INDEX } from "./vocab";

/** The fixed round brush, as a diameter in grid units (w: 1). */
export const BRUSH_WIDTH = 24;
/** The eraser paints the canvas colour with a wider round brush. */
export const ERASER_WIDTH = 56;

/** Palette index 0..5 (PHONE_PALETTE), or 6 for the eraser. */
export const StrokeColorSchema = z.literal([0, 1, 2, 3, 4, 5, ERASER_INDEX]);

export const StrokeSchema = z.object({
  c: StrokeColorSchema,
  /** Brush: always 1, the one fixed brush (kept so a second brush can be added later). */
  w: z.literal(1),
  /** Flattened integer x, y pairs in 0..STROKE_GRID; one pair is a dot. */
  p: z
    .array(z.number().int().min(0).max(STROKE_GRID))
    .min(2)
    .max(POINTS_PER_STROKE * 2)
    .refine((points) => points.length % 2 === 0, "Points come in x, y pairs"),
});
export type Stroke = z.infer<typeof StrokeSchema>;
export type StrokeColor = Stroke["c"];

/** One mutation's worth of strokes. */
export const StrokeBatchSchema = z.array(StrokeSchema).min(1).max(STROKES_PER_BATCH);

/** A stored batch row, as the stage and the rasterizer read it. */
export interface StrokeBatch {
  layer: number;
  seq: number;
  strokes: readonly Stroke[];
}

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function isValidStroke(stroke: unknown): stroke is Stroke {
  return StrokeSchema.safeParse(stroke).success;
}

export const isEraser = (stroke: Stroke) => stroke.c === ERASER_INDEX;

// ---------------------------------------------------------------------------
// Simplification
// ---------------------------------------------------------------------------

/** Douglas-Peucker tolerance to start from, in grid units. */
const SIMPLIFY_TOLERANCE = 1.5;

/**
 * Raw pointer samples (flattened x, y, any numbers already scaled to the
 * 0..1000 square) to a valid stroke path: integers clamped to the grid,
 * repeats dropped, then Douglas-Peucker, loosened until at most `maxPoints`
 * points remain. Endpoints always survive; one point stays a dot.
 */
export function simplifyStroke(points: readonly number[], maxPoints = POINTS_PER_STROKE): number[] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]!;
    const y = points[index + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const gx = Math.min(STROKE_GRID, Math.max(0, Math.round(x)));
    const gy = Math.min(STROKE_GRID, Math.max(0, Math.round(y)));
    if (xs.length > 0 && xs.at(-1) === gx && ys.at(-1) === gy) continue;
    xs.push(gx);
    ys.push(gy);
  }
  const limit = Math.max(2, maxPoints);
  let keep = xs.map(() => true);
  if (xs.length > 2) {
    let tolerance = SIMPLIFY_TOLERANCE;
    keep = douglasPeucker(xs, ys, tolerance * tolerance);
    while (countTrue(keep) > limit && tolerance < STROKE_GRID) {
      tolerance *= 1.6;
      keep = douglasPeucker(xs, ys, tolerance * tolerance);
    }
  }
  const out: number[] = [];
  keep.forEach((kept, index) => {
    if (kept) out.push(xs[index]!, ys[index]!);
  });
  return out;
}

function countTrue(flags: readonly boolean[]): number {
  return flags.reduce((count, flag) => count + (flag ? 1 : 0), 0);
}

/** Iterative Douglas-Peucker over point-to-segment distance (closed loops work). */
function douglasPeucker(
  xs: readonly number[],
  ys: readonly number[],
  tolerance2: number,
): boolean[] {
  const last = xs.length - 1;
  const keep = xs.map((_, index) => index === 0 || index === last);
  const stack: [number, number][] = [[0, last]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let farthest = -1;
    let farthest2 = tolerance2;
    for (let index = start + 1; index < end; index += 1) {
      const d2 = segmentDistance2(
        xs[index]!,
        ys[index]!,
        xs[start]!,
        ys[start]!,
        xs[end]!,
        ys[end]!,
      );
      if (d2 > farthest2) {
        farthest2 = d2;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = true;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return keep;
}

function segmentDistance2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length2));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

/** Bounding box of the stroke points (ink only unless `includeEraser`), or null if there are none. */
export function strokeBounds(
  strokes: readonly Stroke[],
  includeEraser = false,
): StrokeBounds | null {
  let bounds: StrokeBounds | null = null;
  for (const stroke of strokes) {
    if (!includeEraser && isEraser(stroke)) continue;
    for (let index = 0; index + 1 < stroke.p.length; index += 2) {
      const x = stroke.p[index]!;
      const y = stroke.p[index + 1]!;
      if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  return bounds;
}

/** Total polyline length of the ink strokes, in grid units. */
export function inkLength(strokes: readonly Stroke[]): number {
  let length = 0;
  for (const stroke of strokes) {
    if (isEraser(stroke)) continue;
    for (let index = 2; index + 1 < stroke.p.length; index += 2) {
      const dx = stroke.p[index]! - stroke.p[index - 2]!;
      const dy = stroke.p[index + 1]! - stroke.p[index - 1]!;
      length += Math.sqrt(dx * dx + dy * dy);
    }
  }
  return length;
}

const COVERAGE_CELLS = 50;
const CELL = STROKE_GRID / COVERAGE_CELLS;
/** Fewer inked cells than this (each 20 x 20 units) reads as nothing. */
const MIN_INK_CELLS = 5;
/** Ink that fits inside this many cells both ways is a dot or a speck. */
const MIN_INK_SPAN = 4;

/**
 * True when the strokes leave nothing readable on the canvas: no strokes, a
 * single dot or speck, or ink that was all erased. Paints ink and eraser
 * strokes in order onto a coarse 50 x 50 coverage grid and measures what
 * ink remains. Conservative: anything bigger goes to the forge to judge.
 */
export function isBlankDoodle(strokes: readonly Stroke[]): boolean {
  const grid = new Uint8Array(COVERAGE_CELLS * COVERAGE_CELLS);
  for (const stroke of strokes) {
    const erase = isEraser(stroke);
    const radius = (erase ? ERASER_WIDTH : BRUSH_WIDTH) / 2;
    const value = erase ? 0 : 1;
    const points = stroke.p;
    if (points.length < 2) continue;
    stamp(grid, points[0]!, points[1]!, radius, value);
    for (let index = 2; index + 1 < points.length; index += 2) {
      const x0 = points[index - 2]!;
      const y0 = points[index - 1]!;
      const x1 = points[index]!;
      const y1 = points[index + 1]!;
      const length = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      const steps = Math.max(1, Math.ceil(length / (CELL / 2)));
      for (let step = 1; step <= steps; step += 1) {
        stamp(
          grid,
          x0 + ((x1 - x0) * step) / steps,
          y0 + ((y1 - y0) * step) / steps,
          radius,
          value,
        );
      }
    }
  }

  let cells = 0;
  let minX = COVERAGE_CELLS;
  let minY = COVERAGE_CELLS;
  let maxX = -1;
  let maxY = -1;
  for (let cy = 0; cy < COVERAGE_CELLS; cy += 1) {
    for (let cx = 0; cx < COVERAGE_CELLS; cx += 1) {
      if (!grid[cy * COVERAGE_CELLS + cx]) continue;
      cells += 1;
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
      maxX = Math.max(maxX, cx);
      maxY = Math.max(maxY, cy);
    }
  }
  if (cells < MIN_INK_CELLS) return true;
  return maxX - minX + 1 < MIN_INK_SPAN && maxY - minY + 1 < MIN_INK_SPAN;
}

/** Sets every coverage cell whose centre is within `radius` of (x, y), plus the cell under it. */
function stamp(grid: Uint8Array, x: number, y: number, radius: number, value: number): void {
  const cellOf = (v: number) => Math.min(COVERAGE_CELLS - 1, Math.max(0, Math.floor(v / CELL)));
  grid[cellOf(y) * COVERAGE_CELLS + cellOf(x)] = value;
  const r2 = radius * radius;
  for (let cy = cellOf(y - radius); cy <= cellOf(y + radius); cy += 1) {
    for (let cx = cellOf(x - radius); cx <= cellOf(x + radius); cx += 1) {
      const dx = (cx + 0.5) * CELL - x;
      const dy = (cy + 0.5) * CELL - y;
      if (dx * dx + dy * dy <= r2) grid[cy * COVERAGE_CELLS + cx] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Layers and batching
// ---------------------------------------------------------------------------

const byLayerThenSeq = (a: StrokeBatch, b: StrokeBatch) => a.layer - b.layer || a.seq - b.seq;

/** Strokes grouped by layer in drawing order: layer 0 (Build) first, then each upgrade. */
export function strokesByLayer(
  batches: readonly StrokeBatch[],
): { layer: number; strokes: Stroke[] }[] {
  const layers: { layer: number; strokes: Stroke[] }[] = [];
  for (const batch of [...batches].sort(byLayerThenSeq)) {
    const current = layers.at(-1);
    if (current && current.layer === batch.layer) current.strokes.push(...batch.strokes);
    else layers.push({ layer: batch.layer, strokes: [...batch.strokes] });
  }
  return layers;
}

/** Every stroke up to and including `maxLayer`, in drawing order: the doodle a forge sees. */
export function flattenStrokes(
  batches: readonly StrokeBatch[],
  maxLayer = Number.POSITIVE_INFINITY,
): Stroke[] {
  return strokesByLayer(batches)
    .filter((group) => group.layer <= maxLayer)
    .flatMap((group) => group.strokes);
}

/** How many more strokes a layer can take (STROKES_PER_DOODLE per layer). */
export function strokeRoom(layerStrokeCount: number): number {
  return Math.max(0, STROKES_PER_DOODLE - layerStrokeCount);
}

/** Saved polyline points (each point is an x/y pair), shared by phone and server. */
export function strokePointCount(strokes: readonly { p: readonly number[] }[]): number {
  return strokes.reduce((count, stroke) => count + stroke.p.length / 2, 0);
}

/** Capacity left on this layer. Earlier upgrade layers have their own allowance. */
export function doodleRoom(strokes: readonly { p: readonly number[] }[]) {
  return {
    strokes: strokeRoom(strokes.length),
    points: Math.max(0, POINTS_PER_DOODLE - strokePointCount(strokes)),
  };
}

/** Stops the last local stroke at the same budget the server enforces. */
export function fitDoodleStroke(strokes: readonly Stroke[], stroke: Stroke): Stroke | null {
  const room = doodleRoom(strokes);
  if (room.strokes === 0 || room.points === 0) return null;
  return { ...stroke, p: stroke.p.slice(0, room.points * 2) };
}

/**
 * The phone's coalescing step: what to send now, given the finished strokes
 * not yet sent and when the last batch went out. At most one batch of up to
 * STROKES_PER_BATCH per STROKE_COALESCE_MS; `waitMs` says when to call again
 * (0 when nothing is left).
 */
export function takeStrokeBatch(
  pending: readonly Stroke[],
  lastSentAt: number | null,
  now: number,
): { batch: Stroke[]; rest: Stroke[]; waitMs: number } {
  if (pending.length === 0) return { batch: [], rest: [], waitMs: 0 };
  const since = lastSentAt === null ? Number.POSITIVE_INFINITY : now - lastSentAt;
  if (since < STROKE_COALESCE_MS) {
    return { batch: [], rest: [...pending], waitMs: STROKE_COALESCE_MS - since };
  }
  const batch = pending.slice(0, STROKES_PER_BATCH);
  const rest = pending.slice(STROKES_PER_BATCH);
  return { batch, rest, waitMs: rest.length > 0 ? STROKE_COALESCE_MS : 0 };
}
