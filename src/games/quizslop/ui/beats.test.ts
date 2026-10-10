import { describe, expect, test } from "vite-plus/test";
import { STAMP_IMPACT_MS } from "@/lib/animations";
import { answerBetTimes, explanationAt, finalTimes, revealBetTimes } from "./beats";

function monotonic(times: number[]) {
  return times.every((time, index) => index === 0 || time > times[index - 1]!);
}

describe("QuizSlop beats", () => {
  test("the final lands its last award within 6s of the anchor", () => {
    const { bars, winner, awards } = finalTimes(7, 3);
    expect(awards.at(-1)! + STAMP_IMPACT_MS).toBeLessThanOrEqual(6000);
    expect(winner).toBeGreaterThan(bars.at(-1)!);
  });

  test("a lone winner still gets a beat", () => {
    expect(finalTimes(0, 0)).toEqual({ bars: [], winner: 500, celebrate: 1100, awards: [] });
    expect(finalTimes(1, 1).bars).toEqual([500]);
  });

  test("the explanation never waits past 4.8s", () => {
    expect(explanationAt(0)).toBe(3200);
    expect(explanationAt(8)).toBeLessThanOrEqual(4800);
    expect(explanationAt(1)).toBe(3900);
  });

  test("bet beats run in order", () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      expect(monotonic(answerBetTimes(n))).toBe(true);
      expect(monotonic(revealBetTimes(n))).toBe(true);
      expect(answerBetTimes(n)).toHaveLength(n);
    }
  });
});
