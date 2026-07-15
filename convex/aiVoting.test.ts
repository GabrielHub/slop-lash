/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  cancelVoteJobRef,
  claimVoteJobRef,
  enqueueQueuedVoteJobsRef,
  finishVoteJobRef,
  generateVoteRef,
  loadVoteContextRef,
  persistVoteRef,
  settleChatslopVoteQuorumRef,
  settleSloplashVoteQuorumRef,
  voteWorkCompleteRef,
  type VoteWorkArgs,
} from "./aiVotingContracts";
import schema from "./schema";

vi.mock("../src/games/sloplash/ai", () => ({
  generateJoke: async (modelId: string, promptText: string) => ({
    text: `mocked response: ${promptText}`,
    usage: { modelId, inputTokens: 1, outputTokens: 1, costUsd: 0.0001 },
    failReason: null,
  }),
  aiVote: async (modelId: string) => ({
    choice: "A" as const,
    reactionsA: ["fire", "laugh"] as const,
    reactionsB: ["skull"] as const,
    usage: { modelId, inputTokens: 5, outputTokens: 3, costUsd: 0.001 },
    failReason: null,
  }),
}));

vi.mock("../src/games/ai-chat-showdown/ai", () => ({
  LABELS: ["A", "B", "C", "D", "E", "F", "G", "H"],
  simpleHash: (value: string) => value.length,
  generateJoke: async (modelId: string, promptText: string) => ({
    text: `mocked response: ${promptText}`,
    usage: { modelId, inputTokens: 1, outputTokens: 1, costUsd: 0.0001 },
    failReason: null,
  }),
  aiVoteNWay: async (modelId: string, _promptText: string, responses: Array<{ id: string }>) => ({
    chosenResponseId: responses.at(-1)?.id ?? "",
    usage: { modelId, inputTokens: 6, outputTokens: 4, costUsd: 0.002 },
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

type Backend = ReturnType<typeof createTestBackend>;
type VotingGameType = "SLOPLASH" | "AI_CHAT_SHOWDOWN";

async function createVotingGame(gameType: VotingGameType, foreignQueuedJobs = 0) {
  vi.useFakeTimers();
  vi.stubEnv("HOST_SECRET", "host-secret");
  const backend = createTestBackend();
  const host = await backend.action(api.rooms.create, {
    aiModelIds:
      gameType === "SLOPLASH"
        ? ["google/gemini-3-flash", "openai/gpt-5.4-mini", "anthropic/claude-haiku-4.5"]
        : ["google/gemini-3-flash", "openai/gpt-5.4-mini"],
    gameType,
    hostName: "Host",
    hostSecret: "host-secret",
    timersDisabled: true,
    totalRounds: 1,
  });
  const started = await backend.mutation(api.lobby.start, {
    capability: host.capability,
  });

  if (foreignQueuedJobs > 0) {
    await backend.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < foreignQueuedJobs; index += 1) {
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
  }

  await backend.run(async (ctx) => {
    const assignments = await ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", host.gameId).eq("roundId", started.roundId),
      )
      .take(64);
    for (const [index, assignment] of assignments.entries()) {
      const existing = await ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (range) =>
          range.eq("promptId", assignment.promptId).eq("playerId", assignment.playerId),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("responses", {
        gameId: host.gameId,
        roundId: started.roundId,
        promptId: assignment.promptId,
        playerId: assignment.playerId,
        text: `seeded response ${index}`,
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
    }
  });

  const settleRef =
    gameType === "SLOPLASH" ? settleSloplashVoteQuorumRef : settleChatslopVoteQuorumRef;
  await backend.mutation(settleRef, { gameId: host.gameId });
  return { backend, host, started };
}

async function createTimersDisabledAiOnlyChatslopVotingGame() {
  vi.useFakeTimers();
  vi.stubEnv("HOST_SECRET", "host-secret");
  const backend = createTestBackend();
  const host = await backend.action(api.rooms.create, {
    aiModelIds: ["google/gemini-3-flash", "openai/gpt-5.4-mini", "anthropic/claude-haiku-4.5"],
    gameType: "AI_CHAT_SHOWDOWN",
    hostParticipation: "DISPLAY_ONLY",
    hostSecret: "host-secret",
    timersDisabled: true,
    totalRounds: 1,
  });
  const started = await backend.mutation(api.lobby.start, { capability: host.capability });
  await backend.run(async (ctx) => {
    const assignments = await ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", host.gameId).eq("roundId", started.roundId),
      )
      .take(8);
    for (const [index, assignment] of assignments.entries()) {
      await ctx.db.insert("responses", {
        gameId: host.gameId,
        roundId: started.roundId,
        promptId: assignment.promptId,
        playerId: assignment.playerId,
        text: `AI response ${index}`,
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
    }
  });
  await backend.mutation(settleChatslopVoteQuorumRef, { gameId: host.gameId });
  return { backend, host, started };
}

async function loadVotingSnapshot(backend: Backend, gameId: Id<"games">, roundId: Id<"rounds">) {
  return backend.run(async (ctx) => {
    const [game, round, prompts, responses, players, jobs] = await Promise.all([
      ctx.db.get("games", gameId),
      ctx.db.get("rounds", roundId),
      ctx.db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", roundId),
        )
        .take(32),
      ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", roundId),
        )
        .take(256),
      ctx.db
        .query("players")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(16),
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", gameId).eq("status", "QUEUED"),
        )
        .take(256),
    ]);
    if (!game || !round) throw new Error("Expected a current voting round");
    const votingPrompts =
      game.gameType === "SLOPLASH"
        ? prompts
            .filter((prompt) => {
              const promptResponses = responses.filter(
                (response) => response.promptId === prompt._id,
              );
              return promptResponses.length >= 2;
            })
            .toSorted((left, right) => left._id.localeCompare(right._id))
        : prompts.filter((prompt) => prompt.ordinal === 0);
    const currentPrompt = votingPrompts[game.votingPromptIndex];
    if (!currentPrompt) throw new Error("Expected a visible voting prompt");
    return {
      game,
      round,
      prompts,
      responses,
      players,
      currentPrompt,
      voteJobs: jobs.filter((job) => job.kind === "VOTE"),
    };
  });
}

function workArgs(
  job: Doc<"generationJobs">,
  game: Doc<"games">,
  round: Doc<"rounds">,
  promptId: Id<"prompts">,
): VoteWorkArgs {
  return {
    jobId: job._id,
    gameId: game._id,
    roundId: round._id,
    promptId,
    roundNumber: round.roundNumber,
    phaseGeneration: game.phaseGeneration,
    attempt: job.attempt,
  };
}

function voterId(job: Doc<"generationJobs">): Id<"players"> {
  if (!job.targetId) throw new Error("Vote job is missing a voter");
  return job.targetId as Id<"players">;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("AI vote generation jobs", () => {
  test("hands only the visible Slop-Lash prompt to Workpool and preserves future backlog", async () => {
    const { backend, host, started } = await createVotingGame("SLOPLASH");
    const before = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    expect(before.game).toMatchObject({ status: "VOTING", votingRevealing: false });
    const currentJobs = before.voteJobs.filter((job) =>
      job.generationKey.includes(`:${before.currentPrompt._id}:`),
    );
    const futureJobs = before.voteJobs.filter((job) => !currentJobs.includes(job));
    expect(currentJobs.length).toBeGreaterThan(0);
    expect(futureJobs.length).toBeGreaterThan(0);

    const first = await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    expect(first).toEqual({
      enqueued: currentJobs.length,
      skipped: futureJobs.length,
      failed: 0,
      canceled: 0,
    });
    const after = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const handedOff = after.voteJobs.filter((job) => job.workId !== undefined);
    const waiting = after.voteJobs.filter((job) => job.workId === undefined);
    expect(handedOff).toHaveLength(currentJobs.length);
    expect(handedOff.every((job) => job.status === "QUEUED" && job.attempt === 1)).toBe(true);
    expect(waiting).toHaveLength(futureJobs.length);
    expect(waiting.every((job) => job.attempt === 0)).toBe(true);

    const repeated = await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    expect(repeated).toEqual({
      enqueued: 0,
      skipped: before.voteJobs.length,
      failed: 0,
      canceled: 0,
    });
  });

  test("drains queued votes through the exact kind/status index behind foreign work", async () => {
    const { backend, host, started } = await createVotingGame("AI_CHAT_SHOWDOWN", 32);
    const before = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    expect(before.voteJobs.length).toBeGreaterThan(0);

    const result = await backend.mutation(enqueueQueuedVoteJobsRef, {
      gameId: host.gameId,
    });
    expect(result).toEqual({
      enqueued: before.voteJobs.length,
      skipped: 0,
      failed: 0,
      canceled: 0,
    });

    const foreignJobs = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "CHAT_REPLY"),
        )
        .take(64),
    );
    expect(foreignJobs).toHaveLength(32);
    expect(foreignJobs.every((job) => job.workId === undefined)).toBe(true);
  });

  test("cancels unstarted Slop-Lash votes when the visible prompt is already revealing", async () => {
    const { backend, host, started } = await createVotingGame("SLOPLASH");
    const before = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const currentJobs = before.voteJobs.filter((job) =>
      job.generationKey.includes(`:${before.currentPrompt._id}:`),
    );
    const futureJobs = before.voteJobs.filter((job) => !currentJobs.includes(job));

    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, {
        phaseGeneration: before.game.phaseGeneration + 1,
        updatedAt: Date.now(),
        votingRevealing: true,
      });
    });
    const result = await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    expect(result).toEqual({
      enqueued: 0,
      skipped: futureJobs.length,
      failed: 0,
      canceled: currentJobs.length,
    });
    const jobs = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .take(512)
        .then((rows) => rows.filter((job) => job.gameId === host.gameId)),
    );
    const canceledIds = new Set(
      jobs.filter((job) => job.kind === "VOTE" && job.status === "CANCELED").map((job) => job._id),
    );
    expect(currentJobs.every((job) => canceledIds.has(job._id))).toBe(true);
    expect(
      futureJobs.every((job) =>
        jobs.some(
          (candidate) =>
            candidate._id === job._id &&
            candidate.status === "QUEUED" &&
            candidate.workId === undefined,
        ),
      ),
    ).toBe(true);
  });

  test("runs the Slop-Lash action with redacted peers and atomically stores reactions and usage", async () => {
    const { backend, host, started } = await createVotingGame("SLOPLASH");
    await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    const snapshot = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const job = snapshot.voteJobs.find(
      (candidate) =>
        candidate.workId !== undefined &&
        candidate.generationKey.includes(`:${snapshot.currentPrompt._id}:`),
    );
    if (!job) throw new Error("Expected a current Slop-Lash vote job");
    const args = workArgs(job, snapshot.game, snapshot.round, snapshot.currentPrompt._id);

    await expect(backend.action(generateVoteRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
      persistedVote: true,
      duplicateVote: false,
    });
    const persisted = await backend.run(async (ctx) => {
      const vote = await ctx.db
        .query("votes")
        .withIndex("by_promptId_and_voterId", (index) =>
          index.eq("promptId", args.promptId).eq("voterId", voterId(job)),
        )
        .unique();
      const reactions = vote?.responseId
        ? await ctx.db
            .query("reactions")
            .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", host.gameId))
            .take(32)
        : [];
      return {
        game: await ctx.db.get("games", host.gameId),
        job: await ctx.db.get("generationJobs", job._id),
        reactions,
        vote,
      };
    });
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.vote?.responseId).toBeDefined();
    expect(persisted.reactions.map((reaction) => reaction.emoji).toSorted()).toEqual([
      "fire",
      "laugh",
      "skull",
    ]);
    expect(persisted.game).toMatchObject({ aiInputTokens: 5, aiOutputTokens: 3 });
    expect(persisted.game?.aiCostUsd).toBeCloseTo(0.001);

    await expect(backend.action(generateVoteRef, args)).resolves.toMatchObject({
      status: "SKIPPED",
      persistedVote: false,
    });
    const unchanged = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(unchanged).toMatchObject({ aiInputTokens: 5, aiOutputTokens: 3 });
  });

  test("runs the ChatSlop N-way action without exposing authors or creating reactions", async () => {
    const { backend, host, started } = await createVotingGame("AI_CHAT_SHOWDOWN");
    await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    const snapshot = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const job = snapshot.voteJobs.find((candidate) => candidate.workId !== undefined);
    if (!job) throw new Error("Expected a ChatSlop vote job");
    const args = workArgs(job, snapshot.game, snapshot.round, snapshot.currentPrompt._id);

    await expect(backend.action(generateVoteRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
      persistedVote: true,
      duplicateVote: false,
    });
    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      job: await ctx.db.get("generationJobs", job._id),
      vote: await ctx.db
        .query("votes")
        .withIndex("by_promptId_and_voterId", (index) =>
          index.eq("promptId", args.promptId).eq("voterId", voterId(job)),
        )
        .unique(),
      reactions: await ctx.db
        .query("reactions")
        .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", host.gameId))
        .take(16),
    }));
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.vote?.responseId).toBeDefined();
    expect(persisted.reactions).toEqual([]);
    expect(persisted.game).toMatchObject({ aiInputTokens: 6, aiOutputTokens: 4 });
    expect(persisted.game?.aiCostUsd).toBeCloseTo(0.002);
  });

  test("deduplicates vote, reaction, and usage writes by prompt and voter", async () => {
    const { backend, host, started } = await createVotingGame("SLOPLASH");
    await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    const snapshot = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const job = snapshot.voteJobs.find((candidate) => candidate.workId !== undefined);
    if (!job) throw new Error("Expected a Slop-Lash vote job");
    const args = workArgs(job, snapshot.game, snapshot.round, snapshot.currentPrompt._id);
    await expect(backend.mutation(claimVoteJobRef, args)).resolves.toEqual({
      status: "CLAIMED",
    });
    const context = await backend.query(loadVoteContextRef, args);
    if (context.kind !== "ready") throw new Error(context.reason);
    expect(context.candidates).toHaveLength(2);
    expect(Object.keys(context.candidates[0] ?? {}).toSorted()).toEqual(["responseId", "text"]);
    const selected = context.candidates[0];
    if (!selected) throw new Error("Expected a redacted peer response");
    const usage = {
      modelId: context.modelId,
      inputTokens: 7,
      outputTokens: 9,
      costUsd: 0.007,
    };

    await expect(
      backend.mutation(persistVoteRef, {
        ...args,
        responseId: selected.responseId,
        failReason: null,
        reactions: [
          { responseId: selected.responseId, emoji: "fire" },
          { responseId: selected.responseId, emoji: "fire" },
        ],
        usage,
      }),
    ).resolves.toEqual({ status: "INSERTED" });
    await expect(
      backend.mutation(persistVoteRef, {
        ...args,
        responseId: context.candidates[1]?.responseId ?? null,
        failReason: "duplicate",
        reactions: [],
        usage: { ...usage, inputTokens: 700 },
      }),
    ).resolves.toEqual({ status: "DUPLICATE" });
    await expect(backend.mutation(finishVoteJobRef, args)).resolves.toEqual({
      status: "SUCCEEDED",
    });

    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      votes: await ctx.db
        .query("votes")
        .withIndex("by_promptId_and_voterId", (index) =>
          index.eq("promptId", args.promptId).eq("voterId", context.playerId),
        )
        .take(2),
      reactions: await ctx.db
        .query("reactions")
        .withIndex("by_responseId_and_playerId_and_emoji", (index) =>
          index
            .eq("responseId", selected.responseId)
            .eq("playerId", context.playerId)
            .eq("emoji", "fire"),
        )
        .take(2),
    }));
    expect(persisted.votes).toHaveLength(1);
    expect(persisted.reactions).toHaveLength(1);
    expect(persisted.game).toMatchObject({ aiInputTokens: 7, aiOutputTokens: 9 });
    expect(persisted.game?.aiCostUsd).toBeCloseTo(0.007);
  });

  test("cancels stale phase writes and records thrown Workpool failures", async () => {
    const { backend, host, started } = await createVotingGame("AI_CHAT_SHOWDOWN");
    await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    const snapshot = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const [staleJob, failedJob] = snapshot.voteJobs.filter((job) => job.workId !== undefined);
    if (!staleJob || !failedJob) throw new Error("Expected two ChatSlop vote jobs");
    const staleArgs = workArgs(staleJob, snapshot.game, snapshot.round, snapshot.currentPrompt._id);
    const failedArgs = workArgs(
      failedJob,
      snapshot.game,
      snapshot.round,
      snapshot.currentPrompt._id,
    );
    await backend.mutation(claimVoteJobRef, staleArgs);
    await backend.mutation(claimVoteJobRef, failedArgs);
    const context = await backend.query(loadVoteContextRef, staleArgs);
    if (context.kind !== "ready") throw new Error(context.reason);
    await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      if (!game) throw new Error("Expected game");
      await ctx.db.patch("games", game._id, {
        phaseGeneration: game.phaseGeneration + 1,
        updatedAt: Date.now(),
      });
    });
    await expect(
      backend.mutation(persistVoteRef, {
        ...staleArgs,
        responseId: context.candidates[0]?.responseId ?? null,
        failReason: null,
        reactions: [],
        usage: {
          modelId: context.modelId,
          inputTokens: 10,
          outputTokens: 10,
          costUsd: 0.01,
        },
      }),
    ).resolves.toMatchObject({ status: "STALE" });
    await backend.mutation(cancelVoteJobRef, {
      ...staleArgs,
      reason: "Voting phase is no longer current",
    });

    await backend.mutation(voteWorkCompleteRef, {
      workId: "wrong-work",
      context: failedArgs,
      result: { kind: "failed", error: "ignored failure" },
    });
    await backend.mutation(voteWorkCompleteRef, {
      workId: failedJob.workId!,
      context: failedArgs,
      result: { kind: "failed", error: "vote provider action threw" },
    });

    const final = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      staleJob: await ctx.db.get("generationJobs", staleJob._id),
      failedJob: await ctx.db.get("generationJobs", failedJob._id),
      votes: await ctx.db
        .query("votes")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(16),
    }));
    expect(final.staleJob).toMatchObject({
      status: "CANCELED",
      error: "Voting phase is no longer current",
    });
    expect(final.failedJob).toMatchObject({
      status: "FAILED",
      error: "vote provider action threw",
    });
    expect(final.votes).toEqual([]);
    expect(final.game).toMatchObject({ aiInputTokens: 0, aiOutputTokens: 0, aiCostUsd: 0 });
  });

  test("materializes failed AI abstentions and settles timers-disabled voting", async () => {
    const { backend, host, started } = await createTimersDisabledAiOnlyChatslopVotingGame();
    await backend.mutation(enqueueQueuedVoteJobsRef, { gameId: host.gameId });
    const snapshot = await loadVotingSnapshot(backend, host.gameId, started.roundId);
    const jobs = snapshot.voteJobs.filter((job) => job.workId !== undefined);
    if (jobs.length !== 3) throw new Error("Expected three handed-off AI vote jobs");
    const [persistedJob, runningEmptyJob, queuedEmptyJob] = jobs;
    if (!persistedJob?.workId || !runningEmptyJob?.workId || !queuedEmptyJob?.workId) {
      throw new Error("Expected vote Workpool ids");
    }
    const persistedArgs = workArgs(
      persistedJob,
      snapshot.game,
      snapshot.round,
      snapshot.currentPrompt._id,
    );
    await backend.mutation(claimVoteJobRef, persistedArgs);
    await backend.mutation(
      claimVoteJobRef,
      workArgs(runningEmptyJob, snapshot.game, snapshot.round, snapshot.currentPrompt._id),
    );
    const context = await backend.query(loadVoteContextRef, persistedArgs);
    if (context.kind !== "ready") throw new Error(context.reason);
    const selected = context.candidates[0];
    if (!selected) throw new Error("Expected an eligible peer response");
    await backend.mutation(persistVoteRef, {
      ...persistedArgs,
      responseId: selected.responseId,
      failReason: null,
      reactions: [],
      usage: {
        modelId: context.modelId,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.0001,
      },
    });

    await backend.mutation(voteWorkCompleteRef, {
      workId: persistedJob.workId,
      context: persistedArgs,
      result: { kind: "failed", error: "failed after vote persistence" },
    });
    for (const emptyJob of [runningEmptyJob, queuedEmptyJob]) {
      await backend.mutation(voteWorkCompleteRef, {
        workId: emptyJob.workId!,
        context: workArgs(emptyJob, snapshot.game, snapshot.round, snapshot.currentPrompt._id),
        result: { kind: "failed", error: "failed before vote persistence" },
      });
    }

    const beforeSettlement = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      votes: await ctx.db
        .query("votes")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(8),
    }));
    expect(beforeSettlement.game?.status).toBe("VOTING");
    expect(beforeSettlement.votes).toHaveLength(3);
    expect(beforeSettlement.votes.filter((vote) => vote.responseId === undefined)).toEqual([
      expect.objectContaining({ failReason: "failed before vote persistence" }),
      expect.objectContaining({ failReason: "failed before vote persistence" }),
    ]);

    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());
    const settledGame = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(settledGame?.status).not.toBe("VOTING");
  });
});
