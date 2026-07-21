"use client";

import { useEffect, useRef } from "react";
import { playSound, type SoundName } from "@/lib/sounds";
import type { QuizslopPhase } from "../types";
import type { QuizslopStageViewPayload } from "./quizslop-view-contracts";

const SOUND_BY_PHASE: Record<QuizslopPhase, SoundName | null> = {
  LOBBY_SETUP: null,
  HOUSE_VOTE: "phase-transition",
  HOUSE_VOTE_REVEAL: "vote-reveal",
  TOPIC_REVEAL: "round-transition",
  SLOP_CALL: "phase-transition",
  SLOP_CALL_REVEAL: "stamp-slam",
  ANSWER: "phase-transition",
  QUESTION_REVEAL: "vote-reveal",
  DISPUTE_VOTE: "vote-cast",
  ROUND_RESULTS: "winner-reveal",
  CONTINUITY_GRACE: "phase-transition",
  FINAL_RESULTS: "game-over",
  ABANDONED: "game-over",
};

interface QuizslopSoundSnapshot {
  phase: QuizslopPhase;
  round: number;
  revealOrdinal: number;
}

/** Stage cues follow meaningful round beats and never gate a phase transition. */
export function useQuizslopSounds(view: QuizslopStageViewPayload | undefined): void {
  const phase = view?.phase ?? null;
  const round = view?.currentRound ?? 0;
  const revealOrdinal = view?.revealOrdinal ?? 0;
  const previousRef = useRef<QuizslopSoundSnapshot | null>(null);

  useEffect(() => {
    if (!phase) return;
    const current = { phase, round, revealOrdinal };
    const previous = previousRef.current;
    previousRef.current = current;
    if (!previous) return;

    if (
      previous.phase === current.phase &&
      previous.round === current.round &&
      previous.revealOrdinal === current.revealOrdinal
    ) {
      return;
    }

    const started = previous.phase === "LOBBY_SETUP" && current.phase !== "LOBBY_SETUP";
    const advancedReveal =
      current.phase === "QUESTION_REVEAL" &&
      previous.phase === "QUESTION_REVEAL" &&
      current.revealOrdinal > previous.revealOrdinal;
    const sound = started
      ? "game-start"
      : advancedReveal
        ? "prompt-advance"
        : SOUND_BY_PHASE[current.phase];
    if (sound) playSound(sound);

    if (current.phase !== "FINAL_RESULTS") return;
    const celebrationTimer = window.setTimeout(() => playSound("celebration"), 1_800);
    return () => window.clearTimeout(celebrationTimer);
  }, [phase, revealOrdinal, round]);
}
