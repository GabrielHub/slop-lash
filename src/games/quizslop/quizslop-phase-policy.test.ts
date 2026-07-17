import { describe, expect, test } from "vite-plus/test";
import { canHostAdvanceQuizslopPhase, isQuizslopSubmissionPhase } from "./quizslop-phase-policy";

describe("QuizSlop host phase policy", () => {
  test("submission phases can be closed only when timers are disabled", () => {
    expect(isQuizslopSubmissionPhase("ANSWER")).toBe(true);
    expect(canHostAdvanceQuizslopPhase("ANSWER", false)).toBe(false);
    expect(canHostAdvanceQuizslopPhase("ANSWER", true)).toBe(true);
  });

  test("passive phases always allow an explicit host continue", () => {
    expect(isQuizslopSubmissionPhase("QUESTION_REVEAL")).toBe(false);
    expect(canHostAdvanceQuizslopPhase("QUESTION_REVEAL", false)).toBe(true);
  });

  test("lobby, continuity, and terminal phases remain blocked", () => {
    for (const phase of [
      "LOBBY_SETUP",
      "CONTINUITY_GRACE",
      "FINAL_RESULTS",
      "ABANDONED",
    ] as const) {
      expect(canHostAdvanceQuizslopPhase(phase, true)).toBe(false);
    }
  });
});
