/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vite-plus/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const getRecap = makeFunctionReference<"query", { roomCode: string }, unknown>(
  "recaps:getByRoomCode",
);

async function seedRecapGame(status: "VOTING" | "FINAL_RESULTS" = "FINAL_RESULTS") {
  const backend = convexTest(schema, modules);
  const seeded = await backend.run(async (ctx) => {
    const now = 1_700_000_000_000;
    const gameId = await ctx.db.insert("games", {
      roomCode: "RECAP",
      gameType: "SLOPLASH",
      status,
      currentRound: 1,
      totalRounds: 1,
      maxPlayers: 8,
      playerCount: 2,
      phaseGeneration: 7,
      timersDisabled: true,
      ttsMode: "OFF",
      ttsVoice: "RANDOM",
      votingPromptIndex: 0,
      votingRevealing: status === "VOTING",
      winnerTagline: "A triumph of questionable judgment.",
      aiInputTokens: 12,
      aiOutputTokens: 8,
      aiCostUsd: 0.02,
      createdAt: now,
      updatedAt: now,
    });
    const humanId = await ctx.db.insert("players", {
      gameId,
      name: "Human",
      normalizedName: "human",
      type: "HUMAN",
      idleRounds: 0,
      score: 50,
      humorRating: 1.2,
      winStreak: 1,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    const aiId = await ctx.db.insert("players", {
      gameId,
      name: "Gemini",
      normalizedName: "gemini",
      type: "AI",
      modelId: "google/gemini-3.5-flash-lite",
      idleRounds: 0,
      score: 100,
      humorRating: 1.4,
      winStreak: 2,
      participationStatus: "ACTIVE",
      joinedAt: now + 1,
    });
    const roundId = await ctx.db.insert("rounds", {
      gameId,
      roundNumber: 1,
      openedAt: now,
      completedAt: now + 10,
    });
    const promptId = await ctx.db.insert("prompts", {
      gameId,
      roundId,
      ordinal: 0,
      text: "A terrible slogan for a dentist",
    });
    for (const playerId of [humanId, aiId]) {
      await ctx.db.insert("promptAssignments", { gameId, roundId, promptId, playerId });
    }
    const humanResponseId = await ctx.db.insert("responses", {
      gameId,
      roundId,
      promptId,
      playerId: humanId,
      text: "We drill because we care",
      metadata: { source: "human" },
      pointsEarned: 0,
      submittedAt: now,
    });
    const aiResponseId = await ctx.db.insert("responses", {
      gameId,
      roundId,
      promptId,
      playerId: aiId,
      text: "Your pain is our gain",
      pointsEarned: 100,
      submittedAt: now,
    });
    await ctx.db.insert("votes", {
      gameId,
      roundId,
      promptId,
      voterId: humanId,
      responseId: aiResponseId,
      castAt: now,
    });
    await ctx.db.insert("reactions", {
      gameId,
      roundId,
      responseId: aiResponseId,
      playerId: humanId,
      emoji: "fire",
      createdAt: now,
    });
    await ctx.db.insert("gameModelUsage", {
      gameId,
      modelId: "google/gemini-3.5-flash-lite",
      inputTokens: 12,
      outputTokens: 8,
      costUsd: 0.02,
    });
    return { aiId, aiResponseId, gameId, humanId, humanResponseId, promptId, roundId };
  });
  return { backend, ...seeded };
}

describe("Convex recaps", () => {
  test("returns the immutable final-game payload used by the recap UI", async () => {
    const seeded = await seedRecapGame();
    const result = await seeded.backend.query(getRecap, { roomCode: "recap" });
    expect(result).toMatchObject({
      kind: "READY",
      game: {
        id: seeded.gameId,
        roomCode: "RECAP",
        gameType: "SLOPLASH",
        status: "FINAL_RESULTS",
        currentRound: 1,
        totalRounds: 1,
        version: 7,
        aiInputTokens: 12,
        aiOutputTokens: 8,
        aiCostUsd: 0.02,
        winnerTagline: "A triumph of questionable judgment.",
        players: [
          { id: seeded.aiId, name: "Gemini", score: 100 },
          { id: seeded.humanId, name: "Human", score: 50 },
        ],
        modelUsages: [
          {
            modelId: "google/gemini-3.5-flash-lite",
            inputTokens: 12,
            outputTokens: 8,
            costUsd: 0.02,
          },
        ],
        rounds: [
          {
            id: seeded.roundId,
            gameId: seeded.gameId,
            roundNumber: 1,
            prompts: [
              {
                id: seeded.promptId,
                roundId: seeded.roundId,
                text: "A terrible slogan for a dentist",
                assignments: [
                  { promptId: seeded.promptId, playerId: seeded.humanId },
                  { promptId: seeded.promptId, playerId: seeded.aiId },
                ],
                responses: expect.arrayContaining([
                  expect.objectContaining({
                    id: seeded.humanResponseId,
                    metadata: { source: "human" },
                    player: expect.not.objectContaining({ score: expect.anything() }),
                    reactions: [],
                  }),
                  expect.objectContaining({
                    id: seeded.aiResponseId,
                    playerId: seeded.aiId,
                    reactions: [
                      expect.objectContaining({
                        responseId: seeded.aiResponseId,
                        playerId: seeded.humanId,
                        emoji: "fire",
                      }),
                    ],
                  }),
                ]),
                votes: [
                  expect.objectContaining({
                    voterId: seeded.humanId,
                    responseId: seeded.aiResponseId,
                    voter: { id: seeded.humanId, type: "HUMAN" },
                  }),
                ],
              },
            ],
          },
        ],
      },
    });
  });

  test("distinguishes missing and still-running rooms without exposing partial recaps", async () => {
    const { backend } = await seedRecapGame("VOTING");
    await expect(backend.query(getRecap, { roomCode: "RECAP" })).resolves.toEqual({
      kind: "IN_PROGRESS",
      status: "VOTING",
    });
    await expect(backend.query(getRecap, { roomCode: "NONE" })).resolves.toEqual({
      kind: "NOT_FOUND",
    });
  });
});
