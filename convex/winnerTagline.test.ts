/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  claimWinnerTaglineJobRef,
  enqueueWinnerTaglineJobRef,
  executeWinnerTaglineRef,
  persistWinnerTaglineRef,
  winnerTaglineWorkCompleteRef,
  type WinnerTaglineStatus,
  type WinnerTaglineWorkArgs,
} from "./winnerTaglineContracts";
import { isWinnerTaglinePending } from "./winnerTaglineData";

const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

const modules = import.meta.glob("./**/*.ts");

const createRoom = makeFunctionReference<
  "action",
  {
    aiModelIds: string[];
    gameType: "SLOPLASH";
    hostParticipation: "DISPLAY_ONLY";
    hostSecret: string;
    timersDisabled: boolean;
    totalRounds: number;
  },
  { capability: string; gameId: Id<"games">; roomCode: string }
>("rooms:create");

const startGame = makeFunctionReference<"mutation", { capability: string }, unknown>("lobby:start");
const advanceGame = makeFunctionReference<
  "mutation",
  { capability: string; expectedPhaseGeneration: number },
  { phase: string | null }
>("sloplash:advance");
const endGame = makeFunctionReference<"mutation", { capability: string }, { success: true }>(
  "sloplash:end",
);
const stageView = makeFunctionReference<
  "query",
  { capability: string },
  { winnerTaglinePending: boolean }
>("gameViews:stage");
const recapView = makeFunctionReference<
  "query",
  { roomCode: string },
  | { kind: "NOT_FOUND" }
  | { kind: "IN_PROGRESS"; status: string }
  | { kind: "READY"; game: { winnerTaglinePending: boolean } }
>("recaps:getByRoomCode");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workpoolTest.register(backend, "aiGenerationWorkpool");
  return backend;
}

type TestBackend = ReturnType<typeof createTestBackend>;

async function createAiGame(backend: TestBackend, totalRounds = 1) {
  vi.stubEnv("HOST_SECRET", "host-secret");
  const host = await backend.action(createRoom, {
    aiModelIds: ["google/gemini-3.5-flash-lite", "openai/gpt-5.6-luna", "anthropic/claude-haiku-4.5"],
    gameType: "SLOPLASH",
    hostParticipation: "DISPLAY_ONLY",
    hostSecret: "host-secret",
    timersDisabled: true,
    totalRounds,
  });
  await backend.mutation(startGame, { capability: host.capability });
  const state = await backend.run(async (ctx) => {
    const game = await ctx.db.get("games", host.gameId);
    const players = await ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
      .take(16);
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) =>
        index.eq("gameId", host.gameId).eq("roundNumber", 1),
      )
      .unique();
    if (!game || !round) throw new Error("Expected started Slop-Lash game");
    return { game, players, round };
  });
  return { host, ...state };
}

async function loadTaglineJobs(backend: TestBackend, gameId: Id<"games">) {
  return backend.run(async (ctx) => {
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_generationKey", (index) => index.eq("gameId", gameId))
      .take(64);
    return jobs.filter((job) => job.kind === "WINNER_TAGLINE");
  });
}

function workArgs(game: Doc<"games">, job: Doc<"generationJobs">): WinnerTaglineWorkArgs {
  const leaderId = job.targetId as Id<"players"> | undefined;
  if (!leaderId || (game.status !== "ROUND_RESULTS" && game.status !== "FINAL_RESULTS")) {
    throw new Error("Expected a current winner tagline job");
  }
  return {
    jobId: job._id,
    gameId: game._id,
    leaderId,
    gameStatus: game.status,
    phaseGeneration: game.phaseGeneration,
    attempt: job.attempt,
  };
}

async function pending(backend: TestBackend, gameId: Id<"games">) {
  return backend.run(async (ctx) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Expected game");
    const players = await ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(16);
    return isWinnerTaglinePending(ctx.db, game, players);
  });
}

