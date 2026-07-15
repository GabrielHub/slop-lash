import { describe, expect, it } from "vite-plus/test";
import {
  FORFEIT_MARKER,
  scorePrompt,
  type PlayerState,
  type PromptResponse,
  type PromptVoter,
} from "./scoring";

function response(id: string, text = `joke ${id}`): PromptResponse {
  return { id, playerId: `player-${id}`, playerType: "HUMAN", text };
}

function voter(id: string, responseId: string | null): PromptVoter {
  return { id, type: "HUMAN", responseId };
}

function states(...playerIds: string[]): Map<string, PlayerState> {
  return new Map(
    playerIds.map((playerId) => [playerId, { score: 0, humorRating: 1.0, winStreak: 0 }]),
  );
}

describe("scorePrompt forfeit handling", () => {
  it("awards an uncontested win when a two-way matchup has one forfeit", () => {
    const responses = [response("a"), response("b", FORFEIT_MARKER)];
    const result = scorePrompt(responses, [], states("player-a", "player-b"), 1, 6);

    expect(result.points["a"]).toBeGreaterThan(0);
    expect(result.points["b"]).toBe(0);
    expect(result.streakUpdates["player-a"]).toBe(1);
    expect(result.streakUpdates["player-b"]).toBe(0);
  });

  it("scores the remaining contenders by real votes when one of many forfeits", () => {
    // ChatSlop runs a single N-way prompt. One AI generation failing inserts a
    // forfeit; that must not discard everyone else's votes.
    const responses = [
      response("a"),
      response("b"),
      response("c"),
      response("d", FORFEIT_MARKER),
    ];
    const voters = [voter("v1", "c"), voter("v2", "c"), voter("v3", "c")];
    const result = scorePrompt(
      responses,
      voters,
      states("player-a", "player-b", "player-c", "player-d", "v1", "v2", "v3"),
      1,
      4,
    );

    // The response that actually won the votes takes the prompt.
    expect(result.points["c"]).toBeGreaterThan(0);
    expect(result.points["a"]).toBe(0);
    expect(result.points["b"]).toBe(0);
    expect(result.points["d"]).toBe(0);
    expect(result.streakUpdates["player-c"]).toBe(1);
    // The forfeiter must not be handed the prompt by submission order.
    expect(result.points["d"]).not.toBeGreaterThan(result.points["c"]);
  });

  it("does not let submission order decide an N-way round containing a forfeit", () => {
    // The forfeit is first in the array; the earliest non-forfeit response must
    // not win by position when the votes went elsewhere.
    const responses = [response("a", FORFEIT_MARKER), response("b"), response("c")];
    const voters = [voter("v1", "c"), voter("v2", "c")];
    const result = scorePrompt(
      responses,
      voters,
      states("player-a", "player-b", "player-c", "v1", "v2"),
      1,
      3,
    );

    expect(result.points["c"]).toBeGreaterThan(0);
    expect(result.points["b"]).toBe(0);
    expect(result.points["a"]).toBe(0);
  });

  it("awards nothing when every response forfeits", () => {
    const responses = [response("a", FORFEIT_MARKER), response("b", FORFEIT_MARKER)];
    const result = scorePrompt(responses, [], states("player-a", "player-b"), 1, 6);

    expect(result.points["a"]).toBe(0);
    expect(result.points["b"]).toBe(0);
  });
});
