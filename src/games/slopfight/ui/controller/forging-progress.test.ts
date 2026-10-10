import { describe, expect, test } from "vite-plus/test";
import { forgeProgress, holdProgress, PROGRESS_CAP, THINKING_SHARE } from "./forging-progress";

describe("forge progress", () => {
  test("before the first part the bar only creeps through the thinking share", () => {
    const none = { streamed: 0, target: 8 };
    expect(forgeProgress(0, none)).toBe(0);
    expect(forgeProgress(12_000, none)).toBeGreaterThan(0.05);
    expect(forgeProgress(120_000, none)).toBeLessThanOrEqual(THINKING_SHARE);
    expect(forgeProgress(-5_000, none)).toBe(0);
  });

  test("streamed parts drive the bar against the soft target and never reach the end", () => {
    const at = (streamed: number, target = 8) => forgeProgress(3_000, { streamed, target });
    expect(at(1)).toBeGreaterThan(THINKING_SHARE);
    expect(at(4)).toBeCloseTo(THINKING_SHARE + (PROGRESS_CAP - THINKING_SHARE) / 2);
    expect(at(2)).toBeLessThan(at(4));
    expect(at(7)).toBeLessThan(PROGRESS_CAP);
    expect(at(8)).toBe(PROGRESS_CAP);
    expect(at(30)).toBe(PROGRESS_CAP);
    // Parts arriving early never move the bar below the thinking creep.
    expect(forgeProgress(600_000, { streamed: 1, target: 40 })).toBeGreaterThanOrEqual(
      forgeProgress(600_000, { streamed: 0, target: 40 }),
    );
  });

  test("without part counts it falls back to the time curve", () => {
    expect(forgeProgress(0)).toBe(0);
    expect(forgeProgress(16_000)).toBeGreaterThan(0.7);
    expect(forgeProgress(1_000_000)).toBeLessThanOrEqual(PROGRESS_CAP);
  });

  test("the bar never slides back within one forge, and resets for the next", () => {
    let held = holdProgress({ forge: null, value: 0 }, 100, 0.6);
    held = holdProgress(held, 100, 0.2);
    expect(held).toEqual({ forge: 100, value: 0.6 });
    held = holdProgress(held, 200, 0.05);
    expect(held).toEqual({ forge: 200, value: 0.05 });
  });
});
