import { vOnCompleteArgs } from "@convex-dev/workpool";
import { v } from "convex/values";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  enqueueQueuedResponseJobsRef,
  generateResponseRef,
  responseWorkCompleteRef,
  settleChatslopQuorumRef,
  settleSloplashQuorumRef,
  type ResponseHistoryEntry,
  type ResponseWorkArgs,
} from "./aiGenerationContracts";
import { aiGenerationWorkpool } from "./components";

const MAX_RESPONSE_JOBS = 32;
const MAX_PLAYER_ASSIGNMENTS = 16;
const MAX_HISTORY_ROUNDS = 10;
const MAX_ROUND_PROMPTS = 32;
const MAX_ROUND_RESPONSES = 128;
const MAX_ROUND_VOTES = 512;
const MAX_ERROR_LENGTH = 2_000;

const responseWorkArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  roundId: v.id("rounds"),
  roundNumber: v.number(),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

const responseWorkContextValidator = v.object(responseWorkArgsValidator);

const finalStatusValidator = v.union(
  v.literal("SUCCEEDED"),
  v.literal("FAILED"),
  v.literal("CANCELED"),
);

const responseContextValidator = v.union(
  v.object({
    kind: v.literal("ready"),
    gameType: v.union(v.literal("SLOPLASH"), v.literal("AI_CHAT_SHOWDOWN")),
    modelId: v.string(),
    playerId: v.id("players"),
    prompts: v.array(
      v.object({
        promptId: v.id("prompts"),
        text: v.string(),
      }),
    ),
    history: v.array(
      v.object({
        round: v.number(),
        prompt: v.string(),
        yourJoke: v.string(),
        won: v.boolean(),
        winningJoke: v.optional(v.string()),
      }),
    ),
  }),
  v.object({
    kind: v.literal("stale"),
    reason: v.string(),
  }),
);

interface CurrentResponseJob {
  job: Doc<"generationJobs">;
  game: Doc<"games">;
  round: Doc<"rounds">;
  player: Doc<"players"> & { modelId: string };
}

type CurrentResponseJobResult =
  | { kind: "current"; value: CurrentResponseJob }
  | { kind: "stale"; reason: string };

function errorMessage(error: string): string {
  return error.trim().slice(0, MAX_ERROR_LENGTH) || "Unknown generation failure";
}

function expectedGenerationKey(roundNumber: number, playerId: Id<"players">): string {
  return `response:${roundNumber}:${playerId}`;
}

async function validateResponseJob(
  db: DatabaseReader,
  args: ResponseWorkArgs,
  expectedStatus: "QUEUED" | "RUNNING",
): Promise<CurrentResponseJobResult> {
  const job = await db.get("generationJobs", args.jobId);
  if (!job) return { kind: "stale", reason: "Response generation job no longer exists" };
  if (job.gameId !== args.gameId || job.kind !== "RESPONSE") {
    return { kind: "stale", reason: "Response generation job identity changed" };
  }
  if (job.status !== expectedStatus || job.attempt !== args.attempt) {
    return { kind: "stale", reason: "Response generation attempt is no longer current" };
  }

  const playerId = db.normalizeId("players", job.targetId ?? "");
  if (!playerId || job.generationKey !== expectedGenerationKey(args.roundNumber, playerId)) {
    return { kind: "stale", reason: "Response generation key is invalid" };
  }

  const [game, round, player] = await Promise.all([
    db.get("games", args.gameId),
    db.get("rounds", args.roundId),
    db.get("players", playerId),
  ]);
  if (!game || !round || !player) {
    return { kind: "stale", reason: "Response generation context no longer exists" };
  }
  if (game.gameType !== "SLOPLASH" && game.gameType !== "AI_CHAT_SHOWDOWN") {
    return { kind: "stale", reason: "Game type does not generate comedy responses" };
  }
  if (
    game.status !== "WRITING" ||
    game.currentRound !== args.roundNumber ||
    game.phaseGeneration !== args.phaseGeneration
  ) {
    return { kind: "stale", reason: "Writing phase is no longer current" };
  }
  if (round.gameId !== game._id || round.roundNumber !== args.roundNumber) {
    return { kind: "stale", reason: "Round is no longer current" };
  }
  if (
    player.gameId !== game._id ||
    player.type !== "AI" ||
    player.participationStatus !== "ACTIVE" ||
    !player.modelId
  ) {
    return { kind: "stale", reason: "AI player is no longer active" };
  }

  return {
    kind: "current",
    value: {
      job,
      game,
      round,
      player: { ...player, modelId: player.modelId },
    },
  };
}

