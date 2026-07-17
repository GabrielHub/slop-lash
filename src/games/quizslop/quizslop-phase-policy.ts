import type { QuizslopPhase } from "./types";

const PASSIVE_PHASES: ReadonlySet<QuizslopPhase> = new Set([
  "HOUSE_VOTE_REVEAL",
  "TOPIC_REVEAL",
  "SLOP_CALL_REVEAL",
  "QUESTION_REVEAL",
  "ROUND_RESULTS",
]);

const SUBMISSION_PHASES: ReadonlySet<QuizslopPhase> = new Set([
  "HOUSE_VOTE",
  "SLOP_CALL",
  "ANSWER",
  "DISPUTE_WINDOW",
  "DISPUTE_VOTE",
]);

const HOST_ADVANCE_BLOCKED_PHASES: ReadonlySet<QuizslopPhase> = new Set([
  "LOBBY_SETUP",
  "CONTINUITY_GRACE",
  "FINAL_RESULTS",
  "ABANDONED",
]);

export function isQuizslopSubmissionPhase(phase: QuizslopPhase): boolean {
  return SUBMISSION_PHASES.has(phase);
}

export function canHostAdvanceQuizslopPhase(
  phase: QuizslopPhase,
  timersDisabled: boolean,
): boolean {
  if (HOST_ADVANCE_BLOCKED_PHASES.has(phase)) return false;
  return timersDisabled || PASSIVE_PHASES.has(phase);
}
