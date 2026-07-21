import { describe, expect, test } from "vite-plus/test";
import { computeRemainingSeconds, computeTimerPercentage, getTimerUrgency } from "./timer";

describe("timer math", () => {
  test("rounds remaining time up and clamps expired or malformed deadlines", () => {
    const deadline = "2026-07-16T00:00:10.000Z";
    expect(computeRemainingSeconds(deadline, Date.parse("2026-07-16T00:00:00.001Z"))).toBe(10);
    expect(computeRemainingSeconds(deadline, Date.parse("2026-07-16T00:00:10.001Z"))).toBe(0);
    expect(computeRemainingSeconds("not-a-date", Date.now())).toBe(0);
    expect(computeRemainingSeconds(null, Date.now())).toBe(0);
  });

  test("keeps progress width within its valid range", () => {
    expect(computeTimerPercentage(45, 90)).toBe(50);
    expect(computeTimerPercentage(120, 90)).toBe(100);
    expect(computeTimerPercentage(-1, 90)).toBe(0);
    expect(computeTimerPercentage(10, 0)).toBe(0);
  });

  test("shows absolute urgency after a late reconnect even when the derived bar is full", () => {
    expect(getTimerUrgency(100, 5)).toBe("urgent");
    expect(getTimerUrgency(100, 10)).toBe("warning");
    expect(getTimerUrgency(100, 20)).toBe("normal");
  });
});
