import { describe, expect, test } from "vite-plus/test";
import { QUESTION_REVEAL_SECONDS_PER_GROUP } from "@/games/quizslop/game-constants";
import { createQuizslopFixtureBeats } from "./mock-quizslop-state";

describe("QuizSlop deterministic UI fixture", () => {
  test("teaches the four-beat loop before starting the first timer", () => {
    const beats = createQuizslopFixtureBeats(0);
    const topic = beats.find((beat) => beat.slug === "r1-topic-reveal");

    expect(topic?.stage.phase).toBe("TOPIC_REVEAL");
    expect(topic?.stage.phaseDeadline).toBeNull();
    expect(topic?.title).toContain("1 of 4");

    const firstRoundCorePhases = beats
      .filter((beat) => beat.stage.currentRound === 1)
      .map((beat) => beat.stage.phase)
      .filter(
        (phase) =>
          phase === "TOPIC_REVEAL" ||
          phase === "SLOP_CALL" ||
          phase === "ANSWER" ||
          phase === "QUESTION_REVEAL",
      );

    expect(firstRoundCorePhases).toEqual([
      "TOPIC_REVEAL",
      "SLOP_CALL",
      "ANSWER",
      "QUESTION_REVEAL",
    ]);
  });

  test("gives every question group its own readable reveal turn", () => {
    const beats = createQuizslopFixtureBeats(0);
    const expectedGroupsByRound = new Map([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 3],
      [5, 4],
      [6, 4],
    ]);

    for (const [round, expectedTotal] of expectedGroupsByRound) {
      const reveals = beats.filter(
        (beat) => beat.stage.currentRound === round && beat.stage.phase === "QUESTION_REVEAL",
      );

      expect(reveals).toHaveLength(expectedTotal);
      expect(reveals.map((beat) => beat.stage.revealOrdinal)).toEqual(
        Array.from({ length: expectedTotal }, (_, index) => index),
      );

      for (const [index, beat] of reveals.entries()) {
        expect(beat.stage.revealTotal).toBe(expectedTotal);
        expect(beat.stage.revealGroups).toHaveLength(index + 1);
        if (round === 1) {
          expect(beat.stage.phaseDeadline).toBeNull();
        } else {
          expect(
            new Date(beat.stage.phaseDeadline ?? 0).getTime() -
              new Date(beat.stage.serverNow).getTime(),
          ).toBe(QUESTION_REVEAL_SECONDS_PER_GROUP * 1000);
        }
      }
    }
  });

  test("uses the adaptive party-trivia phases rather than exam roles", () => {
    const phases = new Set<string>(createQuizslopFixtureBeats(0).map((beat) => beat.stage.phase));

    expect(phases).toContain("SLOP_CALL");
    expect(phases).toContain("QUESTION_REVEAL");
    expect(phases).not.toContain("SCRATCH");
    expect(phases).not.toContain("PROXY_ANSWER");
    expect(phases).not.toContain("FINAL_ACCUSATION");
  });
});
