import { describe, expect, it } from "vite-plus/test";
import { flightOrder, revealTimeline } from "./reveal-timeline";

describe("revealTimeline", () => {
  it("times a 1-0 plain win", () => {
    expect(revealTimeline(1, false)).toEqual({
      flights: [500],
      verdict: 1600,
      unmask: 2200,
      stamp: null,
      impact: null,
      reactions: 2900,
    });
  });

  it("times a 1-1 tie", () => {
    expect(revealTimeline(2, true)).toEqual({
      flights: [500, 740],
      verdict: 1600,
      unmask: 2200,
      stamp: 2900,
      impact: 3070,
      reactions: 3770,
    });
  });

  it("times a matchup nobody voted on", () => {
    expect(revealTimeline(0, true)).toEqual({
      flights: [],
      verdict: 1000,
      unmask: 1600,
      stamp: 2300,
      impact: 2470,
      reactions: 3170,
    });
  });

  it("times a 3-0 slop", () => {
    expect(revealTimeline(3, true)).toEqual({
      flights: [500, 740, 980],
      verdict: 1680,
      unmask: 2280,
      stamp: 2980,
      impact: 3150,
      reactions: 3850,
    });
  });

  it("times the worst case: six votes and a stamp", () => {
    const timeline = revealTimeline(6, true);
    expect(timeline.flights).toEqual([500, 740, 980, 1220, 1460, 1700]);
    expect(timeline).toMatchObject({
      verdict: 2400,
      unmask: 3000,
      stamp: 3700,
      impact: 3870,
      reactions: 4570,
    });
  });

  it("reactions land by 5000ms for any cast ≤ 6", () => {
    for (let cast = 0; cast <= 6; cast++) {
      for (const stamp of [false, true]) {
        expect(revealTimeline(cast, stamp).reactions).toBeLessThanOrEqual(5000);
      }
    }
  });
});

describe("flightOrder", () => {
  const votes = (picks: string) => picks.split("").map((pick) => ({ responseId: pick }));
  const sides = (picks: string) =>
    flightOrder(votes(picks), "A", "B")
      .map((index) => picks[index])
      .join(" ");

  it("flies the minority first, alternating: 4-2 is B A B A A A", () => {
    expect(sides("AAAABB")).toBe("B A B A A A");
  });

  it("flies a sweep in order: 3-0 is A A A", () => {
    expect(sides("AAA")).toBe("A A A");
  });

  it("starts an even split on the left: 1-1 is A B", () => {
    expect(sides("BA")).toBe("A B");
  });

  it("leaves out votes for neither answer", () => {
    expect(flightOrder([{ responseId: null }, { responseId: "B" }], "A", "B")).toEqual([1]);
  });
});
