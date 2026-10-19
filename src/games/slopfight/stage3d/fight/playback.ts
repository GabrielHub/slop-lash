// Fight playback helpers: the sim input from a fight row, the stored health
// timeline, an event cursor that hands out each event once as presentation
// time crosses it, the hash check, and the ring-out landing scan. Pure
// TypeScript (no three.js, no React).

import { ARENAS, dryHalfAt, finaleFor, finaleStrengthAt, floodedGeometry, isOverFloor } from "../../arenas";
import type { MatchupNote, Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { STEP_MS, type FightEvent, type FightInput, type FightMethod } from "../../sim";
import { waterSurfaceAt } from "../arena/flood-level";
import type { FightRecording } from "./recording";

/** The parts of a fight row (views.room / views.recap) playback reads. */
export interface FightRowLike {
  arena: FightInput["arena"];
  limitMs: number;
  seed: number | null;
  notes: readonly MatchupNote[];
  startsAt: number | null;
  outcome: StoredOutcomeLike | null;
  decidedBySeed?: boolean;
}

/** The stored outcome as the view carries it (events typed loosely by the backend). */
export interface StoredOutcomeLike {
  winner: Side;
  method: FightMethod;
  endMs: number;
  health: { A: number; B: number };
  maxHealth: { A: number; B: number };
  events: readonly unknown[];
  healthTimeline: readonly (readonly number[])[];
  hash: string;
  truncated?: boolean;
  decidedBySeed?: boolean;
}

/** The sim input for a fight, or null while its seed or a sheet is unknown. */
export function fightInputOf(
  fight: FightRowLike,
  sheets: { A: Champion | null | undefined; B: Champion | null | undefined },
): FightInput | null {
  if (fight.seed === null || !sheets.A || !sheets.B) return null;
  return {
    seed: fight.seed >>> 0,
    arena: fight.arena,
    a: sheets.A,
    b: sheets.B,
    notes: [...fight.notes],
    limitMs: fight.limitMs,
  };
}

/** Health on the stored timeline at sim time t (a step function: hits land at once). */
export function healthAt(
  timeline: readonly (readonly number[])[],
  tMs: number,
  fallback: { A: number; B: number },
): { A: number; B: number } {
  let lo = 0;
  let hi = timeline.length - 1;
  if (hi < 0 || (timeline[0]![0] ?? 0) > tMs) return { A: fallback.A, B: fallback.B };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((timeline[mid]![0] ?? 0) <= tMs) lo = mid;
    else hi = mid - 1;
  }
  const sample = timeline[lo]!;
  return { A: sample[1] ?? fallback.A, B: sample[2] ?? fallback.B };
}

/** The stored log's events, typed (the backend stores them as `v.any()`). */
export function storedEvents(outcome: StoredOutcomeLike | null): FightEvent[] {
  return (outcome?.events ?? []) as FightEvent[];
}

/**
 * Hands out events in order as time crosses them, each exactly once.
 * `advance(t)` returns the events with `prev < event.t <= t`; going back in
 * time (a recap seek) rewinds without returning anything.
 */
export class EventCursor {
  private index = 0;
  private time = -Infinity;

  constructor(private readonly events: readonly FightEvent[]) {}

  get t(): number {
    return this.time;
  }

  advance(tMs: number, out: FightEvent[] = []): FightEvent[] {
    if (tMs < this.time) {
      this.seek(tMs);
      return out;
    }
    const events = this.events;
    while (this.index < events.length && events[this.index]!.t <= tMs) {
      out.push(events[this.index]!);
      this.index += 1;
    }
    this.time = tMs;
    return out;
  }

  /** Jump to t without returning the events in between (they are "past"). */
  seek(tMs: number): void {
    const events = this.events;
    let index = 0;
    while (index < events.length && events[index]!.t <= tMs) index += 1;
    this.index = index;
    this.time = tMs;
  }
}

export type HashCheck = "pending" | "match" | "mismatch" | "unchecked";