async function listPlayerAssignments(
  db: DatabaseReader,
  playerId: Id<"players">,
  roundId: Id<"rounds">,
): Promise<Doc<"promptAssignments">[]> {
  return db
    .query("promptAssignments")
    .withIndex("by_playerId_and_roundId", (index) =>
      index.eq("playerId", playerId).eq("roundId", roundId),
    )
    .take(MAX_PLAYER_ASSIGNMENTS);
}

async function buildResponseHistory(
  db: DatabaseReader,
  gameId: Id<"games">,
  playerId: Id<"players">,
  currentRound: number,
): Promise<ResponseHistoryEntry[]> {
  const history: ResponseHistoryEntry[] = [];
  const firstRound = Math.max(1, currentRound - MAX_HISTORY_ROUNDS);

  for (let roundNumber = firstRound; roundNumber < currentRound; roundNumber += 1) {
    const round = await db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) =>
        index.eq("gameId", gameId).eq("roundNumber", roundNumber),
      )
      .unique();
    if (!round) continue;

    const [prompts, responses, votes] = await Promise.all([
      db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(MAX_ROUND_PROMPTS),
      db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(MAX_ROUND_RESPONSES),
      db
        .query("votes")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(MAX_ROUND_VOTES),
    ]);

    for (const prompt of prompts.toSorted((left, right) => left.ordinal - right.ordinal)) {
      const promptResponses = responses.filter((response) => response.promptId === prompt._id);
      const playerResponse = promptResponses.find((response) => response.playerId === playerId);
      if (!playerResponse) continue;

      const opponent = promptResponses.find((response) => response.playerId !== playerId);
      const playerForfeited = playerResponse.text === FORFEIT_MARKER;
      const opponentForfeited = opponent?.text === FORFEIT_MARKER;
      let won = false;
      if (!playerForfeited && opponentForfeited) {
        won = true;
      } else if (!playerForfeited) {
        const promptVotes = votes.filter(
          (vote) => vote.promptId === prompt._id && vote.responseId !== undefined,
        );
        const playerVotes = promptVotes.filter(
          (vote) => vote.responseId === playerResponse._id,
        ).length;
        const opponentVotes = opponent
          ? promptVotes.filter((vote) => vote.responseId === opponent._id).length
          : 0;
        won = playerVotes > opponentVotes;
      }

      history.push({
        round: round.roundNumber,
        prompt: prompt.text,
        yourJoke: playerResponse.text,
        won,
        ...(!won && opponent && !opponentForfeited ? { winningJoke: opponent.text } : {}),
      });
    }
  }

  return history;
}

async function markTerminal(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  status: "FAILED" | "CANCELED",
  error: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("generationJobs", job._id, {
    status,
    error: errorMessage(error),
    completedAt: now,
    updatedAt: now,
  });
}

function responseSettlementRef(game: Doc<"games">) {
  return game.gameType === "SLOPLASH" ? settleSloplashQuorumRef : settleChatslopQuorumRef;
}

async function failCurrentResponseWork(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  args: ResponseWorkArgs,
  status: "FAILED" | "CANCELED",
  reason: string,
): Promise<void> {
  const current = await validateResponseJob(
    ctx.db,
    args,
    job.status === "QUEUED" ? "QUEUED" : "RUNNING",
  );
  if (current.kind === "stale") {
    await markTerminal(ctx, job, status, reason);
    return;
  }

  const { game, player, round } = current.value;
  const failureReason = errorMessage(reason);
  const assignments = await listPlayerAssignments(ctx.db, player._id, round._id);
  for (const assignment of assignments) {
    const [prompt, existing] = await Promise.all([
      ctx.db.get("prompts", assignment.promptId),
      ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (index) =>
          index.eq("promptId", assignment.promptId).eq("playerId", player._id),
        )
        .unique(),
    ]);
    if (
      existing ||
      !prompt ||
      prompt.gameId !== game._id ||
      prompt.roundId !== round._id ||
      assignment.gameId !== game._id ||
      assignment.roundId !== round._id
    ) {
      continue;
    }
    await ctx.db.insert("responses", {
      gameId: game._id,
      roundId: round._id,
      promptId: prompt._id,
      playerId: player._id,
      text: FORFEIT_MARKER,
      pointsEarned: 0,
      failReason: failureReason,
      submittedAt: Date.now(),
    });
  }

  await markTerminal(ctx, job, status, reason);
  await ctx.scheduler.runAfter(0, responseSettlementRef(game), { gameId: game._id });
}