async function driveToRoundResults(
  backend: TestBackend,
  created: Awaited<ReturnType<typeof createAiGame>>,
) {
  await backend.run(async (ctx) => {
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", created.host.gameId).eq("roundId", created.round._id),
      )
      .take(16);
    const prompt = prompts[0];
    if (!prompt) throw new Error("Expected prompt");
    const assignments = await ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", created.host.gameId).eq("roundId", created.round._id),
      )
      .filter((query) => query.eq(query.field("promptId"), prompt._id))
      .take(4);
    for (const [index, assignment] of assignments.entries()) {
      await ctx.db.insert("responses", {
        gameId: created.host.gameId,
        roundId: created.round._id,
        promptId: prompt._id,
        playerId: assignment.playerId,
        text: `round result joke ${index}`,
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
    }
    await ctx.db.patch("games", created.host.gameId, {
      status: "VOTING",
      phaseGeneration: created.game.phaseGeneration + 1,
      votingPromptIndex: 0,
      votingRevealing: true,
      updatedAt: Date.now(),
    });
  });
  await expect(
    backend.mutation(advanceGame, {
      capability: created.host.capability,
      expectedPhaseGeneration: created.game.phaseGeneration + 1,
    }),
  ).resolves.toEqual({ phase: "ROUND_RESULTS" });
  const game = await backend.run(async (ctx) => ctx.db.get("games", created.host.gameId));
  if (!game) throw new Error("Expected round-results game");
  return game;
}

async function seedResultContext(backend: TestBackend, gameStatus: WinnerTaglineStatus) {
  const created = await createAiGame(backend, 2);
  const seeded = await backend.run(async (ctx) => {
    const rankedPlayers = [...created.players].toSorted((left, right) =>
      left._id.localeCompare(right._id),
    );
    const leader = rankedPlayers[0];
    if (!leader || !leader.modelId) throw new Error("Expected AI leader");
    for (const player of rankedPlayers) {
      await ctx.db.patch("players", player._id, { score: player._id === leader._id ? 100 : 0 });
    }

    const firstRoundPrompts = await ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", created.host.gameId).eq("roundId", created.round._id),
      )
      .take(16);
    const firstPrompt = firstRoundPrompts[0];
    if (!firstPrompt) throw new Error("Expected first-round prompt");
    await ctx.db.insert("responses", {
      gameId: created.host.gameId,
      roundId: created.round._id,
      promptId: firstPrompt._id,
      playerId: leader._id,
      text: "round one winner joke",
      pointsEarned: 100,
      submittedAt: Date.now(),
    });
    await ctx.db.patch("rounds", created.round._id, { completedAt: Date.now() });

    const secondRoundId = await ctx.db.insert("rounds", {
      gameId: created.host.gameId,
      roundNumber: 2,
      openedAt: Date.now(),
      completedAt: Date.now(),
    });
    const secondPromptId = await ctx.db.insert("prompts", {
      gameId: created.host.gameId,
      roundId: secondRoundId,
      ordinal: 0,
      text: "Second round prompt",
    });
    await ctx.db.insert("responses", {
      gameId: created.host.gameId,
      roundId: secondRoundId,
      promptId: secondPromptId,
      playerId: leader._id,
      text: "round two winner joke",
      pointsEarned: 100,
      submittedAt: Date.now(),
    });

    const game = await ctx.db.get("games", created.host.gameId);
    if (!game) throw new Error("Expected game");
    const phaseGeneration = game.phaseGeneration + 1;
    await ctx.db.patch("games", game._id, {
      currentRound: 2,
      phaseDeadline: undefined,
      phaseGeneration,
      status: gameStatus,
      updatedAt: Date.now(),
      winnerTagline: undefined,
    });
    return { leader, phaseGeneration, secondRoundId };
  });

  const queued = await backend.mutation(enqueueWinnerTaglineJobRef, {
    gameId: created.host.gameId,
    gameStatus,
    phaseGeneration: seeded.phaseGeneration,
  });
  if (queued.status === "SKIPPED") throw new Error(queued.reason);
  if (queued.status !== "ENQUEUED") throw new Error(`Expected a new job, got ${queued.status}`);
  const game = await backend.run(async (ctx) => ctx.db.get("games", created.host.gameId));
  const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", queued.jobId));
  if (!game || !job) throw new Error("Expected queued winner tagline job");
  return { created, game, job, leader: seeded.leader, secondRoundId: seeded.secondRoundId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-api-key");
});

