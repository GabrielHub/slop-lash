/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import { api } from "./_generated/api";
import {
  cancelResponseJobRef,
  claimResponseJobRef,
  enqueueQueuedResponseJobsRef,
  finishResponseJobRef,
  generateResponseRef,
  loadResponseContextRef,
  persistResponseRef,
  responseWorkCompleteRef,
  type ResponseWorkArgs,
} from "./aiGenerationContracts";
import schema from "./schema";

vi.mock("../src/games/sloplash/ai", () => ({
  generateJoke: async (modelId: string, promptText: string) => ({
    text: `mocked Slop-Lash: ${promptText}`,
    usage: { modelId, inputTokens: 2, outputTokens: 1, costUsd: 0.0001 },
    failReason: null,
  }),
}));

vi.mock("../src/games/ai-chat-showdown/ai", () => ({
  generateJoke: async (modelId: string, promptText: string) => ({
    text: `mocked ChatSlop: ${promptText}`,
    usage: { modelId, inputTokens: 3, outputTokens: 2, costUsd: 0.0002 },
    failReason: null,
  }),
}));

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-api-key");
});

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workpoolTest.register(backend, "aiGenerationWorkpool");
  return backend;
}

async function createStartedSloplash() {
  vi.stubEnv("HOST_SECRET", "host-secret");
  const backend = createTestBackend();
  const host = await backend.action(api.rooms.create, {
    aiModelIds: ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna"],
    gameType: "SLOPLASH",
    hostName: "Host",
    hostSecret: "host-secret",
  });
  const started = await backend.mutation(api.lobby.start, {
    capability: host.capability,
  });
  return { backend, host, started };
}

async function createStartedChatslop() {
  vi.stubEnv("HOST_SECRET", "host-secret");
  const backend = createTestBackend();
  const host = await backend.action(api.rooms.create, {
    aiModelIds: ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna"],
    gameType: "AI_CHAT_SHOWDOWN",
    hostName: "Host",
    hostSecret: "host-secret",
  });
  const started = await backend.mutation(api.lobby.start, {
    capability: host.capability,
  });
  return { backend, host, started };
}