export const enqueueQueuedResponseJobs = internalMutation({
  args: { gameId: v.id("games"), cursor: v.optional(v.string()) },
  returns: v.object({
    enqueued: v.number(),
    skipped: v.number(),
    failed: v.number(),
    canceled: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_kind_and_status", (index) =>
        index.eq("gameId", args.gameId).eq("kind", "RESPONSE").eq("status", "QUEUED"),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: MAX_RESPONSE_JOBS });
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, enqueueQueuedResponseJobsRef, {
        gameId: args.gameId,
        cursor: page.continueCursor,
      });
    }
    const jobs = page.page;
    const result = { enqueued: 0, skipped: 0, failed: 0, canceled: 0 };
    if (jobs.length === 0) return result;

    const game = await ctx.db.get("games", args.gameId);
    if (
      !game ||
      (game.gameType !== "SLOPLASH" && game.gameType !== "AI_CHAT_SHOWDOWN") ||
      game.status !== "WRITING"
    ) {
      for (const job of jobs) {
        await markTerminal(ctx, job, "CANCELED", "Writing phase is no longer current");
        result.canceled += 1;
      }
      return result;
    }

    const round = await ctx.db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) =>
        index.eq("gameId", game._id).eq("roundNumber", game.currentRound),
      )
      .unique();
    if (!round) {
      for (const job of jobs) {
        await markTerminal(ctx, job, "FAILED", "Current round does not exist");
        result.failed += 1;
      }
      return result;
    }

    for (const job of jobs) {
      if (job.workId) {
        result.skipped += 1;
        continue;
      }

      const playerId = ctx.db.normalizeId("players", job.targetId ?? "");
      const player = playerId ? await ctx.db.get("players", playerId) : null;
      if (
        !playerId ||
        job.generationKey !== expectedGenerationKey(game.currentRound, playerId) ||
        !player ||
        player.gameId !== game._id ||
        player.type !== "AI" ||
        player.participationStatus !== "ACTIVE" ||
        !player.modelId
      ) {
        await markTerminal(ctx, job, "FAILED", "Response generation job has an invalid AI target");
        result.failed += 1;
        continue;
      }

      const assignments = await listPlayerAssignments(ctx.db, playerId, round._id);
      if (assignments.length === 0) {
        await markTerminal(ctx, job, "FAILED", "AI player has no prompt assignments");
        result.failed += 1;
        continue;
      }

      const workArgs: ResponseWorkArgs = {
        jobId: job._id,
        gameId: game._id,
        roundId: round._id,
        roundNumber: round.roundNumber,
        phaseGeneration: game.phaseGeneration,
        attempt: job.attempt + 1,
      };
      const workId = await aiGenerationWorkpool.enqueueAction(ctx, generateResponseRef, workArgs, {
        retry: false,
        onComplete: responseWorkCompleteRef,
        context: workArgs,
      });
      await ctx.db.patch("generationJobs", job._id, {
        attempt: workArgs.attempt,
        error: undefined,
        workId,
        updatedAt: Date.now(),
      });
      result.enqueued += 1;
    }

    return result;
  },
});

