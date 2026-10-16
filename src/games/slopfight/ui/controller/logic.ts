// Pure helpers behind the phone screens: the stroke send queue, the live
// health bars, hype batching, the per-phase "still has something to do" and
// the upgrade's material starters. No React, no Convex: tested in logic.test.ts.

import { STROKES_PER_BATCH } from "../../constants";
import { takeStrokeBatch, type Stroke } from "../../strokes";
import type { Finish } from "../../vocab";

// ---------------------------------------------------------------------------
// Stroke queue
// ---------------------------------------------------------------------------

/**
 * What the canvas still has to tell the server, in order. Undo and clear go
 * through the queue too, so they land after the strokes drawn before them.
 */
export type QueueItem = { kind: "stroke"; stroke: Stroke } | { kind: "undo" } | { kind: "clear" };

/** One mutation's worth of work. */
export type QueueOp =
  | { kind: "add"; strokes: Stroke[] }
  | { kind: "undo" }
  | { kind: "clear" };

export const enqueueStroke = (items: readonly QueueItem[], stroke: Stroke): QueueItem[] => [
  ...items,
  { kind: "stroke", stroke },
];

/** Undo: a stroke that never left the phone is simply dropped; otherwise ask the server. */
export function enqueueUndo(items: readonly QueueItem[]): QueueItem[] {
  if (items.at(-1)?.kind === "stroke") return items.slice(0, -1);
  return [...items, { kind: "undo" }];
}

/** Clear: everything unsent is moot; the server wipes the layer. */
export function enqueueClear(): QueueItem[] {
  return [{ kind: "clear" }];
}

/**
 * The next mutation to send: an undo or a clear at once, or the leading run
 * of strokes as one batch (at most STROKES_PER_BATCH, at most one batch per
 * STROKE_COALESCE_MS). `waitMs` says when to ask again when nothing can go yet.
 */
export function takeOp(
  items: readonly QueueItem[],
  lastAddAt: number | null,
  now: number,
): { op: QueueOp | null; rest: QueueItem[]; waitMs: number } {
  const head = items[0];
  if (!head) return { op: null, rest: [], waitMs: 0 };
  if (head.kind !== "stroke") return { op: { kind: head.kind }, rest: items.slice(1), waitMs: 0 };
  const run: Stroke[] = [];
  for (const item of items) {
    if (item.kind !== "stroke" || run.length === STROKES_PER_BATCH) break;
    run.push(item.stroke);
  }
  const { batch, waitMs } = takeStrokeBatch(run, lastAddAt, now);
  if (batch.length === 0) return { op: null, rest: [...items], waitMs };
  return { op: { kind: "add", strokes: batch }, rest: items.slice(batch.length), waitMs: 0 };
}

/**
 * The seq for a new batch: increasing within a session and across reloads
 * (a wall-clock floor), so a fresh phone never reuses a seq the server already
 * holds (a reused seq is silently ignored as a retry).
 */
export function nextSeq(lastSeq: number, now: number): number {
  return Math.max(lastSeq + 1, Math.floor(now));
}

/** The layer strokes after an undo or a clear, as the server will have them. */
export function applyLocal(strokes: readonly Stroke[], item: QueueItem): Stroke[] {
  if (item.kind === "stroke") return [...strokes, item.stroke];
  if (item.kind === "undo") return strokes.slice(0, -1);
  return [];
}

// ---------------------------------------------------------------------------
// Health bars
// ---------------------------------------------------------------------------

export interface Health {
  A: number;
  B: number;
}

/**
 * Each side's health at sim time `ms` from the stored `[ms, a, b]` samples,
 * interpolated between the two samples around it. Before the first sample it
 * is the first; after the last, the last.
 */
export function healthAt(timeline: readonly (readonly number[])[], ms: number): Health | null {
  const first = timeline[0];
  if (!first) return null;
  if (ms <= first[0]!) return { A: first[1]!, B: first[2]! };
  let low = 0;
  let high = timeline.length - 1;
  if (ms >= timeline[high]![0]!) return { A: timeline[high]![1]!, B: timeline[high]![2]! };
  // Largest index whose time is <= ms.
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (timeline[mid]![0]! <= ms) low = mid;
    else high = mid - 1;
  }
  const before = timeline[low]!;
  const after = timeline[low + 1] ?? before;
  const span = after[0]! - before[0]!;
  const t = span > 0 ? (ms - before[0]!) / span : 1;
  return {
    A: before[1]! + (after[1]! - before[1]!) * t,
    B: before[2]! + (after[2]! - before[2]!) * t,
  };
}

// ---------------------------------------------------------------------------
// Hype
// ---------------------------------------------------------------------------

/** Taps one hype call may carry (the server caps a call at 20). */
export const HYPE_PER_CALL = 20;
/** Local taps respond immediately; crowd updates coalesce to at most one call per second. */
export const HYPE_FLUSH_MS = 1_000;

/** Splits banked taps into what to send now and what stays banked. */
export function takeHype(banked: number): { send: number; rest: number } {
  const send = Math.min(HYPE_PER_CALL, Math.max(0, Math.floor(banked)));
  return { send, rest: Math.max(0, banked - send) };
}

// ---------------------------------------------------------------------------
// Material starters: a tap starts the upgrade's text, the player finishes it
// ---------------------------------------------------------------------------

export interface MaterialStarter {
  finish: Exclude<Finish, "vinyl">;
  label: string;
  /** Words ai/upgrade.ts reads as that finish, before the part the player names. */
  phrase: string;
}

/** The upgrade box's material chips, most fun first. */
export const MATERIAL_STARTERS: readonly MaterialStarter[] = [
  { finish: "gold", label: "Gold", phrase: "solid gold" },
  { finish: "crystal", label: "Diamond", phrase: "diamond" },
  { finish: "lava", label: "Lava", phrase: "lava" },
  { finish: "metal", label: "Chrome", phrase: "chrome" },
  { finish: "ice", label: "Ice", phrase: "ice" },
  { finish: "slime", label: "Slime", phrase: "slimy" },
  { finish: "glow", label: "Glow", phrase: "glowing" },
  { finish: "stone", label: "Stone", phrase: "stone" },
  { finish: "wood", label: "Wood", phrase: "wooden" },
];

/**
 * The text after tapping a starter, ending in a space for the player to name
 * what it makes ("solid gold " becomes "solid gold arms"). It replaces an
 * empty box or a lone starter, and follows anything the player wrote.
 */
export function withStarter(text: string, phrase: string): string {
  const written = text.trim();
  const lone = written === "" || MATERIAL_STARTERS.some((starter) => starter.phrase === written);
  return `${lone ? "" : `${written} `}${phrase} `;
}
