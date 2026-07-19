import { describe, expect, test } from "vite-plus/test";
import { createQuizslopExamFixtureBeats } from "./mock-quizslop-exam-state";

describe("QuizSlop exam fixture scenarios", () => {
  test("models the suspended section without giving the suspended player a committee ballot", () => {
    const beat = createQuizslopExamFixtureBeats().find(
      (candidate) => candidate.slug === "committee-fallback",
    );

    expect(beat).toBeDefined();
    expect(beat?.controllers.P1.candidateAssignment).not.toBeNull();
    expect(beat?.controllers.P1.proxyAssignment).not.toBeNull();
    expect(beat?.controllers.P1.groupVoteAssignment).not.toBeNull();

    expect(beat?.controllers.P4.candidateAssignment).not.toBeNull();
    expect(beat?.controllers.P4.proxyAssignment).toBeNull();
    expect(beat?.controllers.P4.groupVoteAssignment).toBeNull();
  });

  test("keeps the requested mobile QA beats addressable in a stable order", () => {
    const slugs = createQuizslopExamFixtureBeats().map((beat) => beat.slug);

    expect(slugs).toEqual([
      "exam-lobby",
      "role-reveal",
      "scratch",
      "proxy-handoff",
      "oral-defense",
      "section-results",
      "midpoint-vote",
      "suspension-result",
      "committee-fallback",
      "committee-receipt",
      "integrity-hearing",
      "final-transcript",
    ]);
  });
});
