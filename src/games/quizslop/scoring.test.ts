import { describe, expect, test } from "vite-plus/test";
import {
  callDecided,
  computeAwards,
  quizPointsForRound,
  rankFinalStandings,
  getFinalStandingRank,
  settleRound,
  type AwardStats,
  type CallRoundSettlement,
  type FinalStanding,
  type PlayerRoundSettlement,
  type RoundSettlement,
  type RoundSettlementInput,
  type SettlementAssignment,
  type SettlementCall,
} from "./scoring";

function assignment(
  playerId: string,
  questionId: string,
  selectedIndex: number | null,
  correctIndex = 0,
): SettlementAssignment {
  return { playerId, questionId, selectedIndex, correctIndex };
}

function call(callerId: string, targetId: string): SettlementCall {
  return { callerId, targetId };
}

function settle(input: Partial<RoundSettlementInput>): RoundSettlement {
  return settleRound({
    isFinalRound: false,
    assignments: [],
    calls: [],
    ...input,
  });
}

function playerResult(result: RoundSettlement, playerId: string): PlayerRoundSettlement {
  const entry = result.players.find((player) => player.playerId === playerId);
  if (!entry) throw new Error(`expected a player settlement entry for ${playerId}`);
  return entry;
}

function callResult(result: RoundSettlement, callerId: string): CallRoundSettlement {
  const entry = result.calls.find((settled) => settled.callerId === callerId);
  if (!entry) throw new Error(`expected a call settlement entry for caller ${callerId}`);
  return entry;
}

describe("quizPointsForRound", () => {
  test("a normal round correct answer is worth 100 points", () => {
    expect(quizPointsForRound(false)).toBe(100);
  });

  test("the final round correct answer is worth 200 points", () => {
    expect(quizPointsForRound(true)).toBe(200);
  });
});

describe("settleRound quiz scoring", () => {
  test("a valid correct answer earns 100 points, a CORRECT ladder result, and answeredCorrectly true", () => {
    const result = settle({
      assignments: [assignment("p1", "q1", 2, 2)],
    });
    expect(playerResult(result, "p1")).toEqual({
      playerId: "p1",
      quizDelta: 100,
      callDelta: 0,
      tokensRefunded: 0,
      ladderResult: "CORRECT",
      answeredCorrectly: true,
    });
  });

  test("a correct final-round answer earns 200 points without changing anything else", () => {
    const result = settle({
      isFinalRound: true,
      assignments: [assignment("p1", "q1", 0, 0)],
    });
    const entry = playerResult(result, "p1");
    expect(entry.quizDelta).toBe(200);
    expect(entry.ladderResult).toBe("CORRECT");
    expect(entry.answeredCorrectly).toBe(true);
  });

  test("a wrong answer earns zero points, never subtracts quiz points, and lowers the ladder", () => {
    const result = settle({
      assignments: [assignment("p1", "q1", 1, 2)],
    });
    expect(playerResult(result, "p1")).toEqual({
      playerId: "p1",
      quizDelta: 0,
      callDelta: 0,
      tokensRefunded: 0,
      ladderResult: "INCORRECT",
      answeredCorrectly: false,
    });
  });

  test("an accountable timeout (null selectedIndex) is incorrect: zero points and an INCORRECT ladder", () => {
    const result = settle({
      assignments: [assignment("p1", "q1", null, 2)],
    });
    expect(playerResult(result, "p1")).toEqual({
      playerId: "p1",
      quizDelta: 0,
      callDelta: 0,
      tokensRefunded: 0,
      ladderResult: "INCORRECT",
      answeredCorrectly: false,
    });
  });

  test("a player with no assignment (pre-answer exemption) appears in the settlement only if they made a call", () => {
    const withoutCall = settle({
      assignments: [assignment("p1", "q1", 0, 0)],
    });
    expect(withoutCall.players.map((entry) => entry.playerId)).toEqual(["p1"]);

    const withCall = settle({
      assignments: [assignment("p1", "q1", 0, 0)],
      calls: [call("exempt-caller", "p1")],
    });
    expect(withCall.players.map((entry) => entry.playerId).toSorted()).toEqual([
      "exempt-caller",
      "p1",
    ]);
    const exemptCaller = playerResult(withCall, "exempt-caller");
    expect(exemptCaller.quizDelta).toBe(0);
    expect(exemptCaller.ladderResult).toBe("NEUTRAL");
    expect(exemptCaller.answeredCorrectly).toBeNull();
  });
});

