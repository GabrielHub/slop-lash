import { describe, expect, test } from "vite-plus/test";
import { applyLadderResult, INITIAL_TIER, tierIndex } from "./difficulty";
import type { QuizslopTier } from "./types";
import { QUIZSLOP_TIERS } from "./types";

describe("hidden difficulty ladder start", () => {
  test("every frozen player begins each new game at hidden tier EASY (INITIAL_TIER)", () => {
    expect(INITIAL_TIER).toBe("EASY");
    expect(tierIndex(INITIAL_TIER)).toBe(0);
    expect(QUIZSLOP_TIERS[0]).toBe(INITIAL_TIER);
  });
});

describe("applyLadderResult single steps", () => {
  test("a valid CORRECT answer raises the tier exactly one step", () => {
    expect(applyLadderResult("EASY", "CORRECT")).toBe("MEDIUM");
    expect(applyLadderResult("MEDIUM", "CORRECT")).toBe("HARD");
    expect(applyLadderResult("HARD", "CORRECT")).toBe("INSANE");
  });

  test("a valid INCORRECT answer (including an accountable timeout) lowers the tier exactly one step", () => {
    expect(applyLadderResult("INSANE", "INCORRECT")).toBe("HARD");
    expect(applyLadderResult("HARD", "INCORRECT")).toBe("MEDIUM");
    expect(applyLadderResult("MEDIUM", "INCORRECT")).toBe("EASY");
  });

  test("a NEUTRAL result (voided question, exemption, or system fault) leaves every tier unchanged", () => {
    for (const tier of QUIZSLOP_TIERS) {
      expect(applyLadderResult(tier, "NEUTRAL")).toBe(tier);
    }
  });
});

describe("applyLadderResult bounds", () => {
  test("EASY clamps at the bottom bound: INCORRECT at EASY stays EASY", () => {
    expect(applyLadderResult("EASY", "INCORRECT")).toBe("EASY");
  });

  test("INSANE clamps at the top bound: CORRECT at INSANE stays INSANE", () => {
    expect(applyLadderResult("INSANE", "CORRECT")).toBe("INSANE");
  });
});

describe("full ladder walk", () => {
  test("four straight CORRECT results walk EASY -> MEDIUM -> HARD -> INSANE -> INSANE", () => {
    let tier: QuizslopTier = INITIAL_TIER;
    const walk: QuizslopTier[] = [];
    for (let step = 0; step < 4; step += 1) {
      tier = applyLadderResult(tier, "CORRECT");
      walk.push(tier);
    }
    expect(walk).toEqual(["MEDIUM", "HARD", "INSANE", "INSANE"]);
  });

  test("four straight INCORRECT results walk INSANE -> HARD -> MEDIUM -> EASY -> EASY", () => {
    let tier: QuizslopTier = "INSANE";
    const walk: QuizslopTier[] = [];
    for (let step = 0; step < 4; step += 1) {
      tier = applyLadderResult(tier, "INCORRECT");
      walk.push(tier);
    }
    expect(walk).toEqual(["HARD", "MEDIUM", "EASY", "EASY"]);
  });
});
