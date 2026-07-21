/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workflowTest from "@convex-dev/workflow/test";
import type { WorkflowId } from "@convex-dev/workflow";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { buildReviewedFreshPackRequest } from "../src/games/quizslop/content-source/catalog-evidence";
import {
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
  resolveQuizSlopContentConfig,
} from "../src/games/quizslop/content-source/content-config";
import { buildCatalogFallbackPack } from "../src/games/quizslop/content-source/pack-materialization";
import {
  QUIZSLOP_AI_BANKS_PER_BATCH,
  type QuizSlopFrozenPack,
} from "../src/games/quizslop/content-source/contracts";
import { packValidationError, readFrozenResult } from "./quizslopPackValidation";

const modules = import.meta.glob("./**/*.ts");
const GENERATOR_MODEL_ID = "anthropic/claude-haiku-4.5";

function createTestBackend(options: { registerWorkflow?: boolean } = {}) {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  if (options.registerWorkflow !== false) workflowTest.register(backend);
  return backend;
}

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "host-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function createQueuedRoom(backend: ReturnType<typeof createTestBackend>) {
  const host = await backend.action(api.rooms.create, {
    gameType: "QUIZSLOP",
    hostName: "Registrar",
    hostSecret: "host-secret",
    quizSlopContentSource: "AI",
    quizSlopGeneratorModelId: GENERATOR_MODEL_ID,
  });
  const snapshot = await backend.run(async (ctx) => ({
    state: await ctx.db
      .query("quizSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
      .unique(),
    job: await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_generationKey", (index) =>
        index.eq("gameId", host.gameId).eq("generationKey", "quizslop-pack-v1"),
      )
      .unique(),
  }));
  if (
    !snapshot.state ||
    snapshot.state.contentSource !== "AI" ||
    !snapshot.state.generatorModelId ||
    snapshot.state.packStatus !== "GENERATING" ||
    !snapshot.job?.workflowId ||
    !snapshot.job.targetId
  ) {
    throw new Error("Expected a queued QuizSlop pack job");
  }
  return {
    host,
    state: {
      ...snapshot.state,
      contentSource: "AI" as const,
      generatorModelId: snapshot.state.generatorModelId,
    },
    job: snapshot.job,
    packId: snapshot.job.targetId,
    workflowId: snapshot.job.workflowId as WorkflowId,
  };
}

function reviewedRequest(packId: string, requestedAt: number) {
  const config = resolveQuizSlopContentConfig({
    mode: "AI",
    generatorModelId: GENERATOR_MODEL_ID,
  });
  if (config.mode !== "AI") throw new Error("Expected AI content config");
  const resolution = buildReviewedFreshPackRequest({ packId, requestedAt, config });
  if (resolution.kind !== "READY") throw new Error("Expected reviewed QuizSlop evidence");
  return resolution.request;
}

function completeAiUsage(bankCount: number) {
  const batchCount = Math.ceil(bankCount / QUIZSLOP_AI_BANKS_PER_BATCH);
  return Array.from({ length: batchCount }, () => [
    {
      requestedModelId: GENERATOR_MODEL_ID,
      actualModelId: GENERATOR_MODEL_ID,
      inputTokens: 120,
      outputTokens: 40,
      costUsd: 0.004,
    },
    {
      requestedModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
      actualModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
      inputTokens: 80,
      outputTokens: 20,
      costUsd: 0.006,
    },
  ]).flat();
}

