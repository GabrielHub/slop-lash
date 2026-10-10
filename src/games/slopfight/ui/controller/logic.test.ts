import { describe, expect, it } from "vite-plus/test";
import { STROKE_COALESCE_MS, STROKES_PER_BATCH } from "../../constants";
import type { Stroke } from "../../strokes";
import {
  applyLocal,
  enqueueClear,
  enqueueStroke,
  enqueueUndo,
  healthAt,
  nextSeq,
  takeHype,
  takeOp,
  type QueueItem,
} from "./logic";

const stroke = (x: number): Stroke => ({ c: 0, w: 1, p: [x, x, x + 10, x + 10] });

describe("stroke queue", () => {
  it("batches leading strokes, at most one batch per coalesce window", () => {
    let items: QueueItem[] = [];
    for (let index = 0; index < STROKES_PER_BATCH + 3; index += 1) items = enqueueStroke(items, stroke(index));
    const first = takeOp(items, null, 1_000);
    expect(first.op).toEqual({ kind: "add", strokes: items.slice(0, STROKES_PER_BATCH).map((item) => (item as { stroke: Stroke }).stroke) });
    expect(first.rest).toHaveLength(3);
    const tooSoon = takeOp(first.rest, 1_000, 1_100);
    expect(tooSoon.op).toBeNull();
    expect(tooSoon.waitMs).toBe(STROKE_COALESCE_MS - 100);
    const later = takeOp(first.rest, 1_000, 1_000 + STROKE_COALESCE_MS);
    expect(later.op?.kind).toBe("add");
    expect(later.rest).toEqual([]);
  });

  it("undo drops an unsent stroke, else queues a server undo after what came before", () => {
    const one = enqueueStroke([], stroke(1));
    expect(enqueueUndo(one)).toEqual([]);
    expect(enqueueUndo([])).toEqual([{ kind: "undo" }]);
    // A stroke, then an undo the server must run, then a stroke: order is kept.
    const items = enqueueStroke(enqueueUndo([]), stroke(2));
    const head = takeOp(items, null, 0);
    expect(head.op).toEqual({ kind: "undo" });
    expect(takeOp(head.rest, null, 0).op).toEqual({ kind: "add", strokes: [stroke(2)] });
  });

  it("a stroke run stops at an undo", () => {
    const items: QueueItem[] = [
      { kind: "stroke", stroke: stroke(1) },
      { kind: "undo" },
      { kind: "stroke", stroke: stroke(2) },
    ];
    const head = takeOp(items, null, 0);
    expect(head.op).toEqual({ kind: "add", strokes: [stroke(1)] });
    expect(head.rest[0]).toEqual({ kind: "undo" });
  });

  it("clear replaces everything unsent", () => {
    expect(enqueueClear()).toEqual([{ kind: "clear" }]);
  });

  it("seqs increase and never fall below the wall clock", () => {
    expect(nextSeq(5, 1_000)).toBe(1_000);
    expect(nextSeq(1_000, 1_000)).toBe(1_001);
    expect(nextSeq(2_000, 1_500.7)).toBe(2_001);
  });

  it("local strokes follow the queue's edits", () => {
    const strokes = [stroke(1), stroke(2)];
    expect(applyLocal(strokes, { kind: "undo" })).toEqual([stroke(1)]);
    expect(applyLocal(strokes, { kind: "clear" })).toEqual([]);
    expect(applyLocal(strokes, { kind: "stroke", stroke: stroke(3) })).toHaveLength(3);
  });
});

describe("healthAt", () => {
  const timeline = [
    [0, 100, 90],
    [250, 100, 90],
    [400, 80, 90],
    [500, 80, 90],
    [1_000, 80, 40],
  ];

  it("clamps before the first and after the last sample", () => {
    expect(healthAt(timeline, -50)).toEqual({ A: 100, B: 90 });
    expect(healthAt(timeline, 5_000)).toEqual({ A: 80, B: 40 });
    expect(healthAt([], 10)).toBeNull();
  });

  it("interpolates between samples", () => {
    expect(healthAt(timeline, 250)).toEqual({ A: 100, B: 90 });
    expect(healthAt(timeline, 325)).toEqual({ A: 90, B: 90 });
    expect(healthAt(timeline, 750)).toEqual({ A: 80, B: 65 });
  });
});

describe("takeHype", () => {
  it("sends at most 20 taps a call", () => {
    expect(takeHype(7)).toEqual({ send: 7, rest: 0 });
    expect(takeHype(33)).toEqual({ send: 20, rest: 13 });
    expect(takeHype(0)).toEqual({ send: 0, rest: 0 });
  });
});
