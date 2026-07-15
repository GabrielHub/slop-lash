/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const projectFinalGame = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { status: "PROJECTED" | "ALREADY_PROCESSED" | "DEFERRED" | "IGNORED" }
>("leaderboards:projectFinalGame");

const catchUpFinalGames = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { scheduled: number; skipped: number }
>("leaderboards:catchUpFinalGames");

const getLeaderboard = makeFunctionReference<
  "query",
  Record<string, never>,
  {
    leaderboard: Array<{
      key: string;
      name: string;
      shortName: string;
      type: "HUMAN" | "AI";
      modelId: string | null;
      totalVotes: number;
      totalResponses: number;
      matchupsWon: number;
      matchupsPlayed: number;
      winRate: number;
      voteShare: number;
    }>;
    headToHead: Array<{
      modelId: string;
      modelName: string;
      modelShortName: string;
      humanWins: number;
      aiWins: number;
      ties: number;
      total: number;
    }>;
    bestResponses: Array<{
      promptText: string;
      responseText: string;
      playerName: string;
      playerType: "HUMAN" | "AI";
      modelId: string | null;
      votePct: number;
      voteCount: number;
      totalVotes: number;
    }>;
    modelUsage: Array<{
      modelId: string;
      modelName: string;
      modelShortName: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }>;
    stats: {
      totalGames: number;
      totalPrompts: number;
      totalVotes: number;
      totalTokens: number;
      totalCost: number;
    };
  }
>("leaderboards:get");

