import { describe, expect, it } from "vite-plus/test";
import { orderMatchups, roundMultiplier, scoreMatchup } from "./scoring";

const both = [
  { id: "a", forfeited: false },
  { id: "b", forfeited: false },
];

describe("scoreMatchup", () => {
  it("one vote is worth 100 points in round 1", () => {
    const score = scoreMatchup(both, ["a"], 1);
    expect(score.outcome).toBe("win");
    expect(score.points).toEqual({ a: 100, b: 0 });
    expect(score.unit).toBe(100);
  });

  it("a split vote pays each side its own votes × 100", () => {
    const score = scoreMatchup(both, ["a", "a", "b"], 1);
    expect(score.points).toEqual({ a: 200, b: 100 });
    expect(score.winnerId).toBe("a");
    expect(score.unanimous).toBe(false);
  });

  it("a unanimous win of 2+ votes earns +50%", () => {
    expect(scoreMatchup(both, ["a", "a", "a"], 1).points).toEqual({ a: 450, b: 0 });
    const twoNil = scoreMatchup(both, ["b", "b"], 1);
    expect(twoNil.points).toEqual({ a: 0, b: 300 });
    expect(twoNil.unanimous).toBe(true);
  });

  it("a single vote never earns the unanimous bonus", () => {
    const score = scoreMatchup(both, ["a"], 1);
    expect(score.unanimous).toBe(false);
    expect(score.points.a).toBe(100);
  });

  it("a tie pays both answers", () => {
    const score = scoreMatchup(both, ["a", "b"], 1);
    expect(score.outcome).toBe("tie");
    expect(score.winnerId).toBeNull();
    expect(score.points).toEqual({ a: 100, b: 100 });
  });

  it("no cast votes pays nothing", () => {
    const score = scoreMatchup(both, [null, null], 1);
    expect(score.outcome).toBe("noVotes");
    expect(score.cast).toBe(0);
    expect(score.points).toEqual({ a: 0, b: 0 });
  });

  it("null and unknown ballots are ignored", () => {
    const score = scoreMatchup(both, ["a", null, "zzz", "a"], 1);
    expect(score.cast).toBe(2);
    expect(score.votes).toEqual({ a: 2, b: 0 });
    expect(score.points.a).toBe(300);
  });

  it("the round multiplier doubles each round", () => {
    expect([1, 2, 3, 4].map(roundMultiplier)).toEqual([1, 2, 4, 8]);
    expect(scoreMatchup(both, ["a", "b", "a"], 3).points).toEqual({ a: 800, b: 400 });
  });

  it("a walkover pays a flat 100 × multiplier and ignores ballots", () => {
    const answers = [
      { id: "a", forfeited: false },
      { id: "b", forfeited: true },
    ];
    const score = scoreMatchup(answers, ["a", "a", "b"], 2);
    expect(score.outcome).toBe("walkover");
    expect(score.winnerId).toBe("a");
    expect(score.cast).toBe(0);
    expect(score.points).toEqual({ a: 200, b: 0 });
  });

  it("a walkover never pays more than the smallest real win (rounds 1–10)", () => {
    const walkover = [
      { id: "a", forfeited: false },
      { id: "b", forfeited: true },
    ];
    for (let round = 1; round <= 10; round += 1) {
      const smallestWin = scoreMatchup(both, ["a"], round).points.a!;
      expect(scoreMatchup(walkover, [], round).points.a).toBeLessThanOrEqual(smallestWin);
    }
  });

  it("no answer on either side is void", () => {
    const score = scoreMatchup(
      [
        { id: "a", forfeited: true },
        { id: "b", forfeited: true },
      ],
      ["a"],
      1,
    );
    expect(score.outcome).toBe("void");
    expect(score.points).toEqual({ a: 0, b: 0 });
  });
});

describe("orderMatchups", () => {
  it("orderMatchups puts walkovers first and drops voids, stably", () => {
    const order = orderMatchups([
      { item: "p1", present: 2 },
      { item: "p2", present: 1 },
      { item: "p3", present: 0 },
      { item: "p4", present: 2 },
      { item: "p5", present: 1 },
    ]);
    expect(order).toEqual([
      { item: "p2", kind: "walkover" },
      { item: "p5", kind: "walkover" },
      { item: "p1", kind: "vote" },
      { item: "p4", kind: "vote" },
    ]);
  });
});
