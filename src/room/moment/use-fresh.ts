"use client";

import { useRef } from "react";
import { useClientValue } from "@/hooks/use-hydrated";
import { useRoom } from "../context";

/**
 * A phase seen within this long of its start is "fresh": its sound plays, its
 * title card shows, and its typing and counting animate. Screens see a phase
 * late for many reasons (network lag, the 0.18s scene exit, a device clock a
 * second or two off), and they all still deserve the moment.
 */
export const FRESH_MS = 5_000;

/** Whether a phase that started at `phaseStartedAt` (server clock) is still fresh now. */
export function isFreshPhase(phaseStartedAt: number, clockOffsetMs: number): boolean {
  return Date.now() + clockOffsetMs - phaseStartedAt < FRESH_MS;
}

/**
 * Whether this mount saw its phase fresh (live, within `FRESH_MS` of the
 * start). Captured once: TypeOn and CountUp animate only then, so recaps,
 * reloads and first-load fixtures show the final text and numbers at once.
 *
 * The clock is read only on the client after hydration: the server render
 * and the hydrating render both say "not fresh", so the tree they build
 * always matches.
 */
export function useFreshAtMount(): boolean {
  const { live, view, clockOffsetMs } = useRoom();
  const start = view.room.phaseStartedAt;
  // A component that outlives its phase (the stage's date scene) re-captures on the next one.
  const captured = useRef<{ start: number; fresh: boolean } | null>(null);
  const readFresh = () => {
    if (captured.current?.start !== start) {
      captured.current = { start, fresh: live && isFreshPhase(start, clockOffsetMs) };
    }
    return captured.current.fresh;
  };
  return useClientValue(readFresh, false);
}
