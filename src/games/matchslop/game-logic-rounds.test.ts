import { describe, expect, it } from "vitest";
import { resolveAdvancePlan } from "./game-logic-rounds";

describe("resolveAdvancePlan", () => {
  it("keeps a normal conversation moving when the persona wants to continue before the limit", () => {
    expect(
      resolveAdvancePlan({
        currentRound: 2,
        totalRounds: 5,
        comebackRound: null,
        personaOutcome: "CONTINUE",
      }),
    ).toEqual({
      kind: "NEXT_ROUND",
      nextRound: 3,
      nextOutcome: "IN_PROGRESS",
      transcriptOutcome: "CONTINUE",
      comebackRound: null,
    });
  });

  it("turns an unmatched reply into a one-time comeback round", () => {
    expect(
      resolveAdvancePlan({
        currentRound: 4,
        totalRounds: 5,
        comebackRound: null,
        personaOutcome: "UNMATCHED",
      }),
    ).toEqual({
      kind: "NEXT_ROUND",
      nextRound: 5,
      nextOutcome: "IN_PROGRESS",
      transcriptOutcome: "UNMATCHED",
      comebackRound: 5,
    });
  });

  it("still grants the comeback round even when the unmatched reply happens on the last normal turn", () => {
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

  it("ends in a turn-limit loss when the normal round cap is reached without a decision", () => {
    expect(
      resolveAdvancePlan({
        currentRound: 5,
        totalRounds: 5,
        comebackRound: null,
        personaOutcome: "CONTINUE",
      }),
    ).toEqual({
      kind: "FINAL_RESULTS",
      nextOutcome: "TURN_LIMIT",
      transcriptOutcome: "TURN_LIMIT",
      comebackRound: null,
    });
  });

  it("ends the comeback round in a partial win when the persona does not unmatch again", () => {
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

  it("keeps the comeback round as a failure when the persona unmatches again", () => {
    expect(
      resolveAdvancePlan({
        currentRound: 6,
        totalRounds: 5,
        comebackRound: 6,
        personaOutcome: "UNMATCHED",
      }),
    ).toEqual({
      kind: "FINAL_RESULTS",
      nextOutcome: "UNMATCHED",
      transcriptOutcome: "UNMATCHED",
      comebackRound: 6,
    });
  });
});