async function seedCompletedGame() {
  const backend = convexTest(schema, modules);
  const seeded = await backend.run(async (ctx) => {
    const now = 1_000_000;
    const gameId = await ctx.db.insert("games", {
      roomCode: "LEAD",
      gameType: "SLOPLASH",
      status: "FINAL_RESULTS",
      currentRound: 1,
      totalRounds: 1,
      maxPlayers: 8,
      playerCount: 4,
      phaseGeneration: 4,
      timersDisabled: true,
      ttsMode: "OFF",
      ttsVoice: "RANDOM",
      votingPromptIndex: 0,
      votingRevealing: false,
      aiInputTokens: 10,
      aiOutputTokens: 5,
      aiCostUsd: 0.01,
      createdAt: now,
      updatedAt: now,
    });
    const humanId = await ctx.db.insert("players", {
      gameId,
      name: "Ada",
      normalizedName: "ada",
      type: "HUMAN",
      idleRounds: 0,
      score: 200,
      humorRating: 1.1,
      winStreak: 1,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    const aiId = await ctx.db.insert("players", {
      gameId,
      name: "Gemini",
      normalizedName: "gemini",
      type: "AI",
      modelId: "google/gemini-3-flash",
      idleRounds: 0,
      score: 50,
      humorRating: 1,
      winStreak: 0,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    const voterOneId = await ctx.db.insert("players", {
      gameId,
      name: "Grace",
      normalizedName: "grace",
      type: "HUMAN",
      idleRounds: 0,
      score: 0,
      humorRating: 1,
      winStreak: 0,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    const voterTwoId = await ctx.db.insert("players", {
      gameId,
      name: "Linus",
      normalizedName: "linus",
      type: "HUMAN",
      idleRounds: 0,
      score: 0,
      humorRating: 1,
      winStreak: 0,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    const roundId = await ctx.db.insert("rounds", {
      gameId,
      roundNumber: 1,
      openedAt: now,
      completedAt: now + 1,
    });
    const promptId = await ctx.db.insert("prompts", {
      gameId,
      roundId,
      ordinal: 0,
      text: "The worst name for a submarine",
    });
    const humanResponseId = await ctx.db.insert("responses", {
      gameId,
      roundId,
      promptId,
      playerId: humanId,
      text: "Unsinkable II",
      pointsEarned: 200,
      submittedAt: now,
    });
    await ctx.db.insert("responses", {
      gameId,
      roundId,
      promptId,
      playerId: aiId,
      text: "The Wet Wi-Fi Router",
      pointsEarned: 0,
      submittedAt: now,
    });
    for (const voterId of [voterOneId, voterTwoId]) {
      await ctx.db.insert("votes", {
        gameId,
        roundId,
        promptId,
        voterId,
        responseId: humanResponseId,
        castAt: now,
      });
    }
    await ctx.db.insert("gameModelUsage", {
      gameId,
      modelId: "google/gemini-3-flash",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.01,
    });
    return { gameId };
  });
  return { backend, ...seeded };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Convex leaderboard projection", () => {
  test("projects a final game exactly once and preserves the legacy public payload", async () => {
    const { backend, gameId } = await seedCompletedGame();
    await expect(backend.mutation(projectFinalGame, { gameId })).resolves.toEqual({
      status: "PROJECTED",
    });
    await expect(backend.mutation(projectFinalGame, { gameId })).resolves.toEqual({
      status: "ALREADY_PROCESSED",
    });

    const result = await backend.query(getLeaderboard, {});
    expect(result).toEqual({
      leaderboard: [
        {
          key: "HUMAN",
          name: "Humans",
          shortName: "Human",
          type: "HUMAN",
          modelId: null,
          totalVotes: 2,
          totalResponses: 1,
          matchupsWon: 1,
          matchupsPlayed: 1,
          winRate: 100,
          voteShare: 100,
        },
        {
          key: "google/gemini-3-flash",
          name: "Gemini 3 Flash",
          shortName: "Gemini",
          type: "AI",
          modelId: "google/gemini-3-flash",
          totalVotes: 0,
          totalResponses: 1,
          matchupsWon: 0,
          matchupsPlayed: 1,
          winRate: 0,
          voteShare: 0,
        },
      ],
      headToHead: [
        {
          modelId: "google/gemini-3-flash",
          modelName: "Gemini 3 Flash",
          modelShortName: "Gemini",
          humanWins: 1,
          aiWins: 0,
          ties: 0,
          total: 1,
        },
      ],
      bestResponses: [
        {
          promptText: "The worst name for a submarine",
          responseText: "Unsinkable II",
          playerName: "Ada",
          playerType: "HUMAN",
          modelId: null,
          votePct: 100,
          voteCount: 2,
          totalVotes: 2,
        },
      ],
      modelUsage: [
        {
          modelId: "google/gemini-3-flash",
          modelName: "Gemini 3 Flash",
          modelShortName: "Gemini",
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.01,
        },
      ],
      stats: {
        totalGames: 1,
        totalPrompts: 1,
        totalVotes: 2,
        totalTokens: 15,
        totalCost: 0.01,
      },
    });

    const markers = await backend.run(async (ctx) =>
      ctx.db
        .query("leaderboardProcessedGames")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(2),
    );
    expect(markers).toHaveLength(1);
  });

  test("ignores games that are not final retained Slop-Lash games", async () => {
    const { backend, gameId } = await seedCompletedGame();
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", gameId, { status: "ROUND_RESULTS" });
    });
    await expect(backend.mutation(projectFinalGame, { gameId })).resolves.toEqual({
      status: "IGNORED",
    });
    const empty = await backend.query(getLeaderboard, {});
    expect(empty).toEqual({
      leaderboard: [],
      headToHead: [],
      bestResponses: [],
      modelUsage: [],
      stats: {
        totalGames: 0,
        totalPrompts: 0,
        totalVotes: 0,
        totalTokens: 0,
        totalCost: 0,
      },
    });
  });

  test("defers projection until final winner-tagline work is terminal", async () => {
    const { backend, gameId } = await seedCompletedGame();
    const jobId = await backend.run(async (ctx) =>
      ctx.db.insert("generationJobs", {
        gameId,
        kind: "WINNER_TAGLINE",
        generationKey: "winner-tagline:final",
        status: "QUEUED",
        attempt: 1,
        createdAt: 1_000_001,
        updatedAt: 1_000_001,
      }),
    );

    await expect(backend.mutation(projectFinalGame, { gameId })).resolves.toEqual({
      status: "DEFERRED",
    });
    await backend.run(async (ctx) => {
      await ctx.db.patch("generationJobs", jobId, {
        status: "SUCCEEDED",
        completedAt: 1_000_002,
        updatedAt: 1_000_002,
      });
    });
    await expect(backend.mutation(projectFinalGame, { gameId })).resolves.toEqual({
      status: "PROJECTED",
    });
  });

  test("recovers only indexed pending projections regardless of retained history", async () => {
    vi.useFakeTimers();
    const backend = convexTest(schema, modules);
    const pendingGameId = await backend.run(async (ctx) => {
      let pending: Id<"games"> | null = null;
      for (let index = 0; index < 40; index += 1) {
        const gameId = await ctx.db.insert("games", {
          roomCode: `G${index.toString().padStart(5, "0")}`,
          gameType: "SLOPLASH",
          status: "FINAL_RESULTS",
          currentRound: 1,
          totalRounds: 1,
          maxPlayers: 8,
          playerCount: 0,
          phaseGeneration: 1,
          timersDisabled: true,
          ttsMode: "OFF",
          ttsVoice: "RANDOM",
          votingPromptIndex: 0,
          votingRevealing: false,
          aiInputTokens: 0,
          aiOutputTokens: 0,
          aiCostUsd: 0,
          finalizedAt: 1_000 + index,
          leaderboardProjectionStatus: index === 39 ? "PENDING" : "PROJECTED",
          createdAt: 1_000 + index,
          updatedAt: 1_000 + index,
        });
        if (index === 39) {
          pending = gameId;
        } else {
          await ctx.db.insert("leaderboardProcessedGames", {
            gameId,
            processedAt: 2_000 + index,
          });
        }
      }
      if (!pending) throw new Error("Expected pending final game");
      return pending;
    });

    await expect(backend.mutation(catchUpFinalGames, {})).resolves.toEqual({
      scheduled: 1,
      skipped: 0,
    });
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());
    const marker = await backend.run(async (ctx) =>
      ctx.db
        .query("leaderboardProcessedGames")
        .withIndex("by_gameId", (index) => index.eq("gameId", pendingGameId))
        .unique(),
    );
    expect(marker).not.toBeNull();
    const projected = await backend.run(async (ctx) => ctx.db.get("games", pendingGameId));
    expect(projected?.leaderboardProjectionStatus).toBe("PROJECTED");
  });
});