describe("settleRound Call Slop", () => {
  test("target answers correctly: the caller loses 150 points (outcome LOST)", () => {
    const result = settle({
      assignments: [assignment("target", "q1", 2, 2)],
      calls: [call("caller", "target")],
    });
    expect(callResult(result, "caller")).toEqual({
      callerId: "caller",
      targetId: "target",
      outcome: "LOST",
      callDelta: -150,
      tokenRefunded: false,
    });
    expect(playerResult(result, "caller").callDelta).toBe(-150);
  });

  test("target answers incorrectly: the caller gains 150 points (outcome WON)", () => {
    const result = settle({
      assignments: [assignment("target", "q1", 1, 2)],
      calls: [call("caller", "target")],
    });
    expect(callResult(result, "caller")).toEqual({
      callerId: "caller",
      targetId: "target",
      outcome: "WON",
      callDelta: 150,
      tokenRefunded: false,
    });
    expect(playerResult(result, "caller").callDelta).toBe(150);
  });

  test("target times out after being answer-eligible (null selection): the caller WON", () => {
    const result = settle({
      assignments: [assignment("target", "q1", null, 2)],
      calls: [call("caller", "target")],
    });
    const settled = callResult(result, "caller");
    expect(settled.outcome).toBe("WON");
    expect(settled.callDelta).toBe(150);
    expect(settled.tokenRefunded).toBe(false);
  });

  test("a call on a target with no assignment is REFUNDED: token back, zero delta, tokensRefunded increments", () => {
    const result = settle({
      calls: [call("caller", "never-eligible")],
    });
    expect(callResult(result, "caller")).toEqual({
      callerId: "caller",
      targetId: "never-eligible",
      outcome: "REFUNDED",
      callDelta: 0,
      tokenRefunded: true,
    });
    const caller = playerResult(result, "caller");
    expect(caller.callDelta).toBe(0);
    expect(caller.tokensRefunded).toBe(1);
  });

  test("multiple callers on one target all settle independently", () => {
    const result = settle({
      assignments: [assignment("target", "q1", 0, 2)],
      calls: [call("c1", "target"), call("c2", "target"), call("c3", "target")],
    });
    expect(result.calls).toHaveLength(3);
    for (const callerId of ["c1", "c2", "c3"]) {
      expect(callResult(result, callerId).outcome).toBe("WON");
      expect(playerResult(result, callerId).callDelta).toBe(150);
    }
  });

  test("a caller who is also a target settles both roles in one round", () => {
    const result = settle({
      assignments: [assignment("p1", "q1", 2, 2), assignment("p2", "q2", 0, 3)],
      calls: [call("p1", "p2"), call("p2", "p1")],
    });
    // p1 answered correctly and called the incorrect p2: quiz +100, call +150.
    expect(playerResult(result, "p1")).toEqual({
      playerId: "p1",
      quizDelta: 100,
      callDelta: 150,
      tokensRefunded: 0,
      ladderResult: "CORRECT",
      answeredCorrectly: true,
    });
    // p2 answered incorrectly and called the correct p1: quiz 0, call -150.
    expect(playerResult(result, "p2")).toEqual({
      playerId: "p2",
      quizDelta: 0,
      callDelta: -150,
      tokensRefunded: 0,
      ladderResult: "INCORRECT",
      answeredCorrectly: false,
    });
    expect(callResult(result, "p1").outcome).toBe("WON");
    expect(callResult(result, "p2").outcome).toBe("LOST");
  });

  test("being called never changes the target's own score", () => {
    const result = settle({
      assignments: [assignment("target", "q1", 2, 2)],
      calls: [call("c1", "target"), call("c2", "target")],
    });
    const target = playerResult(result, "target");
    expect(target.quizDelta).toBe(100);
    expect(target.callDelta).toBe(0);
    expect(target.tokensRefunded).toBe(0);
  });

  test("total round delta can go below zero via a lost call: quizDelta + callDelta is negative", () => {
    const result = settle({
      assignments: [assignment("p1", "q1", 0, 2), assignment("p2", "q2", 1, 1)],
      calls: [call("p1", "p2")],
    });
    const p1 = playerResult(result, "p1");
    expect(p1.quizDelta).toBe(0);
    expect(p1.callDelta).toBe(-150);
    expect(p1.quizDelta + p1.callDelta).toBe(-150);
    expect(p1.quizDelta + p1.callDelta).toBeLessThan(0);
  });
});

function standing(
  playerId: string,
  total: number,
  quizSubtotal: number,
  successfulCalls: number,
): FinalStanding {
  return { playerId, total, quizSubtotal, successfulCalls };
}

