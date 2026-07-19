import type { QuizslopPhase } from "./types";

const PASSIVE_PHASES: ReadonlySet<QuizslopPhase> = new Set([
  "SECTION_INTRO",
  "SECTION_RESULTS",
  "PROCTOR_REVIEW_RESULT",
]);

const BLOCKED_PHASES: ReadonlySet<QuizslopPhase> = new Set(["LOBBY_SETUP", "FINAL_RESULTS"]);

export function canHostAdvanceQuizslopPhase(
  phase: QuizslopPhase,
  timersDisabled: boolean,
): boolean {
  if (BLOCKED_PHASES.has(phase)) return false;
  return timersDisabled || PASSIVE_PHASES.has(phase);
}

const LABELS: Record<QuizslopPhase, string> = {
  LOBBY_SETUP: "Start exam",
  SECTION_INTRO: "Distribute scratch sheets",
  SCRATCH: "Collect scratch sheets",
  PROXY_ANSWER: "Lock official answers",
  ORAL_DEFENSE: "Close oral defenses",
  SECTION_RESULTS: "Continue exam",
  PROCTOR_REVIEW_VOTE: "Close review ballot",
  PROCTOR_REVIEW_RESULT: "Begin next section",
  FINAL_ACCUSATION: "Close integrity hearing",
  FINAL_RESULTS: "Continue",
};

export function getQuizslopHostAdvanceLabel(phase: QuizslopPhase): string {
  return LABELS[phase];
}