describe("QuizSlop fresh-pack persistence", () => {
  test("rejects malformed workflow return values before nested fields are inspected", () => {
    expect(
      readFrozenResult({
        kind: "AI_FROZEN",
        pack: { source: "AI", banks: "definitely not a pack" },
      }),
    ).toBeNull();
  });

  test("transactionally schedules pack recovery with room creation", async () => {
    vi.useFakeTimers();
    const backend = createTestBackend({ registerWorkflow: false });
    const created = await backend.mutation(internal.roomsInternal.createRoom, {
      aiPlayers: [],
      capabilityHash: "test-capability-hash",
      gameType: "QUIZSLOP",
      hostName: "Registrar",
      hostNormalizedName: "registrar",
      hostParticipation: "PLAYER",
      personaIdentity: "OTHER",
      personaModelId: null,
      quizSlopContentSource: "AI",
      quizSlopGeneratorModelId: GENERATOR_MODEL_ID,
      quizSlopPromptVersion: "quizslop-fresh-pack-v2",
      quizSlopSchemaVersion: "quizslop-frozen-pack-v1",
      quizSlopVerifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
      roomCode: "QSAFE1",
      seekerIdentity: "OTHER",
      timersDisabled: false,
      totalRounds: 0,
      ttsMode: "OFF",
      ttsVoice: "RANDOM",
    });
    if (created.kind !== "CREATED") throw new Error("Expected a created room");

    const before = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", created.gameId))
        .unique(),
      job: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", created.gameId).eq("generationKey", "quizslop-pack-v1"),
        )
        .unique(),
    }));
    expect(before.state?.packStatus).toBe("PENDING");
    expect(before.job).toBeNull();

    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());
    const after = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", created.gameId))
        .unique(),
      job: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", created.gameId).eq("generationKey", "quizslop-pack-v1"),
        )
        .unique(),
    }));
    expect(after.state?.packStatus).toBe("FALLBACK");
    expect(after.job).toMatchObject({ status: "SUCCEEDED", attempt: 1 });
  });

  test("returns the created room with a complete fallback when workflow start fails", async () => {
    const backend = createTestBackend({ registerWorkflow: false });
    const host = await backend.action(api.rooms.create, {
      gameType: "QUIZSLOP",
      hostName: "Registrar",
      hostSecret: "host-secret",
      quizSlopContentSource: "AI",
      quizSlopGeneratorModelId: GENERATOR_MODEL_ID,
    });

    const persisted = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      job: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", host.gameId).eq("generationKey", "quizslop-pack-v1"),
        )
        .unique(),
      topics: await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      questions: await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
    }));

    expect(host.capability).toEqual(expect.any(String));
    expect(persisted.state?.packStatus).toBe("FALLBACK");
    expect(persisted.job).toMatchObject({ status: "SUCCEEDED" });
    expect(persisted.topics).toHaveLength(25);
    expect(persisted.questions).toHaveLength(100);
  });

  test("atomically freezes a complete verified AI pack and aggregates both model usages", async () => {
    const backend = createTestBackend();
    const { host, job, packId, workflowId } = await createQueuedRoom(backend);
    const fallback = buildCatalogFallbackPack(reviewedRequest(packId, job.createdAt));
    const pack = {
      ...fallback,
      source: "AI" as const,
      generatorModelId: GENERATOR_MODEL_ID,
      verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
      review: { humanApproved: false, automatedVerifierApproved: true },
      usage: completeAiUsage(fallback.banks.length),
    } satisfies QuizSlopFrozenPack;

    await backend.mutation(internal.quizslopPackJobs.completeQuizSlopPack, {
      workflowId,
      result: { kind: "success", returnValue: { kind: "AI_FROZEN", pack } },
      context: { gameId: host.gameId, jobId: job._id, stage: "QUIZSLOP_PACK" },
    });
    // Delivery is at-least-once; the same completion must not write or bill twice.
    await backend.mutation(internal.quizslopPackJobs.completeQuizSlopPack, {
      workflowId,
      result: { kind: "success", returnValue: { kind: "AI_FROZEN", pack } },
      context: { gameId: host.gameId, jobId: job._id, stage: "QUIZSLOP_PACK" },
    });

    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      job: await ctx.db.get("generationJobs", job._id),
      topics: await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      questions: await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      sources: await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      usage: await ctx.db
        .query("gameModelUsage")
        .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", host.gameId))
        .collect(),
    }));

    expect(persisted.state?.packStatus).toBe("READY");
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.job?.error).toBeUndefined();
    expect(persisted.topics).toHaveLength(25);
    expect(persisted.questions).toHaveLength(100);
    expect(persisted.sources.length).toBeGreaterThanOrEqual(100);
    expect(persisted.questions[0]?.provenance).toMatchObject({
      generatorModelId: GENERATOR_MODEL_ID,
      verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
    });
    expect(persisted.game).toMatchObject({ aiInputTokens: 1_400, aiOutputTokens: 420 });
    expect(persisted.game?.aiCostUsd).toBeCloseTo(0.07);
    expect(persisted.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: GENERATOR_MODEL_ID, inputTokens: 840 }),
        expect.objectContaining({
          modelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
          inputTokens: 560,
        }),
      ]),
    );
  });

  test("starts from the complete 25-bank AI pack but builds only players plus two rounds", async () => {
    const backend = createTestBackend({ registerWorkflow: false });
    const host = await backend.action(api.rooms.create, {
      gameType: "QUIZSLOP",
      hostName: "Registrar",
      hostSecret: "host-secret",
      quizSlopContentSource: "AI",
      quizSlopGeneratorModelId: GENERATOR_MODEL_ID,
    });
    const guest = await backend.action(api.rooms.join, {
      name: "Bea",
      roomCode: host.roomCode,
    });
    const frozen = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      topics: await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
    }));
    expect(frozen.state).toMatchObject({ contentSource: "AI", packStatus: "FALLBACK" });
    expect(frozen.topics).toHaveLength(25);
    const players = [host, guest];
    for (const [index, player] of players.entries()) {
      const catalogTopicId = frozen.topics[index]?.catalogTopicId;
      if (!catalogTopicId) throw new Error("Expected a frozen catalog-backed topic");
      await expect(
        backend.mutation(api.quizslop.chooseCatalogTopic, {
          capability: player.capability,
          catalogTopicId,
        }),
      ).resolves.toMatchObject({ kind: "CONFIRMED" });
      await backend.mutation(api.presence.heartbeat, {
        capability: player.capability,
        interval: 5_000,
        sessionId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      });
    }

    await expect(
      backend.mutation(api.quizslop.start, { capability: host.capability }),
    ).resolves.toEqual({ started: true, totalRounds: 4 });
    const started = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      topics: await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      rounds: await ctx.db
        .query("quizSlopRounds")
        .withIndex("by_gameId_and_deckOrdinal", (index) => index.eq("gameId", host.gameId))
        .collect(),
    }));
    expect(started.topics).toHaveLength(25);
    expect(started.rounds.map((round) => round.kind)).toEqual([
      "WARM_UP",
      "HOME_TURF",
      "HOME_TURF",
      "HOUSE_CHOICE",
    ]);
    expect(started.game).toMatchObject({ totalRounds: 4, currentRound: 1 });
    expect(started.game?.phaseDeadline).toBeUndefined();
    expect(started.state).toMatchObject({ phase: "TOPIC_REVEAL", deckPosition: 0 });
  });

  test("rejects an AI pack that omits per-batch generator or verifier provenance", async () => {
    const backend = createTestBackend();
    const { state, job, packId } = await createQueuedRoom(backend);
    const request = reviewedRequest(packId, job.createdAt);
    const fallback = buildCatalogFallbackPack(request);
    if (state.contentSource !== "AI" || !state.generatorModelId) {
      throw new Error("Expected an AI pack state");
    }
    const pack = {
      ...fallback,
      source: "AI" as const,
      generatorModelId: GENERATOR_MODEL_ID,
      verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
      review: { humanApproved: false, automatedVerifierApproved: true },
      usage: completeAiUsage(fallback.banks.length).slice(0, 2),
    } satisfies QuizSlopFrozenPack;

    expect(packValidationError(pack, state, packId, request)).toBe(
      "The frozen pack contained impossible model usage provenance",
    );
  });

  test("turns a failed workflow into one complete catalog pack without storing model errors", async () => {
    const backend = createTestBackend();
    const { host, job, workflowId } = await createQueuedRoom(backend);

    await backend.mutation(internal.quizslopPackJobs.completeQuizSlopPack, {
      workflowId,
      result: { kind: "failed", error: "raw provider response that must not be retained" },
      context: { gameId: host.gameId, jobId: job._id, stage: "QUIZSLOP_PACK" },
    });

    const persisted = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      job: await ctx.db.get("generationJobs", job._id),
      topics: await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      questions: await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
    }));

    expect(persisted.state?.packStatus).toBe("FALLBACK");
    expect(persisted.job).toMatchObject({ status: "SUCCEEDED" });
    expect(persisted.job?.error).toContain("complete reviewed catalog fallback loaded");
    expect(persisted.job?.error).not.toContain("raw provider response");
    expect(persisted.topics).toHaveLength(25);
    expect(persisted.questions).toHaveLength(100);
    expect(persisted.questions[0]?.provenance).toMatchObject({
      generatorModelId: null,
      verifierModelId: null,
      generatedAt: null,
    });
  });

  test("ignores duplicate queue requests without restarting the durable workflow", async () => {
    const backend = createTestBackend();
    const { host, job } = await createQueuedRoom(backend);

    const result = await backend.mutation(internal.quizslopPackJobs.queueFreshPack, {
      gameId: host.gameId,
      generatorModelId: GENERATOR_MODEL_ID,
    });
    const jobs = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", host.gameId).eq("generationKey", "quizslop-pack-v1"),
        )
        .take(2),
    );

    expect(result).toEqual({ status: "EXISTING", jobId: job._id });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ attempt: 1, workflowId: job.workflowId });
  });

  test("watchdog recovery retains the canceled workflow for lifecycle cleanup", async () => {
    const backend = createTestBackend();
    const { host, job, workflowId } = await createQueuedRoom(backend);

    const recovered = await backend.mutation(internal.quizslopPackJobs.recoverFreshPack, {
      gameId: host.gameId,
      generatorModelId: GENERATOR_MODEL_ID,
    });
    const persistedJob = await backend.run(async (ctx) => ctx.db.get("generationJobs", job._id));
    expect(recovered).toEqual({ status: "FALLBACK", jobId: job._id });
    expect(persistedJob).toMatchObject({
      status: "SUCCEEDED",
      attempt: 2,
      workflowId,
    });
    await expect(
      backend.query(components.workflow.workflow.getStatus, { workflowId }),
    ).resolves.toMatchObject({ workflow: { runResult: { kind: "canceled" } } });
  });

  test("fails closed instead of leaving PENDING when a workflow completion is stale", async () => {
    const backend = createTestBackend();
    const { host, job, workflowId } = await createQueuedRoom(backend);
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "WRITING" });
    });

    await backend.mutation(internal.quizslopPackJobs.completeQuizSlopPack, {
      workflowId,
      result: { kind: "failed", error: "late completion" },
      context: { gameId: host.gameId, jobId: job._id, stage: "QUIZSLOP_PACK" },
    });

    const persisted = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      job: await ctx.db.get("generationJobs", job._id),
    }));
    expect(persisted.state?.packStatus).toBe("FAILED");
    expect(persisted.job).toMatchObject({ status: "CANCELED" });
  });

  test("rejects a header-valid AI pack whose facts or primary evidence drifted", async () => {
    const backend = createTestBackend();
    const { host, job, packId, workflowId } = await createQueuedRoom(backend);
    const fallback = buildCatalogFallbackPack(reviewedRequest(packId, job.createdAt));
    const firstQuestion = fallback.banks[0]?.questions[0];
    if (!firstQuestion) throw new Error("Expected a fallback question");
    firstQuestion.canonicalFact = `${firstQuestion.canonicalFact} Fabricated appendix.`;
    firstQuestion.sources = firstQuestion.sources.map((source) => ({
      ...source,
      primary: false,
    }));
    const pack = {
      ...fallback,
      source: "AI" as const,
      generatorModelId: GENERATOR_MODEL_ID,
      verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
      review: { humanApproved: false, automatedVerifierApproved: true },
      usage: completeAiUsage(fallback.banks.length),
    } satisfies QuizSlopFrozenPack;

    await backend.mutation(internal.quizslopPackJobs.completeQuizSlopPack, {
      workflowId,
      result: { kind: "success", returnValue: { kind: "AI_FROZEN", pack } },
      context: { gameId: host.gameId, jobId: job._id, stage: "QUIZSLOP_PACK" },
    });

    const persisted = await backend.run(async (ctx) => ({
      state: await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
      questions: await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
      sources: await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .collect(),
    }));
    expect(persisted.state?.packStatus).toBe("FALLBACK");
    expect(
      persisted.questions.some((question) => question.canonicalFact.includes("Fabricated")),
    ).toBe(false);
    expect(persisted.sources.filter((source) => source.primary)).toHaveLength(100);
  });
});