/** One completed hash check, kept for the E2E harness (development builds only). */
export interface HashRecord {
  label: string;
  local: string;
  stored: string;
  match: boolean;
}

/**
 * Development only: every completed check by label on `window.__slopfightHashes`,
 * so the E2E harness can prove each live fight replayed to the stored hash
 * (a match is otherwise silent).
 */
function recordHash(label: string, local: string, stored: string): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const target = window as unknown as { __slopfightHashes?: Record<string, HashRecord> };
  target.__slopfightHashes ??= {};
  target.__slopfightHashes[label] = { label, local, stored, match: local === stored };
}

/** Compare the local run with the stored outcome; warns once on a mismatch. */
export function checkHash(recording: FightRecording, stored: StoredOutcomeLike | null, label = "fight"): HashCheck {
  const local = recording.outcome;
  if (!stored) return "unchecked";
  if (!local || !recording.complete) return "pending";
  recordHash(label, local.hash, stored.hash);
  if (local.hash === stored.hash) return "match";
  console.warn(
    `[slopfight] ${label}: local replay hash ${local.hash} != stored ${stored.hash}; presenting the stored outcome`,
  );
  return "mismatch";
}

/**
 * The step a ring-out victim lands (hits the water, the street, the kitchen
 * floor or the sink basin), scanning the recording after it left the floor.
 * The sim has nothing below the platform except the sink basin, so a body
 * keeps falling; playback freezes the victim at this step. Null when it never
 * lands inside the recording.
 */
export function findLandingStep(recording: FightRecording, side: Side, fromMs: number): number | null {
  const { arena, seed, limitMs } = recording.input;
  const geometry = ARENAS[arena].geometry;
  // The flood finale moves the waterline in and raises the water; a ring-out
  // ends the fight, so it holds where it was then.
  const finale = finaleFor(arena, seed, limitMs);
  const flood = finale.spec.id === "flood" ? finale.spec : null;
  const strength = flood ? finaleStrengthAt(finale, fromMs) : 0;
  const floor = flood ? floodedGeometry(geometry, dryHalfAt(geometry, flood, strength)) : geometry;
  const torso: [number, number, number] = [0, 0, 0];
  const start = Math.max(0, Math.floor(fromMs / STEP_MS) - 90);
  let leftFloor = false;
  let fastFall = false;
  for (let k = start; k <= recording.steps; k += 1) {
    recording.torsoAt(side, k, torso);
    if (!leftFloor) {
      leftFloor = !isOverFloor(floor, torso[0], torso[2]) || torso[1] < geometry.topY - 0.3;
      if (!leftFloor) continue;
    }
    if (torso[1] <= waterSurfaceAt(geometry, flood, strength, torso[0], torso[2]) + 0.15) return k;
    // The sink basin: a fast fall that suddenly stops.
    const vy = recording.torsoVyAt(side, k);
    if (vy < -2.5) fastFall = true;
    else if (fastFall && vy > -0.4 && torso[1] < geometry.topY - 0.4) return k;
  }
  return null;
}

/**
 * The step a ring-out victim went over (its torso left the floor: past the
 * edge or over a pit), scanning back from the ring-out call, which comes once
 * it has already dropped. Null when it never stood on the floor in the scan.
 */
export function findOverEdgeStep(recording: FightRecording, side: Side, ringoutMs: number): number | null {
  const geometry = ARENAS[recording.input.arena].geometry;
  const torso: [number, number, number] = [0, 0, 0];
  const end = Math.min(recording.steps, Math.round(ringoutMs / STEP_MS));
  for (let k = end; k >= Math.max(0, end - 120); k -= 1) {
    recording.torsoAt(side, k, torso);
    if (isOverFloor(geometry, torso[0], torso[2]) && torso[1] > geometry.topY - 0.3) return Math.min(k + 1, end);
  }
  return null;
}

/** Ms of sim time for a step index. */
export const msOfStep = (step: number): number => step * STEP_MS;
