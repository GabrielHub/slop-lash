"use client";

import { useMemo } from "react";
import { useCues } from "@/tutorial/clock";
import type { Cues } from "@/tutorial/timeline";

/** The voice's cues in a shot's local seconds (global minus the shot's `from`). */
export interface Beats {
  cues: Cues;
  at(id: string, offset?: number): number;
  end(id: string, offset?: number): number;
  word(id: string, word: string, nth?: number): number;
  wordEnd(id: string, word: string, nth?: number): number;
}

export function beatsFor(cues: Cues, origin: number): Beats {
  return {
    cues,
    at: (id, offset = 0) => cues.at(id, offset) - origin,
    end: (id, offset = 0) => cues.end(id, offset) - origin,
    word: (id, word, nth) => cues.word(id, word, nth) - origin,
    wordEnd: (id, word, nth) => cues.wordEnd(id, word, nth) - origin,
  };
}

export function useBeats(origin: number): Beats {
  const cues = useCues();
  return useMemo(() => beatsFor(cues, origin), [cues, origin]);
}

/**
 * Where each shot starts and ends on the global clock. Chapter cuts land a
 * hair before their first line, under a pixel sweep.
 */
export function shotTimes(cues: Cues) {
  const writeCut = cues.at("prompts") - 0.08;
  const arenaFrom = cues.at("rival");
  const roundsCut = cues.at("double") - 0.06;
  const finaleFrom = cues.at("outro") - 0.05;
  return {
    titleTo: writeCut,
    writeFrom: writeCut,
    writeTo: arenaFrom,
    arenaFrom,
    arenaTo: roundsCut,
    roundsFrom: roundsCut,
    roundsTo: finaleFrom,
    finaleFrom,
    /** The sweep transitions, each centred on its cut. */
    sweeps: [writeCut, roundsCut],
  };
}
