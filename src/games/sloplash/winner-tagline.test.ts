import { describe, expect, it } from "vitest";
import {
  resolveWinnerTaglinePlaceholder,
  WINNER_TAGLINE_GENERATING,
} from "./winner-tagline";

describe("winner tagline placeholder", () => {
  it("uses the same deterministic leader for tied scores", () => {
    expect(
      resolveWinnerTaglinePlaceholder([
        { id: "b", score: 100, type: "AI", modelId: "model-b" },
        { id: "a", score: 100, type: "HUMAN", modelId: null },
      ]),
    ).toBeNull();

    expect(
      resolveWinnerTaglinePlaceholder([
        { id: "a", score: 100, type: "AI", modelId: "model-a" },
        { id: "b", score: 100, type: "HUMAN", modelId: null },
      ]),
    ).toBe(WINNER_TAGLINE_GENERATING);
  });
});
