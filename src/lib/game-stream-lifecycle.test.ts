import { describe, expect, it } from "vitest";
import {
  shouldEndGameStream,
  shouldKeepGameStreamAlive,
} from "./game-stream-lifecycle";

describe("game stream lifecycle", () => {
  it("keeps streams alive for non-final states", () => {
    expect(
      shouldKeepGameStreamAlive({
        gameType: "SLOPLASH",
        status: "ROUND_RESULTS",
        modeState: null,
        winnerTaglinePending: false,
      }),
    ).toBe(true);
  });

  it("keeps MatchSlop final results alive while post-mortem generation is pending", () => {
    expect(
      shouldKeepGameStreamAlive({
        gameType: "MATCHSLOP",
        status: "FINAL_RESULTS",
        modeState: {
          postMortemGeneration: {
            status: "STREAMING",
          },
        },
        winnerTaglinePending: false,
      }),
    ).toBe(true);
  });

  it("keeps Slop-Lash final results alive while the winner tagline is pending", () => {
    expect(
      shouldKeepGameStreamAlive({
        gameType: "SLOPLASH",
        status: "FINAL_RESULTS",
        modeState: null,
        winnerTaglinePending: true,
      }),
    ).toBe(true);
  });

  it("closes final result streams once background work is done", () => {
    expect(
      shouldEndGameStream({
        gameType: "AI_CHAT_SHOWDOWN",
        status: "FINAL_RESULTS",
        modeState: null,
        winnerTaglinePending: false,
      }),
    ).toBe(true);
    expect(
      shouldEndGameStream({
        gameType: "SLOPLASH",
        status: "FINAL_RESULTS",
        modeState: null,
        winnerTaglinePending: false,
      }),
    ).toBe(true);
  });
});
