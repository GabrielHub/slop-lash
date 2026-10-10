import { describe, expect, it } from "vite-plus/test";
import { betPoints, isFinish, scoreFight, totalsByPlayer, winPoints } from "./scoring";

const owners = { A: "ana", B: "bo" } as const;

describe("scoreFight", () => {
  it("pays the winning owner 200 for a decision", () => {
    expect(
      scoreFight({ isFinal: false, winner: "A", method: "DECISION", owners, bets: [] }),
    ).toEqual([{ playerId: "ana", reason: "WIN", points: 200 }]);
  });

  it("adds 100 for a KO or a ring-out, not for sudden death", () => {
    for (const method of ["KO", "RINGOUT"] as const) {
      const awards = scoreFight({ isFinal: false, winner: "B", method, owners, bets: [] });
      expect(totalsByPlayer(awards).get("bo")).toBe(300);
    }
    const sudden = scoreFight({
      isFinal: false,
      winner: "B",
      method: "SUDDEN_DEATH",
      owners,
      bets: [],
    });
    expect(totalsByPlayer(sudden).get("bo")).toBe(200);
  });

  it("doubles the win and the bets in the Final, not the finish bonus", () => {
    const awards = scoreFight({
      isFinal: true,
      winner: "A",
      method: "KO",
      owners,
      bets: [
        { playerId: "cy", side: "A" },
        { playerId: "di", side: "B" },
      ],
    });
    expect(awards).toEqual([
      { playerId: "ana", reason: "WIN", points: 400 },
      { playerId: "ana", reason: "FINISH", points: 100 },
      { playerId: "cy", reason: "BET", points: 200 },
    ]);
  });

  it("pays correct bets 100 and wrong ones nothing", () => {
    const awards = scoreFight({
      isFinal: false,
      winner: "B",
      method: "DECISION",
      owners,
      bets: [
        { playerId: "ana", side: "A" },
        { playerId: "bo", side: "B" },
        { playerId: "cy", side: "B" },
      ],
    });
    const totals = totalsByPlayer(awards);
    expect(totals.get("ana")).toBeUndefined();
    expect(totals.get("bo")).toBe(300);
    expect(totals.get("cy")).toBe(100);
  });

  it("house champions score nothing, and bets on them still pay", () => {
    const awards = scoreFight({
      isFinal: false,
      winner: "A",
      method: "RINGOUT",
      owners: { A: null, B: "bo" },
      bets: [{ playerId: "bo", side: "A" }],
    });
    expect(awards).toEqual([{ playerId: "bo", reason: "BET", points: 100 }]);
  });

  it("a duplicate bet row never pays twice", () => {
    const awards = scoreFight({
      isFinal: false,
      winner: "A",
      method: "DECISION",
      owners: { A: null, B: null },
      bets: [
        { playerId: "cy", side: "A" },
        { playerId: "cy", side: "A" },
      ],
    });
    expect(awards).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("names finishes and point values", () => {
    expect(isFinish("KO")).toBe(true);
    expect(isFinish("DECISION")).toBe(false);
    expect([winPoints(false), winPoints(true), betPoints(false), betPoints(true)]).toEqual([
      200, 400, 100, 200,
    ]);
  });
});
