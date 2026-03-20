import { describe, expect, it } from "vitest";
import { calculateResponsePoints, pickRoundWinner } from "./game-logic-voting";
import type { MatchSlopRoundResult } from "./types";

function makeResult(
  winnerResponseId: string,
  weightedVotes: number,
  rawVotes: number,
): MatchSlopRoundResult {
  return {
    promptId: `prompt-${winnerResponseId}`,
    winnerResponseId,
    winnerPlayerId: `player-${winnerResponseId}`,
    winnerText: `text-${winnerResponseId}`,
    authorName: `Author ${winnerResponseId}`,
    weightedVotes,
    rawVotes,
    selectedPromptId: null,
    selectedPromptText: null,
  };
}

describe("pickRoundWinner", () => {
  it("returns null when every response has zero votes", () => {
    expect(
      pickRoundWinner([
        makeResult("resp-b", 0, 0),
        makeResult("resp-a", 0, 0),
      ]),
    ).toBeNull();
  });

  it("returns the highest-scoring response when votes exist", () => {
    expect(
      pickRoundWinner([
        makeResult("resp-a", 1, 1),
        makeResult("resp-b", 3, 2),
        makeResult("resp-c", 2, 3),
      ]),
    ).toMatchObject({ winnerResponseId: "resp-b" });
  });
});

describe("calculateResponsePoints", () => {
  it("scales points with weighted votes and adds a winner bonus", () => {
    expect(calculateResponsePoints(makeResult("resp-a", 4, 3), false)).toBe(100);
    expect(calculateResponsePoints(makeResult("resp-b", 4, 3), true)).toBe(150);
  });

  it("awards zero points when a response gets no votes", () => {
    expect(calculateResponsePoints(makeResult("resp-a", 0, 0), false)).toBe(0);
    expect(calculateResponsePoints(makeResult("resp-b", 0, 0), true)).toBe(0);
  });
});
