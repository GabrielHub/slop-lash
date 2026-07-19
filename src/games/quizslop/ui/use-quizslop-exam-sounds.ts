"use client";

import { useEffect, useRef } from "react";
import { playSound, type SoundName } from "@/lib/sounds";
import type { QuizslopExamStageView } from "./quizslop-exam-contracts";

const SOUND_BY_PHASE: Record<QuizslopExamStageView["phase"], SoundName | null> = {
  LOBBY_SETUP: null,
  SECTION_INTRO: "round-transition",
  SCRATCH: "phase-transition",
  PROXY_ANSWER: "phase-transition",
  ORAL_DEFENSE: "vote-reveal",
  SECTION_RESULTS: "winner-reveal",
  PROCTOR_REVIEW_VOTE: "stamp-slam",
  PROCTOR_REVIEW_RESULT: "stamp-slam",
  FINAL_ACCUSATION: "phase-transition",
  FINAL_RESULTS: "game-over",
};

interface ExamSoundSnapshot {
  phase: QuizslopExamStageView["phase"];
  sectionNumber: number;
}

/** Shared-stage cues for the cooperative exam. Controllers play local submit feedback. */
export function useQuizslopExamSounds(view: QuizslopExamStageView | undefined): void {
  const phase = view?.phase ?? null;
  const sectionNumber = view?.sectionNumber ?? 0;
  const previousRef = useRef<ExamSoundSnapshot | null>(null);
  useEffect(() => {
    if (!phase) return;
    const current: ExamSoundSnapshot = {
      phase,
      sectionNumber,
    };
    const previous = previousRef.current;
    previousRef.current = current;
    if (!previous) return;
    if (previous.phase === current.phase && previous.sectionNumber === current.sectionNumber) {
      return;
    }

    const sound =
      previous.phase === "LOBBY_SETUP" && current.phase !== "LOBBY_SETUP"
        ? "game-start"
        : SOUND_BY_PHASE[current.phase];
    if (sound) playSound(sound);
    if (current.phase !== "FINAL_RESULTS") return;

    const celebrationTimer = window.setTimeout(() => playSound("celebration"), 1_800);
    return () => window.clearTimeout(celebrationTimer);
  }, [phase, sectionNumber]);

  const progressLocked = view?.assignmentProgress?.locked ?? null;
  const progressTotal = view?.assignmentProgress?.total ?? null;
  const previousProgressRef = useRef<{ key: string; locked: number } | null>(null);
  useEffect(() => {
    const current =
      phase && progressLocked !== null
        ? { key: `${phase}:${sectionNumber}`, locked: progressLocked }
        : null;
    const previous = previousProgressRef.current;
    previousProgressRef.current = current;
    if (
      !current ||
      !previous ||
      current.key !== previous.key ||
      current.locked <= previous.locked
    ) {
      return;
    }
    playSound(
      current.locked >= (progressTotal ?? Number.POSITIVE_INFINITY) ? "all-in" : "submitted",
    );
  }, [phase, progressLocked, progressTotal, sectionNumber]);
}
