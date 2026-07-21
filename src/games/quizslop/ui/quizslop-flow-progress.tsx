"use client";

import { motion } from "motion/react";
import type { QuizslopPhase } from "../types";
import {
  ANSWER_SECONDS,
  CONTINUITY_GRACE_SECONDS,
  DISPUTE_VOTE_SECONDS,
  HOUSE_VOTE_REVEAL_SECONDS,
  HOUSE_VOTE_SECONDS,
  QUESTION_REVEAL_SECONDS_PER_GROUP,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_REVEAL_SECONDS,
  SLOP_CALL_SECONDS,
  TOPIC_REVEAL_SECONDS,
} from "../game-constants";

export const QUIZSLOP_ROUND_BEATS = ["Topic", "Call Slop", "Answer", "Reveal"] as const;

const BEAT_BY_PHASE: Record<QuizslopPhase, number | null> = {
  LOBBY_SETUP: null,
  HOUSE_VOTE: 0,
  HOUSE_VOTE_REVEAL: 0,
  TOPIC_REVEAL: 0,
  SLOP_CALL: 1,
  SLOP_CALL_REVEAL: 1,
  ANSWER: 2,
  QUESTION_REVEAL: 3,
  DISPUTE_VOTE: 3,
  ROUND_RESULTS: 3,
  CONTINUITY_GRACE: 3,
  FINAL_RESULTS: 3,
  ABANDONED: 3,
};

const PHASE_HELP: Partial<Record<QuizslopPhase, string>> = {
  HOUSE_VOTE: "Choose the last topic together. Everyone gets one vote.",
  HOUSE_VOTE_REVEAL: "The winning topic is revealed before the final round begins.",
  TOPIC_REVEAL: "Meet the topic. The first question comes after Call Slop.",
  SLOP_CALL:
    "Predict one friend's miss with a token, or hold. If they miss: +150. If they're right: -150. Targets reveal before questions.",
  SLOP_CALL_REVEAL: "Calls are now public. Next, each player gets one private question.",
  ANSWER: "Answer privately, lock one choice, then stay quiet until the shared reveal.",
  QUESTION_REVEAL:
    "Read and react together. Each distinct question gets its own reveal turn. Only use Challenge for a broken question or key; ordinary debate stays in the room.",
  DISPUTE_VOTE: "Vote to keep a challenged answer key or throw that question out.",
  ROUND_RESULTS: "Quiz points and Call Slop points settle here. The next topic follows.",
  CONTINUITY_GRACE:
    "The show is paused for reconnects. It resumes with two players, or ends when this timer expires.",
};

export function getQuizslopFlowBeatIndex(phase: QuizslopPhase): number | null {
  return BEAT_BY_PHASE[phase];
}

export function getQuizslopPhaseTimerTotal(phase: QuizslopPhase): number | undefined {
  switch (phase) {
    case "HOUSE_VOTE":
      return HOUSE_VOTE_SECONDS;
    case "HOUSE_VOTE_REVEAL":
      return HOUSE_VOTE_REVEAL_SECONDS;
    case "TOPIC_REVEAL":
      return TOPIC_REVEAL_SECONDS;
    case "SLOP_CALL":
      return SLOP_CALL_SECONDS;
    case "SLOP_CALL_REVEAL":
      return SLOP_CALL_REVEAL_SECONDS;
    case "ANSWER":
      return ANSWER_SECONDS;
    case "QUESTION_REVEAL":
      return QUESTION_REVEAL_SECONDS_PER_GROUP;
    case "DISPUTE_VOTE":
      return DISPUTE_VOTE_SECONDS;
    case "ROUND_RESULTS":
      return ROUND_RESULTS_SECONDS;
    case "CONTINUITY_GRACE":
      return CONTINUITY_GRACE_SECONDS;
    case "LOBBY_SETUP":
    case "FINAL_RESULTS":
    case "ABANDONED":
      return undefined;
  }
}

export function getQuizslopFirstRoundHelp(phase: QuizslopPhase): string | null {
  return PHASE_HELP[phase] ?? null;
}

export function getQuizslopAdvanceLabel(
  phase: QuizslopPhase,
  revealOrdinal: number,
  revealTotal: number,
  currentRound: number,
  totalRounds: number,
): string {
  switch (phase) {
    case "HOUSE_VOTE":
      return "Close final vote";
    case "HOUSE_VOTE_REVEAL":
      return "Show final topic";
    case "TOPIC_REVEAL":
      return "Open Call Slop";
    case "SLOP_CALL":
      return "Close calls";
    case "SLOP_CALL_REVEAL":
      return "Open private questions";
    case "ANSWER":
      return "Close answers";
    case "QUESTION_REVEAL":
      return revealOrdinal + 1 < revealTotal ? "Reveal next question" : "Finish reveal";
    case "DISPUTE_VOTE":
      return revealOrdinal + 1 < revealTotal ? "Next ruling" : "Finish rulings";
    case "ROUND_RESULTS":
      return currentRound >= totalRounds ? "Show final scores" : "Next round";
    case "CONTINUITY_GRACE":
    case "FINAL_RESULTS":
    case "ABANDONED":
      return "Continue";
    case "LOBBY_SETUP":
      return "Start game";
  }
}

