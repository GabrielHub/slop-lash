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
});
