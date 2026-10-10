import { describe, expect, test } from "vite-plus/test";
import { getConvexSize } from "convex/values";
import { CHAMPIONS, POINTS_PER_DOODLE, STROKES_PER_DOODLE } from "./constants";
import {
  StrokeBatchSchema,
  StrokeSchema,
  flattenStrokes,
  inkLength,
  isBlankDoodle,
  isValidStroke,
  simplifyStroke,
  strokeBounds,
  strokeRoom,
  doodleRoom,
  fitDoodleStroke,
  strokePointCount,
  strokesByLayer,
  takeStrokeBatch,
  type Stroke,
  type StrokeBatch,
} from "./strokes";

const ink = (p: number[], c: Stroke["c"] = 0): Stroke => ({ c, w: 1, p });
const eraser = (p: number[]): Stroke => ({ c: 6, w: 1, p });

test("the drawing budget clips the last stroke and frees room after undo or clear", () => {
  const saved = [ink(Array.from({ length: (POINTS_PER_DOODLE - 1) * 2 }, () => 500))];
  const final = fitDoodleStroke(saved, ink([0, 0, 100, 100, 200, 200]));
  expect(final?.p).toEqual([0, 0]);
  const full = [...saved, final!];
  expect(doodleRoom(full).points).toBe(0);
  expect(fitDoodleStroke(full, ink([10, 10]))).toBeNull();
  expect(doodleRoom(full.slice(0, -1)).points).toBe(1);
  expect(doodleRoom([]).points).toBe(POINTS_PER_DOODLE);
  expect(
    fitDoodleStroke(
      Array.from({ length: STROKES_PER_DOODLE }, () => ink([0, 0])),
      ink([10, 10]),
    ),
  ).toBeNull();
});

test("every champion's three full layers fit well below Convex's 16 MiB read and return limits", () => {
  const pointsPerStroke = POINTS_PER_DOODLE / STROKES_PER_DOODLE;
  const stroke = ink(Array.from({ length: pointsPerStroke * 2 }, () => 1000));
  const rows = Array.from({ length: CHAMPIONS * 3 * STROKES_PER_DOODLE }, (_, seq) => ({
    _id: "r".repeat(64),
    _creationTime: 0,
    gameId: "g".repeat(64),
    fighterId: "f".repeat(64),
    layer: 3,
    seq,
    total: STROKES_PER_DOODLE,
    strokes: [stroke],
  }));
  expect(strokePointCount(rows.map((row) => row.strokes[0]!))).toBe(
    CHAMPIONS * 3 * POINTS_PER_DOODLE,
  );
  // Leave at least half the transaction/response budget for sheets and room data.
  expect(getConvexSize(rows)).toBeLessThan(8 * 1024 * 1024);
});

