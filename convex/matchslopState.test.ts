import { describe, expect, test } from "vite-plus/test";
import { applyPersonaMood, resolveAdvancePlan } from "./matchslopState";

describe("MatchSlop pure phase rules", () => {
  test("forces the opener to continue even when its mood lands below the unmatch threshold", () => {
    expect(applyPersonaMood(50, -40, "UNMATCHED", true)).toEqual({
      mood: 10,
      outcome: "CONTINUE",
    });
  });

  test("forces a later-round unmatch when mood falls to the threshold", () => {
    expect(applyPersonaMood(35, -15, "CONTINUE", false)).toEqual({
      mood: 20,
      outcome: "UNMATCHED",
    });
  });

  test("grants a one-time comeback even after the last normal round", () => {
    expect(
      resolveAdvancePlan({
        currentRound: 5,
        totalRounds: 5,
        comebackRound: null,
        personaOutcome: "UNMATCHED",
      }),
    ).toEqual({
      kind: "NEXT_ROUND",
      nextRound: 6,
      nextOutcome: "IN_PROGRESS",
      transcriptOutcome: "UNMATCHED",
      comebackRound: 6,
    });
  });

  test("ends a surviving comeback as a partial win", () => {
    expect(
      resolveAdvancePlan({
        currentRound: 6,
        totalRounds: 5,
        comebackRound: 6,
        personaOutcome: "CONTINUE",
      }),
    ).toEqual({
      kind: "FINAL_RESULTS",
      nextOutcome: "COMEBACK",
      transcriptOutcome: "COMEBACK",
      comebackRound: 6,
    });
  });
});