describe("rankFinalStandings", () => {
  test("the highest total score wins", () => {
    const { ordered, winnerIds } = rankFinalStandings([
      standing("p-a", 100, 100, 0),
      standing("p-b", 300, 300, 0),
      standing("p-c", 200, 200, 0),
    ]);
    expect(ordered.map((entry) => entry.playerId)).toEqual(["p-b", "p-c", "p-a"]);
    expect(winnerIds).toEqual(["p-b"]);
  });

  test("a total tie resolves by the higher quiz subtotal before Call Slop adjustments", () => {
    const { ordered, winnerIds } = rankFinalStandings([
      standing("p-a", 250, 100, 5),
      standing("p-b", 250, 200, 0),
    ]);
    expect(ordered.map((entry) => entry.playerId)).toEqual(["p-b", "p-a"]);
    expect(winnerIds).toEqual(["p-b"]);
  });

  test("a total and quiz-subtotal tie resolves by the most successful Call Slop predictions", () => {
    const { ordered, winnerIds } = rankFinalStandings([
      standing("p-a", 250, 200, 1),
      standing("p-b", 250, 200, 2),
    ]);
    expect(ordered.map((entry) => entry.playerId)).toEqual(["p-b", "p-a"]);
    expect(winnerIds).toEqual(["p-b"]);
  });

  test("players tied on all three criteria are co-winners and winnerIds contains every tied leader", () => {
    const { winnerIds } = rankFinalStandings([
      standing("p-c", 400, 300, 1),
      standing("p-a", 400, 300, 1),
      standing("p-b", 400, 300, 1),
      standing("p-d", 100, 100, 0),
    ]);
    expect(winnerIds.toSorted()).toEqual(["p-a", "p-b", "p-c"]);
    expect(winnerIds).not.toContain("p-d");
  });

  test("remaining ties order deterministically by playerId for display only", () => {
    const { ordered, winnerIds } = rankFinalStandings([
      standing("p-c", 100, 100, 0),
      standing("p-a", 100, 100, 0),
      standing("p-d", 100, 100, 0),
      standing("p-b", 100, 100, 0),
    ]);
    expect(ordered.map((entry) => entry.playerId)).toEqual(["p-a", "p-b", "p-c", "p-d"]);
    expect(winnerIds).toEqual(["p-a", "p-b", "p-c", "p-d"]);
  });

  test("no standings means no winners", () => {
    expect(rankFinalStandings([])).toEqual({ ordered: [], winnerIds: [] });
  });

  test("uses competition ranks for exact ties", () => {
    const ordered = rankFinalStandings([
      standing("p-a", 400, 300, 1),
      standing("p-b", 400, 300, 1),
      standing("p-c", 300, 300, 0),
      standing("p-d", 300, 300, 0),
      standing("p-e", 100, 100, 0),
    ]).ordered;
    expect(ordered.map((_, index) => getFinalStandingRank(ordered, index))).toEqual([
      1, 1, 3, 3, 5,
    ]);
    expect(getFinalStandingRank(ordered, 99)).toBeNull();
  });
});

function awardStats(
  playerId: string,
  overrides: Partial<
    Pick<AwardStats, "successfulCalls" | "incorrectCalls" | "correctAnswers">
  > = {},
): AwardStats {
  return {
    playerId,
    successfulCalls: 0,
    incorrectCalls: 0,
    correctAnswers: 0,
    ...overrides,
  };
}

describe("computeAwards", () => {
  test("omits an award when its maximum count is zero", () => {
    const awards = computeAwards([
      awardStats("Alice", { successfulCalls: 2, correctAnswers: 1 }),
      awardStats("Bob", { successfulCalls: 1 }),
    ]);
    expect(awards.map((award) => award.kind)).toEqual(["CALLED_IT", "SUSPICIOUSLY_WELL_READ"]);
  });

  test("returns no awards at all when every stat is zero", () => {
    expect(computeAwards([awardStats("Alice"), awardStats("Bob")])).toEqual([]);
  });

  test("ties share the award: all players at the maximum are co-recipients", () => {
    const awards = computeAwards([
      awardStats("Alice", { successfulCalls: 2 }),
      awardStats("Bob", { successfulCalls: 2 }),
      awardStats("Cara", { successfulCalls: 1 }),
    ]);
    const calledIt = awards.find((award) => award.kind === "CALLED_IT");
    expect(calledIt?.recipients).toEqual(["Alice", "Bob"]);
    expect(calledIt?.recipients).not.toContain("Cara");
  });

  test('a count of one uses the singular stat: "1 bet won", "1 bet lost", "1 correct answer"', () => {
    const awards = computeAwards([
      awardStats("Alice", { successfulCalls: 1, incorrectCalls: 1, correctAnswers: 1 }),
    ]);
    expect(awards.map((award) => award.stat)).toEqual([
      "1 bet won",
      "1 bet lost",
      "1 correct answer",
    ]);
  });

  test('counts above one pluralize the stat: "2 bets won", "2 bets lost", "2 correct answers"', () => {
    const awards = computeAwards([
      awardStats("Alice", { successfulCalls: 2, incorrectCalls: 2, correctAnswers: 2 }),
    ]);
    expect(awards.map((award) => award.stat)).toEqual([
      "2 bets won",
      "2 bets lost",
      "2 correct answers",
    ]);
  });
});

describe("callDecided", () => {
  test("a player who bet or passed this round is decided", () => {
    expect(callDecided(true, 2)).toBe(true);
    expect(callDecided(true, 0)).toBe(true);
  });

  test("a player with no bets left is never waited on", () => {
    expect(callDecided(false, 0)).toBe(true);
  });

  test("a player with bets left who has not acted is undecided", () => {
    expect(callDecided(false, 1)).toBe(false);
    expect(callDecided(false, 2)).toBe(false);
  });
});
