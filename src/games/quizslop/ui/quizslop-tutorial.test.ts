import { describe, expect, test } from "vite-plus/test";
import { QUIZSLOP_PHASES } from "../types";
import { getQuizslopTutorialStep } from "./quizslop-tutorial";

describe("QuizSlop tutorial copy", () => {
  test("keeps every phase instruction brief and scannable", () => {
    for (const phase of QUIZSLOP_PHASES) {
      const step = getQuizslopTutorialStep({ phase });
      expect(step.title.length).toBeLessThanOrEqual(32);
      expect(step.body.length).toBeLessThanOrEqual(110);
      expect(step.title).not.toContain("\n");
      expect(step.body).not.toContain("\n");
    }
  });

  test("explains the cooperative answer handoff without exposing hidden difficulty", () => {
    expect(
      getQuizslopTutorialStep({
        phase: "PROXY_ANSWER",
      }).body,
    ).toContain("file official answers");
    expect(getQuizslopTutorialStep({ phase: "SCRATCH" }).body).toContain("hidden difficulty");
  });
});
