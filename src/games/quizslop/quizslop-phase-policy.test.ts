import { describe, expect, test } from "vite-plus/test";
import { canHostAdvanceQuizslopPhase, getQuizslopHostAdvanceLabel } from "./quizslop-phase-policy";

describe("QuizSlop host phase policy", () => {
  test("submission phases are host-closable only in Tutorial Mode", () => {
    expect(canHostAdvanceQuizslopPhase("PROXY_ANSWER", false)).toBe(false);
    expect(canHostAdvanceQuizslopPhase("PROXY_ANSWER", true)).toBe(true);
  });

  test("passive section beats always allow host continue", () => {
    expect(canHostAdvanceQuizslopPhase("SECTION_RESULTS", false)).toBe(true);
  });

  test("labels describe the next exam action", () => {
    expect(getQuizslopHostAdvanceLabel("SCRATCH")).toBe("Collect scratch sheets");
    expect(getQuizslopHostAdvanceLabel("PROXY_ANSWER")).toBe("Lock official answers");
    expect(getQuizslopHostAdvanceLabel("FINAL_ACCUSATION")).toBe("Close integrity hearing");
  });

  test("lobby and terminal phases stay blocked", () => {
    for (const phase of ["LOBBY_SETUP", "FINAL_RESULTS"] as const) {
      expect(canHostAdvanceQuizslopPhase(phase, true)).toBe(false);
    }
  });
});
