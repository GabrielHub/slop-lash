import { describe, expect, it } from "vite-plus/test";
import { WARP_FEATHER, warpReach, warpWave } from "./warp-transition";

describe("warpWave", () => {
  it("runs from 0 to 1 and clamps outside the reveal", () => {
    expect(warpWave(-1)).toBe(0);
    expect(warpWave(0)).toBe(0);
    expect(warpWave(1)).toBe(1);
    expect(warpWave(2)).toBe(1);
  });

  it("covers most of the distance early, then settles", () => {
    expect(warpWave(0.25)).toBeGreaterThan(0.65);
    expect(warpWave(0.5)).toBeGreaterThan(warpWave(0.25));
    expect(warpWave(0.5)).toBeLessThan(1);
  });
});

describe("warpReach", () => {
  it("reaches the farthest corner, plus the feather", () => {
    expect(warpReach(0, 0, 300, 400)).toBe(500 + WARP_FEATHER);
    expect(warpReach(300, 400, 300, 400)).toBe(500 + WARP_FEATHER);
    expect(warpReach(150, 200, 300, 400)).toBe(250 + WARP_FEATHER);
  });
});