export const claimResponseJob = internalMutation({
  args: responseWorkArgsValidator,
  returns: v.union(
    v.object({ status: v.literal("CLAIMED") }),
    v.object({ status: v.literal("CANCELED"), reason: v.string() }),
    v.object({ status: v.literal("IGNORED"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.gameId !== args.gameId || job.kind !== "RESPONSE") {
      return { status: "IGNORED" as const, reason: "Response generation job no longer exists" };
    }
    if (job.status !== "QUEUED" || job.attempt !== args.attempt) {
      return { status: "IGNORED" as const, reason: "Response generation job was already claimed" };
    }
    if (!job.workId) {
      await markTerminal(ctx, job, "FAILED", "Response generation job has no Workpool id");
      return { status: "IGNORED" as const, reason: "Response generation job has no Workpool id" };
    }

    const current = await validateResponseJob(ctx.db, args, "QUEUED");
    if (current.kind === "stale") {
      await markTerminal(ctx, job, "CANCELED", current.reason);
      return { status: "CANCELED" as const, reason: current.reason };
    }

    const now = Date.now();
    await ctx.db.patch("generationJobs", job._id, {
      status: "RUNNING",
      startedAt: now,
      updatedAt: now,
    });
    return { status: "CLAIMED" as const };
  },
});

export const loadResponseContext = internalQuery({
  args: responseWorkArgsValidator,
  returns: responseContextValidator,
  handler: async (ctx, args) => {
    const current = await validateResponseJob(ctx.db, args, "RUNNING");
    if (current.kind === "stale") return current;

    const { game, player } = current.value;
    if (game.gameType === "MATCHSLOP") {
      return { kind: "stale" as const, reason: "Game type does not generate comedy responses" };
    }
    const assignments = await listPlayerAssignments(ctx.db, player._id, args.roundId);
    if (assignments.length === 0) {
      return { kind: "stale" as const, reason: "AI player has no prompt assignments" };
    }

    const prompts = [];
    for (const assignment of assignments) {
      const prompt = await ctx.db.get("prompts", assignment.promptId);
      if (!prompt || prompt.gameId !== game._id || prompt.roundId !== args.roundId) {
        return { kind: "stale" as const, reason: "Prompt assignment is no longer current" };
      }
      const existing = await ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (index) =>
          index.eq("promptId", prompt._id).eq("playerId", player._id),
        )
        .unique();
      if (!existing)
        prompts.push({ promptId: prompt._id, text: prompt.text, ordinal: prompt.ordinal });
    }

    const history =
      game.gameType === "SLOPLASH"
        ? await buildResponseHistory(ctx.db, game._id, player._id, args.roundNumber)
        : [];
    return {
      kind: "ready" as const,
      gameType: game.gameType,
      modelId: player.modelId,
      playerId: player._id,
      prompts: prompts
        .toSorted((left, right) => left.ordinal - right.ordinal)
        .map(({ promptId, text }) => ({ promptId, text })),
      history,
    };
  },
});

export const persistResponse = internalMutation({
  args: {
    ...responseWorkArgsValidator,
    promptId: v.id("prompts"),
    text: v.string(),
    failReason: v.union(v.string(), v.null()),
    usage: v.object({
      modelId: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.number(),
    }),
  },
  returns: v.union(
    v.object({ status: v.literal("INSERTED") }),
    v.object({ status: v.literal("DUPLICATE") }),
    v.object({ status: v.literal("STALE"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const current = await validateResponseJob(ctx.db, args, "RUNNING");
    if (current.kind === "stale") {
      return { status: "STALE" as const, reason: current.reason };
    }
    const { game, player } = current.value;

    const [prompt, assignment, existing] = await Promise.all([
      ctx.db.get("prompts", args.promptId),
      ctx.db
        .query("promptAssignments")
        .withIndex("by_promptId_and_playerId", (index) =>
          index.eq("promptId", args.promptId).eq("playerId", player._id),
        )
        .unique(),
      ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (index) =>
          index.eq("promptId", args.promptId).eq("playerId", player._id),
        )
        .unique(),
    ]);
    if (
      !prompt ||
      prompt.gameId !== game._id ||
      prompt.roundId !== args.roundId ||
      !assignment ||
      assignment.gameId !== game._id ||
      assignment.roundId !== args.roundId
    ) {
      return { status: "STALE" as const, reason: "Prompt assignment is no longer current" };
    }
    if (existing) return { status: "DUPLICATE" as const };
    if (
      args.usage.modelId !== player.modelId ||
      !Number.isFinite(args.usage.inputTokens) ||
      !Number.isFinite(args.usage.outputTokens) ||
      !Number.isFinite(args.usage.costUsd) ||
      args.usage.inputTokens < 0 ||
      args.usage.outputTokens < 0 ||
      args.usage.costUsd < 0
    ) {
      throw new Error("AI usage does not match the response model");
    }

    const now = Date.now();
    await ctx.db.insert("responses", {
      gameId: game._id,
      roundId: args.roundId,
      promptId: prompt._id,
      playerId: player._id,
      text: args.text,
      pointsEarned: 0,
      ...(args.failReason === null ? {} : { failReason: args.failReason }),
      submittedAt: now,
    });
    await ctx.db.patch("games", game._id, {
      aiInputTokens: game.aiInputTokens + args.usage.inputTokens,
      aiOutputTokens: game.aiOutputTokens + args.usage.outputTokens,
      aiCostUsd: game.aiCostUsd + args.usage.costUsd,
      updatedAt: now,
    });

    const modelUsage = await ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) =>
        index.eq("gameId", game._id).eq("modelId", player.modelId),
      )
      .unique();
    if (modelUsage) {
      await ctx.db.patch("gameModelUsage", modelUsage._id, {
        inputTokens: modelUsage.inputTokens + args.usage.inputTokens,
        outputTokens: modelUsage.outputTokens + args.usage.outputTokens,
        costUsd: modelUsage.costUsd + args.usage.costUsd,
      });
    } else {
      await ctx.db.insert("gameModelUsage", {
        gameId: game._id,
        modelId: player.modelId,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        costUsd: args.usage.costUsd,
      });
    }

    return { status: "INSERTED" as const };
  },
});

export const cancelResponseJob = internalMutation({
  args: { ...responseWorkArgsValidator, reason: v.string() },
  returns: v.object({ canceled: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (
      !job ||
      job.gameId !== args.gameId ||
      job.kind !== "RESPONSE" ||
      job.status !== "RUNNING" ||
      job.attempt !== args.attempt
    ) {
      return { canceled: false };
    }
    await markTerminal(ctx, job, "CANCELED", args.reason);
    return { canceled: true };
  },
});

export const finishResponseJob = internalMutation({
  args: responseWorkArgsValidator,
  returns: v.object({ status: finalStatusValidator }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.gameId !== args.gameId || job.kind !== "RESPONSE") {
      return { status: "CANCELED" as const };
    }
    if (job.status === "SUCCEEDED" || job.status === "FAILED" || job.status === "CANCELED") {
      return { status: job.status };
    }

    const current = await validateResponseJob(ctx.db, args, "RUNNING");
    if (current.kind === "stale") {
      await markTerminal(ctx, job, "CANCELED", current.reason);
      return { status: "CANCELED" as const };
    }
    const { game, player } = current.value;
    const assignments = await listPlayerAssignments(ctx.db, player._id, args.roundId);
    if (assignments.length === 0) {
      await failCurrentResponseWork(
        ctx,
        job,
        args,
        "FAILED",
        "Response job completed without assignments",
      );
      return { status: "FAILED" as const };
    }
    for (const assignment of assignments) {
      const response = await ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (index) =>
          index.eq("promptId", assignment.promptId).eq("playerId", player._id),
        )
        .unique();
      if (!response) {
        await failCurrentResponseWork(
          ctx,
          job,
          args,
          "FAILED",
          "Response job completed with missing assignments",
        );
        return { status: "FAILED" as const };
      }
    }

    const now = Date.now();
    await ctx.db.patch("generationJobs", job._id, {
      status: "SUCCEEDED",
      error: undefined,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, responseSettlementRef(game), { gameId: game._id });
    return { status: "SUCCEEDED" as const };
  },
});

export const responseWorkComplete = internalMutation({
  args: vOnCompleteArgs(responseWorkContextValidator),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const job = await ctx.db.get("generationJobs", context.jobId);
    if (
      !job ||
      job.gameId !== context.gameId ||
      job.kind !== "RESPONSE" ||
      job.workId !== workId ||
      job.attempt !== context.attempt ||
      job.status === "SUCCEEDED" ||
      job.status === "FAILED" ||
      job.status === "CANCELED"
    ) {
      return null;
    }

    if (result.kind === "failed") {
      await failCurrentResponseWork(ctx, job, context, "FAILED", result.error);
    } else if (result.kind === "canceled") {
      await failCurrentResponseWork(
        ctx,
        job,
        context,
        "CANCELED",
        "Workpool canceled response generation",
      );
    } else {
      const actionResult = result.returnValue as { status?: unknown } | null;
      if (actionResult?.status !== "SKIPPED") {
        await failCurrentResponseWork(
          ctx,
          job,
          context,
          "FAILED",
          "Response action completed without terminal state",
        );
      }
    }
    return null;
  },
});