afterEach(() => {
  vi.useRealTimers();
  streamTextMock.mockReset();
  vi.unstubAllEnvs();
});

describe("Slop-Lash winner tagline Workpool", () => {
  test("queues idempotently at round results, cancels stale phase work, and queues final results", async () => {
    const backend = createTestBackend();
    const created = await createAiGame(backend);
    const roundResults = await driveToRoundResults(backend, created);
    const roundJobs = await loadTaglineJobs(backend, created.host.gameId);
    expect(roundJobs).toHaveLength(1);
    expect(roundJobs[0]).toMatchObject({
      attempt: 1,
      kind: "WINNER_TAGLINE",
      status: "QUEUED",
    });
    expect(roundJobs[0]?.workId).toEqual(expect.any(String));
    await expect(
      backend.mutation(enqueueWinnerTaglineJobRef, {
        gameId: created.host.gameId,
        gameStatus: "ROUND_RESULTS",
        phaseGeneration: roundResults.phaseGeneration,
      }),
    ).resolves.toEqual({ status: "EXISTING", jobId: roundJobs[0]?._id });
    await expect(pending(backend, created.host.gameId)).resolves.toBe(true);

    await expect(
      backend.mutation(advanceGame, {
        capability: created.host.capability,
        expectedPhaseGeneration: roundResults.phaseGeneration,
      }),
    ).resolves.toEqual({ phase: "FINAL_RESULTS" });
    const finalGame = await backend.run(async (ctx) => ctx.db.get("games", created.host.gameId));
    const finalJobs = await loadTaglineJobs(backend, created.host.gameId);
    expect(finalGame?.status).toBe("FINAL_RESULTS");
    expect(finalGame?.winnerTagline).toBeUndefined();
    expect(finalJobs).toHaveLength(2);
    expect(finalJobs.find((job) => job._id === roundJobs[0]?._id)?.status).toBe("CANCELED");
    expect(finalJobs.filter((job) => job.status === "QUEUED")).toHaveLength(1);
    await expect(pending(backend, created.host.gameId)).resolves.toBe(true);
    await expect(
      backend.query(stageView, { capability: created.host.capability }),
    ).resolves.toMatchObject({ winnerTaglinePending: true });
    await expect(
      backend.query(recapView, { roomCode: created.host.roomCode }),
    ).resolves.toMatchObject({ kind: "READY", game: { winnerTaglinePending: true } });
  });

  test("queues a final-results tagline when the host ends early", async () => {
    const backend = createTestBackend();
    const created = await createAiGame(backend);
    await expect(
      backend.mutation(endGame, { capability: created.host.capability }),
    ).resolves.toEqual({ success: true });
    const game = await backend.run(async (ctx) => ctx.db.get("games", created.host.gameId));
    const jobs = await loadTaglineJobs(backend, created.host.gameId);
    expect(game?.status).toBe("FINAL_RESULTS");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "QUEUED", targetId: expect.any(String) });
  });

  test("uses only the current round for a round-results claim", async () => {
    const backend = createTestBackend();
    const seeded = await seedResultContext(backend, "ROUND_RESULTS");
    const claimed = await backend.mutation(
      claimWinnerTaglineJobRef,
      workArgs(seeded.game, seeded.job),
    );
    if (claimed.status !== "CLAIMED") throw new Error(claimed.reason);
    await expect(pending(backend, seeded.game._id)).resolves.toBe(true);
    expect(claimed.context.isFinal).toBe(false);
    expect(claimed.context.jokes).toEqual([
      expect.objectContaining({ roundNumber: 2, answer: "round two winner joke" }),
    ]);
  });

  test("generates from bounded full-game context and atomically persists tagline and usage", async () => {
    streamTextMock.mockReturnValue({
      text: Promise.resolve("<b>Victory belongs to the machine.</b>"),
      usage: Promise.resolve({ inputTokens: 13, outputTokens: 7 }),
    });
    const backend = createTestBackend();
    const seeded = await seedResultContext(backend, "FINAL_RESULTS");
    const args = workArgs(seeded.game, seeded.job);
    await expect(pending(backend, seeded.game._id)).resolves.toBe(true);

    await expect(backend.action(executeWinnerTaglineRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
      tagline: "Victory belongs to the machine.",
    });
    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", seeded.game._id),
      job: await ctx.db.get("generationJobs", seeded.job._id),
      usage: await ctx.db
        .query("gameModelUsage")
        .withIndex("by_gameId_and_modelId", (index) =>
          index.eq("gameId", seeded.game._id).eq("modelId", seeded.leader.modelId!),
        )
        .unique(),
    }));
    expect(persisted.game).toMatchObject({
      winnerTagline: "Victory belongs to the machine.",
      aiInputTokens: 13,
      aiOutputTokens: 7,
    });
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.usage).toMatchObject({ inputTokens: 13, outputTokens: 7 });
    await expect(pending(backend, seeded.game._id)).resolves.toBe(false);

    const request = streamTextMock.mock.calls.at(-1)?.[0] as
      | { instructions?: string; prompt?: string }
      | undefined;
    expect(request?.prompt).toContain("round one winner joke");
    expect(request?.prompt).toContain("round two winner joke");
    expect(request?.prompt).toContain("Won the entire game");
    expect(request?.prompt).not.toContain(seeded.leader._id);

    await expect(backend.action(executeWinnerTaglineRef, args)).resolves.toEqual({
      status: "SKIPPED",
      tagline: null,
    });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  test("cancels a stale post-generation write when the AI leader changes", async () => {
    const backend = createTestBackend();
    const seeded = await seedResultContext(backend, "FINAL_RESULTS");
    const args = workArgs(seeded.game, seeded.job);
    const claimed = await backend.mutation(claimWinnerTaglineJobRef, args);
    if (claimed.status !== "CLAIMED") throw new Error(claimed.reason);
    const challenger = seeded.created.players.find((player) => player._id !== seeded.leader._id);
    if (!challenger) throw new Error("Expected challenger");
    await backend.run(async (ctx) => {
      await ctx.db.patch("players", challenger._id, { score: 200 });
    });

    await expect(
      backend.mutation(persistWinnerTaglineRef, {
        ...args,
        text: "must not persist",
        usage: {
          modelId: claimed.context.modelId,
          inputTokens: 9,
          outputTokens: 4,
          costUsd: 0.01,
        },
      }),
    ).resolves.toMatchObject({ status: "CANCELED", reason: "Current AI leader changed" });
    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", seeded.game._id),
      job: await ctx.db.get("generationJobs", seeded.job._id),
    }));
    expect(persisted.game).toMatchObject({ aiInputTokens: 0, aiOutputTokens: 0, aiCostUsd: 0 });
    expect(persisted.game?.winnerTagline).toBeUndefined();
    expect(persisted.job).toMatchObject({ status: "CANCELED", error: "Current AI leader changed" });
  });

  test("records only the matching Workpool failure", async () => {
    const backend = createTestBackend();
    const seeded = await seedResultContext(backend, "FINAL_RESULTS");
    const args = workArgs(seeded.game, seeded.job);
    const claimed = await backend.mutation(claimWinnerTaglineJobRef, args);
    if (claimed.status !== "CLAIMED") throw new Error(claimed.reason);
    if (!seeded.job.workId) throw new Error("Expected Workpool id");

    await backend.mutation(winnerTaglineWorkCompleteRef, {
      workId: "foreign-work",
      context: args,
      result: { kind: "failed", error: "ignored" },
    });
    await backend.mutation(winnerTaglineWorkCompleteRef, {
      workId: seeded.job.workId,
      context: args,
      result: { kind: "failed", error: "gateway unavailable" },
    });
    const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", seeded.job._id));
    expect(job).toMatchObject({ status: "FAILED", error: "gateway unavailable" });
  });
});
