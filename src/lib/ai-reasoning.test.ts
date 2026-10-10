import { describe, expect, test } from "vite-plus/test";
import { AI_TASKS } from "./ai/tasks";

describe("reasoning policy", () => {
  test("turns thinking off for ballots, taglines and narration", () => {
    for (const task of [
      "sloplash.ballots",
      "sloplash.tagline",
      "matchslop.vote",
      "narrator.line",
    ] as const) {
      expect(AI_TASKS[task].reasoning).toBe("none");
    }
  });

  test("keeps minimal thinking for writing tasks until measured", () => {
    for (const task of ["sloplash.jokes", "matchslop.botLine", "matchslop.reply"] as const) {
      expect(AI_TASKS[task].reasoning).toBe("minimal");
    }
  });

  test("runs SlopFight on Haiku at high effort with Sonnet at medium as the fallback", () => {
    for (const task of [
      "slopfight.forge",
      "slopfight.house",
      "slopfight.matchup",
      "slopfight.recap",
    ] as const) {
      expect(AI_TASKS[task].reasoning).toBe("high");
    }
    for (const task of [
      "slopfight.forgeFallback",
      "slopfight.houseFallback",
      "slopfight.matchupFallback",
      "slopfight.recapFallback",
    ] as const) {
      expect(AI_TASKS[task].reasoning).toBe("medium");
    }
  });

  test("puts the forge in the critical pool with room for thinking plus a full sheet", () => {
    for (const task of ["slopfight.forge", "slopfight.forgeFallback"] as const) {
      expect(AI_TASKS[task].pool).toBe("critical");
      expect(AI_TASKS[task].maxOutputTokens).toBeGreaterThanOrEqual(12_000);
    }
  });
});