async function createTimersDisabledAiOnlySloplash() {
  vi.useFakeTimers();
  vi.stubEnv("HOST_SECRET", "host-secret");
  const backend = createTestBackend();
  const host = await backend.action(api.rooms.create, {
    aiModelIds: ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna", "anthropic/claude-haiku-4.5"],
    gameType: "SLOPLASH",
    hostParticipation: "DISPLAY_ONLY",
    hostSecret: "host-secret",
    timersDisabled: true,
    totalRounds: 1,
  });
  const started = await backend.mutation(api.lobby.start, {
    capability: host.capability,
  });
  return { backend, host, started };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("AI response generation jobs", () => {
  test("hands queued response jobs to Workpool once without claiming backlog as running", async () => {
    vi.useFakeTimers();
    const { backend, host } = await createStartedSloplash();

    const first = await backend.mutation(enqueueQueuedResponseJobsRef, {
      gameId: host.gameId,
    });
    expect(first).toEqual({ enqueued: 2, skipped: 0, failed: 0, canceled: 0 });

    const jobs = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .take(16),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.workId !== undefined)).toBe(true);
    expect(jobs.every((job) => job.attempt === 1 && job.startedAt === undefined)).toBe(true);

    const repeated = await backend.mutation(enqueueQueuedResponseJobsRef, {
      gameId: host.gameId,
    });
    expect(repeated).toEqual({ enqueued: 0, skipped: 2, failed: 0, canceled: 0 });
  });

  test("drains response jobs by exact kind across a cursor without mixed-work starvation", async () => {
    vi.useFakeTimers();
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna"],
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
      timersDisabled: true,
    });
    await backend.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 32; index += 1) {
        await ctx.db.insert("generationJobs", {
          gameId: host.gameId,
          kind: "CHAT_REPLY",
          generationKey: `foreign-chat:${index}`,
          status: "QUEUED",
          attempt: 0,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });
    await backend.mutation(api.lobby.start, { capability: host.capability });
    await backend.run(async (ctx) => {
      const baseJob = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "RESPONSE").eq("status", "QUEUED"),
        )
        .first();
      if (!baseJob) throw new Error("Expected the initial response job");
      const now = Date.now();
      for (let index = 0; index < 31; index += 1) {
        await ctx.db.insert("generationJobs", {
          gameId: host.gameId,
          kind: "RESPONSE",
          generationKey: baseJob.generationKey,
          targetId: baseJob.targetId,
          status: "QUEUED",
          attempt: 0,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });

    await expect(
      backend.mutation(enqueueQueuedResponseJobsRef, { gameId: host.gameId }),
    ).resolves.toEqual({ enqueued: 32, skipped: 0, failed: 0, canceled: 0 });
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());

    const jobs = await backend.run(async (ctx) => ({
      foreign: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "CHAT_REPLY"),
        )
        .take(64),
      responses: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "RESPONSE"),
        )
        .take(64),
    }));
    expect(jobs.foreign).toHaveLength(32);
    expect(jobs.foreign.every((job) => job.workId === undefined)).toBe(true);
    expect(jobs.responses).toHaveLength(33);
    expect(jobs.responses.every((job) => job.workId !== undefined)).toBe(true);
  });

  test("runs the Node response action through mocked shared generation", async () => {
    const { backend, host, started } = await createStartedSloplash();
    const snapshot = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const job = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .first();
      if (!game || !job) throw new Error("Expected a queued response job");
      await ctx.db.patch("generationJobs", job._id, {
        attempt: 1,
        workId: "action-work",
        updatedAt: Date.now(),
      });
      return { game, job };
    });
    const args: ResponseWorkArgs = {
      jobId: snapshot.job._id,
      gameId: host.gameId,
      roundId: started.roundId,
      roundNumber: 1,
      phaseGeneration: snapshot.game.phaseGeneration,
      attempt: 1,
    };

    await expect(backend.action(generateResponseRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
      persistedResponses: 2,
      duplicateResponses: 0,
    });
    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      job: await ctx.db.get("generationJobs", snapshot.job._id),
      responses: await ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(16),
    }));
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.responses).toHaveLength(2);
    expect(
      persisted.responses.every((response) => response.text.startsWith("mocked Slop-Lash:")),
    ).toBe(true);
    expect(persisted.game).toMatchObject({ aiInputTokens: 4, aiOutputTokens: 2 });
    expect(persisted.game?.aiCostUsd).toBeCloseTo(0.0002);
  });

  test("persists each assigned response and its usage exactly once", async () => {
    const { backend, host, started } = await createStartedSloplash();
    const seeded = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const job = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .first();
      if (!game || !job) throw new Error("Expected a queued AI response job");
      await ctx.db.patch("generationJobs", job._id, {
        status: "RUNNING",
        attempt: 1,
        workId: "test-work",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { game, job };
    });
    const args: ResponseWorkArgs = {
      jobId: seeded.job._id,
      gameId: host.gameId,
      roundId: started.roundId,
      roundNumber: 1,
      phaseGeneration: seeded.game.phaseGeneration,
      attempt: 1,
    };

    const context = await backend.query(loadResponseContextRef, args);
    if (context.kind !== "ready") throw new Error(context.reason);
    expect(context.prompts).toHaveLength(2);
    expect(context.history).toEqual([]);

    const firstUsage = {
      modelId: context.modelId,
      inputTokens: 11,
      outputTokens: 7,
      costUsd: 0.001,
    };
    const secondUsage = {
      modelId: context.modelId,
      inputTokens: 3,
      outputTokens: 5,
      costUsd: 0.002,
    };
    const firstPrompt = context.prompts[0];
    const secondPrompt = context.prompts[1];
    if (!firstPrompt || !secondPrompt) throw new Error("Expected two prompt assignments");

    const inserted = await backend.mutation(persistResponseRef, {
      ...args,
      promptId: firstPrompt.promptId,
      text: "first generated response",
      failReason: null,
      usage: firstUsage,
    });
    expect(inserted).toEqual({ status: "INSERTED" });
    const duplicate = await backend.mutation(persistResponseRef, {
      ...args,
      promptId: firstPrompt.promptId,
      text: "duplicate must not win",
      failReason: "duplicate",
      usage: firstUsage,
    });
    expect(duplicate).toEqual({ status: "DUPLICATE" });
    await expect(
      backend.mutation(persistResponseRef, {
        ...args,
        promptId: secondPrompt.promptId,
        text: "second generated response",
        failReason: "empty",
        usage: secondUsage,
      }),
    ).resolves.toEqual({ status: "INSERTED" });

    await expect(backend.mutation(finishResponseJobRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
    });
    await expect(
      backend.mutation(persistResponseRef, {
        ...args,
        promptId: firstPrompt.promptId,
        text: "late duplicate",
        failReason: null,
        usage: firstUsage,
      }),
    ).resolves.toMatchObject({ status: "STALE" });

    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const job = await ctx.db.get("generationJobs", seeded.job._id);
      const responses = await ctx.db
        .query("responses")
        .withIndex("by_playerId_and_roundId", (index) =>
          index.eq("playerId", context.playerId).eq("roundId", started.roundId),
        )
        .take(16);
      const usage = await ctx.db
        .query("gameModelUsage")
        .withIndex("by_gameId_and_modelId", (index) =>
          index.eq("gameId", host.gameId).eq("modelId", context.modelId),
        )
        .unique();
      return { game, job, responses, usage };
    });
    expect(persisted.responses).toHaveLength(2);
    expect(persisted.responses.map((response) => response.text).toSorted()).toEqual([
      "first generated response",
      "second generated response",
    ]);
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.game).toMatchObject({ aiInputTokens: 14, aiOutputTokens: 12 });
    expect(persisted.game?.aiCostUsd).toBeCloseTo(0.003);
    expect(persisted.usage).toMatchObject({ inputTokens: 14, outputTokens: 12 });
    expect(persisted.usage?.costUsd).toBeCloseTo(0.003);
  });

  test("loads and completes ChatSlop response jobs through the same guarded lifecycle", async () => {
    vi.useFakeTimers();
    const { backend, host, started } = await createStartedChatslop();
    const seeded = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const job = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .first();
      if (!game || !job) throw new Error("Expected a queued ChatSlop response job");
      const now = Date.now();
      await ctx.db.patch("generationJobs", job._id, {
        status: "RUNNING",
        attempt: 1,
        workId: "chat-work",
        startedAt: now,
        updatedAt: now,
      });
      return { game, job };
    });
    const args: ResponseWorkArgs = {
      jobId: seeded.job._id,
      gameId: host.gameId,
      roundId: started.roundId,
      roundNumber: 1,
      phaseGeneration: seeded.game.phaseGeneration,
      attempt: 1,
    };

    const context = await backend.query(loadResponseContextRef, args);
    if (context.kind !== "ready") throw new Error(context.reason);
    expect(context.gameType).toBe("AI_CHAT_SHOWDOWN");
    expect(context.prompts).toHaveLength(1);
    expect(context.history).toEqual([]);
    const prompt = context.prompts[0];
    if (!prompt) throw new Error("Expected one ChatSlop prompt");

    await expect(
      backend.mutation(persistResponseRef, {
        ...args,
        promptId: prompt.promptId,
        text: "ChatSlop generated response",
        failReason: null,
        usage: {
          modelId: context.modelId,
          inputTokens: 4,
          outputTokens: 6,
          costUsd: 0.004,
        },
      }),
    ).resolves.toEqual({ status: "INSERTED" });
    await expect(backend.mutation(finishResponseJobRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
    });

    const persisted = await backend.run(async (ctx) => ({
      job: await ctx.db.get("generationJobs", seeded.job._id),
      response: await ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (index) =>
          index.eq("promptId", prompt.promptId).eq("playerId", context.playerId),
        )
        .unique(),
    }));
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.response?.text).toBe("ChatSlop generated response");
  });

  test("materializes failed AI responses and settles a timers-disabled writing phase", async () => {
    const { backend, host, started } = await createTimersDisabledAiOnlySloplash();
    await backend.mutation(enqueueQueuedResponseJobsRef, { gameId: host.gameId });
    const seeded = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "RESPONSE").eq("status", "QUEUED"),
        )
        .take(8);
      if (!game || jobs.length !== 3 || jobs.some((job) => !job.workId)) {
        throw new Error("Expected three handed-off AI response jobs");
      }
      return { game, jobs };
    });
    const [persistedJob, runningEmptyJob, queuedEmptyJob] = seeded.jobs;
    if (!persistedJob?.workId || !runningEmptyJob?.workId || !queuedEmptyJob?.workId) {
      throw new Error("Expected response Workpool ids");
    }
    const argsFor = (job: typeof persistedJob): ResponseWorkArgs => ({
      jobId: job._id,
      gameId: host.gameId,
      roundId: started.roundId,
      roundNumber: 1,
      phaseGeneration: seeded.game.phaseGeneration,
      attempt: job.attempt,
    });
    const persistedArgs = argsFor(persistedJob);
    await backend.mutation(claimResponseJobRef, persistedArgs);
    await backend.mutation(claimResponseJobRef, argsFor(runningEmptyJob));

    const persistedContext = await backend.query(loadResponseContextRef, persistedArgs);
    if (persistedContext.kind !== "ready") throw new Error(persistedContext.reason);
    for (const prompt of persistedContext.prompts) {
      await backend.mutation(persistResponseRef, {
        ...persistedArgs,
        promptId: prompt.promptId,
        text: "durable response before action failure",
        failReason: null,
        usage: {
          modelId: persistedContext.modelId,
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0.0001,
        },
      });
    }

    await backend.mutation(responseWorkCompleteRef, {
      workId: persistedJob.workId,
      context: persistedArgs,
      result: { kind: "failed", error: "failed after persistence" },
    });
    for (const emptyJob of [runningEmptyJob, queuedEmptyJob]) {
      await backend.mutation(responseWorkCompleteRef, {
        workId: emptyJob.workId!,
        context: argsFor(emptyJob),
        result: { kind: "failed", error: "failed before persistence" },
      });
    }

    const beforeSettlement = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      jobs: await Promise.all(seeded.jobs.map((job) => ctx.db.get("generationJobs", job._id))),
      responses: await ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(8),
    }));
    expect(beforeSettlement.game?.status).toBe("WRITING");
    expect(beforeSettlement.jobs.every((job) => job?.status === "FAILED")).toBe(true);
    expect(beforeSettlement.responses).toHaveLength(6);
    expect(
      beforeSettlement.responses.filter((response) => response.text === FORFEIT_MARKER),
    ).toHaveLength(4);
    expect(
      beforeSettlement.responses
        .filter((response) => response.text === FORFEIT_MARKER)
        .every((response) => response.failReason === "failed before persistence"),
    ).toBe(true);

    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());
    const settledGame = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(settledGame?.status).not.toBe("WRITING");
  });

  test("claims work atomically, rejects stale phase writes, and records thrown failures", async () => {
    const { backend, host, started } = await createStartedSloplash();
    const seeded = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .take(16);
      const claimedJob = jobs[0];
      const failedJob = jobs[1];
      if (!game || !claimedJob || !failedJob) throw new Error("Expected two response jobs");
      const now = Date.now();
      await ctx.db.patch("generationJobs", claimedJob._id, {
        attempt: 1,
        workId: "claim-work",
        updatedAt: now,
      });
      await ctx.db.patch("generationJobs", failedJob._id, {
        status: "RUNNING",
        attempt: 1,
        workId: "failure-work",
        startedAt: now,
        updatedAt: now,
      });
      return { claimedJob, failedJob, game };
    });
    const claimedArgs: ResponseWorkArgs = {
      jobId: seeded.claimedJob._id,
      gameId: host.gameId,
      roundId: started.roundId,
      roundNumber: 1,
      phaseGeneration: seeded.game.phaseGeneration,
      attempt: 1,
    };

    await expect(backend.mutation(claimResponseJobRef, claimedArgs)).resolves.toEqual({
      status: "CLAIMED",
    });
    await expect(backend.mutation(claimResponseJobRef, claimedArgs)).resolves.toMatchObject({
      status: "IGNORED",
    });
    const ready = await backend.query(loadResponseContextRef, claimedArgs);
    if (ready.kind !== "ready") throw new Error(ready.reason);
    const prompt = ready.prompts[0];
    if (!prompt) throw new Error("Expected an assigned prompt");

    await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      if (!game) throw new Error("Expected game");
      await ctx.db.patch("games", game._id, {
        phaseGeneration: game.phaseGeneration + 1,
        updatedAt: Date.now(),
      });
    });
    await expect(
      backend.mutation(persistResponseRef, {
        ...claimedArgs,
        promptId: prompt.promptId,
        text: "must not persist",
        failReason: null,
        usage: {
          modelId: ready.modelId,
          inputTokens: 10,
          outputTokens: 10,
          costUsd: 0.01,
        },
      }),
    ).resolves.toMatchObject({ status: "STALE" });
    await expect(
      backend.mutation(cancelResponseJobRef, {
        ...claimedArgs,
        reason: "Writing phase is no longer current",
      }),
    ).resolves.toEqual({ canceled: true });

    const failureContext: ResponseWorkArgs = {
      ...claimedArgs,
      jobId: seeded.failedJob._id,
    };
    await backend.mutation(responseWorkCompleteRef, {
      workId: "wrong-work",
      context: failureContext,
      result: { kind: "failed", error: "ignored failure" },
    });
    await backend.mutation(responseWorkCompleteRef, {
      workId: "failure-work",
      context: failureContext,
      result: { kind: "failed", error: "provider action threw" },
    });

    const final = await backend.run(async (ctx) => {
      const claimedJob = await ctx.db.get("generationJobs", seeded.claimedJob._id);
      const failedJob = await ctx.db.get("generationJobs", seeded.failedJob._id);
      const responses = await ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(16);
      const game = await ctx.db.get("games", host.gameId);
      return { claimedJob, failedJob, game, responses };
    });
    expect(final.claimedJob).toMatchObject({
      status: "CANCELED",
      error: "Writing phase is no longer current",
    });
    expect(final.failedJob).toMatchObject({
      status: "FAILED",
      error: "provider action threw",
    });
    expect(final.responses).toEqual([]);
    expect(final.game).toMatchObject({ aiInputTokens: 0, aiOutputTokens: 0, aiCostUsd: 0 });
  });
});
