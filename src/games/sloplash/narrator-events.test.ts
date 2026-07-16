import { describe, expect, test } from "vite-plus/test";
import type { GamePlayer, GamePrompt, GameResponse, GameState } from "@/lib/types";
import {
  buildMatchupNarration,
  buildRoundOverNarration,
  buildVoteResultNarration,
} from "./narrator-events";

function makePlayer(id: string, name: string, score: number): GamePlayer {
  return {
    id,
    name,
    score,
    type: "HUMAN",
    modelId: null,
    idleRounds: 0,
    humorRating: 1,
    winStreak: 0,
    participationStatus: "ACTIVE",
    lastSeen: "2026-07-15T00:00:00.000Z",
  };
}

function makeResponse(
  id: string,
  promptId: string,
  player: GamePlayer,
  text: string,
): GameResponse {
  const { score: _score, ...responsePlayer } = player;
  return {
    id,
    promptId,
    playerId: player.id,
    text,
    pointsEarned: 0,
    failReason: null,
    reactions: [],
    player: responsePlayer,
  };
}

function makeGame(): { game: GameState; prompt: GamePrompt } {
  const firstPlayer = makePlayer("player-a", "Ana", 100);
  const secondPlayer = makePlayer("player-b", "Ben", 20);
  const prompt: GamePrompt = {
    id: "prompt-1",
    roundId: "round-1",
    text: "The worst thing to bring to ______",
    responses: [
      makeResponse("response-a", "prompt-1", firstPlayer, "a live goose"),
      makeResponse("response-b", "prompt-1", secondPlayer, "your tax return"),
    ],
    votes: [
      {
        id: "vote-1",
        promptId: "prompt-1",
        voterId: "voter-1",
        responseId: "response-a",
        failReason: null,
        voter: { id: "voter-1", type: "HUMAN" },
      },
    ],
    assignments: [],
  };
  return {
    prompt,
    game: {
      id: "game-1",
      roomCode: "TEST",
      gameType: "SLOPLASH",
      status: "VOTING",
      currentRound: 1,
      totalRounds: 1,
      hostPlayerId: firstPlayer.id,
      phaseDeadline: null,
      timersDisabled: true,
      ttsMode: "ON",
      ttsVoice: "nova",
      votingPromptIndex: 0,
      votingRevealing: false,
      nextGameCode: null,
      version: 1,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      aiCostUsd: 0,
      modelUsages: [],
      players: [firstPlayer, secondPlayer],
      rounds: [{ id: "round-1", gameId: "game-1", roundNumber: 1, prompts: [prompt] }],
    },
  };
}

describe("Gateway TTS narrator events", () => {
  test("keeps matchup scripts deterministic and verbatim", () => {
    const { game, prompt } = makeGame();
    expect(buildMatchupNarration(game, [prompt])).toEqual({
      eventType: "matchup",
      fallbackText:
        "The prompt is: The worst thing to bring to ... First joke: a live goose. Second joke: your tax return.",
    });
  });

  test("provides safe fallbacks and factual context for generated host lines", () => {
    const { game, prompt } = makeGame();
    expect(buildVoteResultNarration(game, [prompt])).toEqual({
      eventType: "vote_result",
      fallbackText: "Ana wins unanimously. No debate at all.",
      generationContext: JSON.stringify({
        outcome: "winner",
        winnerName: "Ana",
        margin: "unanimous",
      }),
    });
    expect(buildRoundOverNarration(game)).toEqual({
      eventType: "round_over",
      fallbackText: "Game over. Ana wins Slop-Lash.",
      generationContext: JSON.stringify({
        final: true,
        winnerName: "Ana",
        round: 1,
        totalRounds: 1,
      }),
    });
  });
});