/** Samples a circle with polynomial-free math: a polygon walked by rotating a vector. */
function circle(cx: number, cy: number, r: number, samples: number): number[] {
  const points: number[] = [];
  let x = r;
  let y = 0;
  const step = (2 * Math.PI) / samples;
  const c = Math.cos(step);
  const s = Math.sin(step);
  for (let index = 0; index <= samples; index += 1) {
    points.push(cx + x, cy + y);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return points;
}

describe("stroke validation", () => {
  test("accepts palette strokes and rejects malformed ones", () => {
    expect(isValidStroke(ink([0, 0, 1000, 1000]))).toBe(true);
    expect(isValidStroke(ink([500, 500]))).toBe(true);
    expect(isValidStroke(eraser([10, 10, 20, 20]))).toBe(true);
    expect(isValidStroke({ c: 7, w: 1, p: [0, 0] })).toBe(false);
    expect(isValidStroke({ c: 0, w: 2, p: [0, 0] })).toBe(false);
    expect(isValidStroke(ink([0, 0, 1]))).toBe(false);
    expect(isValidStroke(ink([0, 1001]))).toBe(false);
    expect(isValidStroke(ink([0.5, 1]))).toBe(false);
    expect(isValidStroke(ink([]))).toBe(false);
    expect(isValidStroke(ink(Array.from({ length: 514 }, () => 1)))).toBe(false);
    expect(StrokeSchema.safeParse(ink(Array.from({ length: 512 }, () => 1))).success).toBe(true);
  });

  test("batches hold one to eight strokes", () => {
    expect(StrokeBatchSchema.safeParse([ink([1, 1])]).success).toBe(true);
    expect(StrokeBatchSchema.safeParse([]).success).toBe(false);
    expect(StrokeBatchSchema.safeParse(Array.from({ length: 9 }, () => ink([1, 1]))).success).toBe(
      false,
    );
  });
});

describe("simplifyStroke", () => {
  test("rounds and clamps to the grid and drops repeats", () => {
    expect(simplifyStroke([-5, 3.4, -5, 3.4, 1200.7, 999.5])).toEqual([0, 3, 1000, 1000]);
    expect(simplifyStroke([10, 10, Number.NaN, 4, 10.2, 9.8])).toEqual([10, 10]);
    expect(simplifyStroke([])).toEqual([]);
    expect(simplifyStroke([1, 2, 3])).toEqual([1, 2]);
  });

  test("collapses a straight line to its endpoints", () => {
    const line = Array.from({ length: 1000 }, (_, index) => [index, index / 2]).flat();
    expect(simplifyStroke(line)).toEqual([0, 0, 999, 500]);
  });

  test("keeps any stroke within 256 points, as valid integers, endpoints intact", () => {
    const wobbly = circle(500, 500, 400, 4000).map(
      (value, index) => value + ((index * 7919) % 13) - 6,
    );
    const out = simplifyStroke(wobbly);
    expect(out.length / 2).toBeLessThanOrEqual(256);
    expect(out.length / 2).toBeGreaterThan(8);
    expect(isValidStroke(ink(out))).toBe(true);
    expect(out.slice(0, 2)).toEqual([Math.round(wobbly[0]!), Math.round(wobbly[1]!)]);
    expect(out.slice(-2)).toEqual([Math.round(wobbly.at(-2)!), Math.round(wobbly.at(-1)!)]);
    expect(simplifyStroke(wobbly, 32).length / 2).toBeLessThanOrEqual(32);
    expect(simplifyStroke(wobbly)).toEqual(out);
  });

  test("keeps a smooth curve's shape at the default tolerance", () => {
    const out = simplifyStroke(circle(500, 500, 300, 360));
    expect(out.length / 2).toBeGreaterThan(20);
    for (let index = 0; index < out.length; index += 2) {
      const r = Math.sqrt((out[index]! - 500) ** 2 + (out[index + 1]! - 500) ** 2);
      expect(Math.abs(r - 300)).toBeLessThan(2);
    }
  });
});

describe("measuring", () => {
  test("bounds and ink length ignore the eraser by default", () => {
    const strokes = [ink([100, 200, 400, 600]), eraser([0, 0, 1000, 1000])];
    expect(strokeBounds(strokes)).toEqual({ minX: 100, minY: 200, maxX: 400, maxY: 600 });
    expect(strokeBounds(strokes, true)).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
    expect(strokeBounds([])).toBeNull();
    expect(inkLength(strokes)).toBe(500);
  });
});

describe("isBlankDoodle", () => {
  test("blank: nothing, a dot, a speck, eraser only, or ink erased away", () => {
    expect(isBlankDoodle([])).toBe(true);
    expect(isBlankDoodle([ink([500, 500])])).toBe(true);
    expect(isBlankDoodle([ink(circle(500, 500, 15, 24).map(Math.round))])).toBe(true);
    expect(isBlankDoodle([eraser([100, 100, 900, 900])])).toBe(true);
    const scribble = ink([300, 300, 700, 300, 700, 700, 300, 700]);
    const wipe = Array.from({ length: 30 }, (_, row) =>
      eraser([250, 250 + row * 17, 750, 250 + row * 17]),
    );
    expect(isBlankDoodle([scribble])).toBe(false);
    expect(isBlankDoodle([scribble, ...wipe])).toBe(true);
  });

  test("not blank: a stick figure, a single bold line, a small but real squiggle", () => {
    const stickFigure = [
      ink(circle(500, 250, 80, 40).map(Math.round)),
      ink([500, 330, 500, 650]),
      ink([380, 420, 620, 420]),
      ink([500, 650, 400, 850]),
      ink([500, 650, 600, 850]),
    ];
    expect(isBlankDoodle(stickFigure)).toBe(false);
    expect(isBlankDoodle([ink([100, 500, 900, 500])])).toBe(false);
    expect(isBlankDoodle([ink([450, 450, 480, 520, 520, 460, 550, 530])])).toBe(false);
  });
});

describe("layers and batching", () => {
  const a = ink([1, 1]);
  const b = ink([2, 2]);
  const c = ink([3, 3]);
  const d = ink([4, 4]);
  const batches: StrokeBatch[] = [
    { layer: 2, seq: 0, strokes: [d] },
    { layer: 0, seq: 1, strokes: [b] },
    { layer: 0, seq: 0, strokes: [a] },
    { layer: 1, seq: 0, strokes: [c] },
  ];

  test("groups by layer in drawing order and flattens up to a layer", () => {
    expect(strokesByLayer(batches)).toEqual([
      { layer: 0, strokes: [a, b] },
      { layer: 1, strokes: [c] },
      { layer: 2, strokes: [d] },
    ]);
    expect(flattenStrokes(batches)).toEqual([a, b, c, d]);
    expect(flattenStrokes(batches, 1)).toEqual([a, b, c]);
    expect(flattenStrokes([], 0)).toEqual([]);
  });

  test("coalesces sends to one batch of up to eight per 250 ms", () => {
    const pending = Array.from({ length: 10 }, (_, index) => ink([index, index]));
    const first = takeStrokeBatch(pending, null, 1_000);
    expect(first.batch).toHaveLength(8);
    expect(first.rest).toHaveLength(2);
    expect(first.waitMs).toBe(250);
    const tooSoon = takeStrokeBatch(first.rest, 1_000, 1_100);
    expect(tooSoon).toEqual({ batch: [], rest: first.rest, waitMs: 150 });
    const second = takeStrokeBatch(first.rest, 1_000, 1_250);
    expect(second.batch).toHaveLength(2);
    expect(second.waitMs).toBe(0);
    expect(takeStrokeBatch([], 0, 10)).toEqual({ batch: [], rest: [], waitMs: 0 });
  });

  test("a layer holds at most 400 strokes", () => {
    expect(strokeRoom(0)).toBe(400);
    expect(strokeRoom(399)).toBe(1);
    expect(strokeRoom(450)).toBe(0);
  });
});