export function getQuizslopPhaseAnnouncement(
  phase: QuizslopPhase,
  currentRound: number,
  totalRounds: number,
  revealOrdinal: number,
  revealTotal: number,
): string {
  const round = totalRounds > 0 ? `Round ${currentRound} of ${totalRounds}. ` : "";
  switch (phase) {
    case "LOBBY_SETUP":
      return "QuizSlop lobby. Choose a Home Topic and wait for the host.";
    case "HOUSE_VOTE":
      return `${round}Final topic vote.`;
    case "HOUSE_VOTE_REVEAL":
      return `${round}Final topic vote result.`;
    case "TOPIC_REVEAL":
      return `${round}Step 1 of 4: Topic reveal.`;
    case "SLOP_CALL":
      return `${round}Step 2 of 4: Call Slop or hold.`;
    case "SLOP_CALL_REVEAL":
      return `${round}Step 2 of 4: Calls revealed.`;
    case "ANSWER":
      return `${round}Step 3 of 4: Answer privately.`;
    case "QUESTION_REVEAL":
      return `${round}Step 4 of 4: Shared reveal, question ${Math.min(revealOrdinal + 1, revealTotal)} of ${revealTotal}.`;
    case "DISPUTE_VOTE":
      return `${round}Vote on challenged question ${Math.min(revealOrdinal + 1, revealTotal)} of ${revealTotal}.`;
    case "ROUND_RESULTS":
      return `${round}Round scores.`;
    case "CONTINUITY_GRACE":
      return `${round}Waiting for players to reconnect.`;
    case "FINAL_RESULTS":
      return "QuizSlop final scores.";
    case "ABANDONED":
      return "QuizSlop ended because too many players left.";
  }
}

export function QuizslopFlowProgress({
  phase,
  currentRound,
  tutorialMode = false,
  surface,
}: {
  phase: QuizslopPhase;
  currentRound: number;
  tutorialMode?: boolean;
  surface: "stage" | "controller";
}) {
  const activeBeat = getQuizslopFlowBeatIndex(phase);
  if (activeBeat === null) return null;
  const help = currentRound === 1 || tutorialMode ? getQuizslopFirstRoundHelp(phase) : null;
  const stage = surface === "stage";

  return (
    <nav aria-label="Round flow" className={stage ? "mx-auto w-full max-w-5xl" : "w-full"}>
      <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {QUIZSLOP_ROUND_BEATS.map((label, index) => {
          const current = index === activeBeat;
          const complete = index < activeBeat;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={`relative flex min-h-14 items-center justify-center gap-2 overflow-hidden rounded-xl border px-2 py-2 text-center ${
                stage ? "sm:min-h-16 sm:px-4" : ""
              }`}
              style={{
                borderColor: current ? "var(--qs-signal)" : "var(--qs-edge)",
                background: current
                  ? "var(--qs-signal-soft)"
                  : complete
                    ? "var(--qs-raised)"
                    : "var(--qs-surface)",
                color: current ? "var(--qs-ink)" : "var(--qs-ink-dim)",
                opacity: index > activeBeat ? 0.64 : 1,
              }}
            >
              {current ? (
                <motion.span
                  layoutId={`quizslop-current-beat-${surface}`}
                  className="absolute inset-x-2 bottom-0 h-1 rounded-full"
                  style={{ background: "var(--qs-signal)" }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                />
              ) : null}
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-black"
                style={{
                  background: current
                    ? "var(--qs-signal)"
                    : complete
                      ? "var(--qs-edge-strong)"
                      : "var(--qs-raised)",
                  color: current ? "var(--qs-accent-ink)" : "var(--qs-ink)",
                }}
              >
                {index + 1}
              </span>
              <span
                className={`${stage ? "text-sm sm:text-base" : "text-xs sm:text-sm"} font-display font-black leading-tight`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {help ? (
        <motion.p
          key={`${phase}:${currentRound}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${stage ? "text-base sm:text-lg" : "text-sm"} mt-3 rounded-xl border-l-4 px-4 py-3 leading-relaxed`}
          style={{
            borderColor: "var(--qs-marquee)",
            background: "var(--qs-marquee-soft)",
            color: "var(--qs-ink)",
          }}
        >
          <strong>Step {activeBeat + 1}:</strong> {help}
          {tutorialMode ? " The host moves on when the room is ready." : ""}
        </motion.p>
      ) : null}
    </nav>
  );
}
