import { describe, expect, it } from "vite-plus/test";
import { STROKE_COALESCE_MS, STROKES_PER_BATCH } from "../../constants";
import type { Stroke } from "../../strokes";
import { preserveUpgrade } from "../../ai/upgrade";
import { SAMPLES } from "../../samples";
import {
  applyLocal,
  betsWaiting,
  championsWaiting,
  enqueueClear,
  enqueueStroke,
  enqueueUndo,
  healthAt,
  nextSeq,
  takeHype,
  takeOp,
  MATERIAL_STARTERS,
  withStarter,
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

describe("material starters", () => {
  it("start a text and give way to what the player wrote", () => {
    expect(withStarter("", "solid gold")).toBe("solid gold ");
    expect(withStarter("solid gold", "lava")).toBe("lava ");
    expect(withStarter("a cape", "lava")).toBe("a cape lava ");
  });

  it("finished with a part, change that part; alone, change everything", () => {
    for (const { champion } of SAMPLES.slice(0, 12)) {
      const arms = champion.parts.some((part) => part.role === "arm");
      for (const starter of MATERIAL_STARTERS) {
        // A model that made every part of it: the upgrade keeps only what the text asked for.
        const next = { ...champion, parts: champion.parts.map((part) => ({ ...part, finish: starter.finish })) };
        const finishOf = (text: string) =>
          preserveUpgrade(champion, next, text).parts.map((part) => [part.id, part.finish ?? "vinyl"]);
        const before = (id: string) => champion.parts.find((part) => part.id === id)!.finish ?? "vinyl";
        expect(finishOf(withStarter("", starter.phrase))).toEqual(
          champion.parts.map((part) => [part.id, starter.finish]),
        );
        if (!arms) continue;
        expect(finishOf(`${withStarter("", starter.phrase)}arms`)).toEqual(
          champion.parts.map((part) => [part.id, part.role === "arm" ? starter.finish : before(part.id)]),
        );
      }
    }
  });
});

describe("waiting lines", () => {
  it("counts champions not yet done at this round's version", () => {
    const fighters = [
      { status: "READY", version: 2 },
      { status: "READY", version: 1 },
      { status: "FORGING", version: 1 },
    ];
    expect(championsWaiting(fighters, 2)).toBe("Waiting on 2 more champions");
    expect(championsWaiting(fighters.slice(0, 2), 2)).toBe("Waiting on one more champion");
    expect(championsWaiting(fighters.slice(0, 2), 0)).toBe("All forged. Eyes on the TV");
  });

  it("counts the players here who have not bet", () => {
    const players = [
      { id: "a", type: "HUMAN", online: true },
      { id: "b", type: "HUMAN", online: true },
      { id: "c", type: "HUMAN", online: false },
      { id: "d", type: "AI", online: true },
    ];
    expect(betsWaiting(players, { A: [], B: [] })).toBe("Waiting on 2 more bets");
    expect(betsWaiting(players, { A: ["a"], B: [] })).toBe("Waiting on one more bet");
    expect(betsWaiting(players, { A: ["a"], B: ["b"] })).toBe("All bets in. Fight starts soon");
  });
});
