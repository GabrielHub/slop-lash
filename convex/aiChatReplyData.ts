import { vOnCompleteArgs } from "@convex-dev/workpool";
import { v } from "convex/values";
import { sanitize } from "../src/lib/sanitize";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
  chatReplyWorkCompleteRef,
  executeChatReplyRef,
  type ChatReplyGenerationContext,
  type ChatReplyWorkArgs,
} from "./aiChatReplyContracts";
import { aiGenerationWorkpool } from "./components";

const ALLOWED_CHAT_REPLY_STATUSES = new Set(["WRITING", "VOTING", "ROUND_RESULTS"] as const);
const CHAT_REPLY_JOB_PREFIX = "chat-reply:";
const AI_REPLY_COOLDOWN_MS = 15_000;
const MAX_AI_REPLY_RESERVATIONS_PER_GAME = 30;
const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_PLAYERS = 64;
const MAX_NAME_LENGTH = 80;
const MAX_CHAT_LENGTH = 200;
const MAX_ERROR_LENGTH = 2_000;

type ChatReplyStatus = "WRITING" | "VOTING" | "ROUND_RESULTS";

type EligibleAiPlayer = Doc<"players"> & {
  type: "AI";
  modelId: string;
};

interface CurrentChatReplyJob {
  job: Doc<"generationJobs">;
  game: Doc<"games"> & {
    gameType: "AI_CHAT_SHOWDOWN";
    status: ChatReplyStatus;
  };
  responder: EligibleAiPlayer;
  trigger: Doc<"chatMessages">;
}

type CurrentChatReplyJobResult =
  | { kind: "current"; value: CurrentChatReplyJob }
  | { kind: "stale"; job: Doc<"generationJobs">; reason: string }
  | { kind: "ignored"; reason: string };

const workArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  triggerMessageId: v.id("chatMessages"),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

const workContextValidator = v.object(workArgsValidator);

const generationContextValidator = v.object({
  modelId: v.string(),
  responderId: v.id("players"),
  responderName: v.string(),
  gameStatus: v.union(v.literal("WRITING"), v.literal("VOTING"), v.literal("ROUND_RESULTS")),
  currentRound: v.number(),
  totalRounds: v.number(),
  scoreboard: v.array(
    v.object({
      name: v.string(),
      score: v.number(),
      type: v.union(v.literal("HUMAN"), v.literal("AI")),
    }),
  ),
  messages: v.array(
    v.object({
      authorName: v.string(),
      content: v.string(),
    }),
  ),
  triggerContent: v.string(),
});

function expectedGenerationKey(triggerMessageId: Id<"chatMessages">): string {
  return `${CHAT_REPLY_JOB_PREFIX}${triggerMessageId}`;
}

function boundedError(error: string): string {
  return error.trim().slice(0, MAX_ERROR_LENGTH) || "Unknown chat reply failure";
}

function isChatReplyStatus(status: Doc<"games">["status"]): status is ChatReplyStatus {
  return ALLOWED_CHAT_REPLY_STATUSES.has(status as ChatReplyStatus);
}

function isEligibleAiPlayer(player: Doc<"players">): player is EligibleAiPlayer {
  return (
    player.type === "AI" &&
    player.participationStatus === "ACTIVE" &&
    typeof player.modelId === "string" &&
    player.modelId.length > 0
  );
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function listMentionedResponders(content: string, players: Doc<"players">[]): EligibleAiPlayer[] {
  const activeAiPlayers = players.filter(isEligibleAiPlayer);
  const normalizedContent = content.toLowerCase();
  return activeAiPlayers
    .map((player) => ({
      player,
      mentionIndex: normalizedContent.indexOf(player.name.toLowerCase()),
    }))
    .filter((candidate) => candidate.mentionIndex >= 0)
    .toSorted(
      (left, right) =>
        left.mentionIndex - right.mentionIndex ||
        left.player.joinedAt - right.player.joinedAt ||
        compareIds(left.player._id, right.player._id),
    )
    .map((candidate) => candidate.player);
}

async function validateCurrentJob(
  db: DatabaseReader,
  args: ChatReplyWorkArgs,
  expectedStatus: "QUEUED" | "RUNNING",
): Promise<CurrentChatReplyJobResult> {
  const job = await db.get("generationJobs", args.jobId);
  if (!job) return { kind: "ignored", reason: "Chat reply job no longer exists" };
  if (
    job.gameId !== args.gameId ||
    job.kind !== "CHAT_REPLY" ||
    job.targetId !== args.triggerMessageId
  ) {
    return { kind: "ignored", reason: "Chat reply work does not match the requested room" };
  }
  if (job.status !== expectedStatus || job.attempt !== args.attempt) {
    return { kind: "ignored", reason: "Chat reply attempt is no longer current" };
  }
  if (!job.responderId || job.reservedUntil === undefined) {
    return { kind: "stale", job, reason: "Chat reply reservation is missing" };
  }
  if (!job.workId) {
    return { kind: "stale", job, reason: "Chat reply job has no Workpool id" };
  }

  const generationKey = expectedGenerationKey(args.triggerMessageId);
  if (job.generationKey !== generationKey) {
    return { kind: "stale", job, reason: "Chat reply generation key is invalid" };
  }
  const jobsWithKey = await db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", args.gameId).eq("generationKey", generationKey),
    )
    .take(2);
  if (jobsWithKey.length !== 1 || jobsWithKey[0]?._id !== job._id) {
    return { kind: "stale", job, reason: "Duplicate chat reply work was rejected" };
  }

  const [game, trigger] = await Promise.all([
    db.get("games", args.gameId),
    db.get("chatMessages", args.triggerMessageId),
  ]);
  if (!game || !trigger) {
    return { kind: "stale", job, reason: "Chat reply context no longer exists" };
  }
  if (game.gameType !== "AI_CHAT_SHOWDOWN") {
    return { kind: "stale", job, reason: "Chat replies are unavailable for this game type" };
  }
  if (!isChatReplyStatus(game.status)) {
    return { kind: "stale", job, reason: "Chat reply phase is closed" };
  }
  if (game.phaseGeneration !== args.phaseGeneration) {
    return { kind: "stale", job, reason: "Chat reply phase is no longer current" };
  }
  if (trigger.gameId !== game._id || trigger.replyToId !== undefined) {
    return { kind: "stale", job, reason: "Chat reply target is invalid" };
  }

  const [triggerAuthor, responder] = await Promise.all([
    db.get("players", trigger.playerId),
    db.get("players", job.responderId),
  ]);
  if (!triggerAuthor || triggerAuthor.gameId !== game._id || triggerAuthor.type !== "HUMAN") {
    return { kind: "stale", job, reason: "Chat reply target was not sent by a human player" };
  }
  if (!responder || responder.gameId !== game._id || !isEligibleAiPlayer(responder)) {
    return { kind: "stale", job, reason: "Reserved AI responder is no longer active" };
  }

  return {
    kind: "current",
    value: {
      job,
      game: { ...game, gameType: "AI_CHAT_SHOWDOWN", status: game.status },
      responder,
      trigger,
    },
  };
}

async function loadContextPlayers(
  db: DatabaseReader,
  gameId: Id<"games">,
): Promise<Doc<"players">[] | null> {
  const players = await db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_CONTEXT_PLAYERS + 1);
  return players.length > MAX_CONTEXT_PLAYERS ? null : players;
}

async function selectReservableResponder(
  ctx: MutationCtx,
  gameId: Id<"games">,
  content: string,
  now: number,
): Promise<EligibleAiPlayer | null> {
  const players = await loadContextPlayers(ctx.db, gameId);
  if (!players) return null;

  const mentioned = listMentionedResponders(content, players);
  if (mentioned.length === 0) return null;

  const existingReservations = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_kind_and_status", (index) =>
      index.eq("gameId", gameId).eq("kind", "CHAT_REPLY"),
    )
    .take(MAX_AI_REPLY_RESERVATIONS_PER_GAME);
  if (existingReservations.length >= MAX_AI_REPLY_RESERVATIONS_PER_GAME) return null;

  for (const responder of mentioned) {
    const latestReservation = await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_kind_and_responderId_and_createdAt", (index) =>
        index.eq("gameId", gameId).eq("kind", "CHAT_REPLY").eq("responderId", responder._id),
      )
      .order("desc")
      .first();
    const reservedUntil = latestReservation?.reservedUntil ?? 0;
    if (reservedUntil <= now) return responder;
  }

  return null;
}

async function markTerminal(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  status: "FAILED" | "CANCELED",
  reason: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("generationJobs", job._id, {
    status,
    error: boundedError(reason),
    completedAt: now,
    updatedAt: now,
  });
}

export async function tryEnqueueChatReplyJob(
  ctx: MutationCtx,
  args: {
    game: Doc<"games">;
    triggerMessageId: Id<"chatMessages">;
    triggerContent: string;
    now: number;
  },
): Promise<string | null> {
  if (args.game.gameType !== "AI_CHAT_SHOWDOWN" || !isChatReplyStatus(args.game.status)) {
    return null;
  }
  const responder = await selectReservableResponder(
    ctx,
    args.game._id,
    args.triggerContent,
    args.now,
  );
  if (!responder) return null;

  const jobId = await ctx.db.insert("generationJobs", {
    gameId: args.game._id,
    kind: "CHAT_REPLY",
    generationKey: expectedGenerationKey(args.triggerMessageId),
    targetId: args.triggerMessageId,
    responderId: responder._id,
    reservedUntil: args.now + AI_REPLY_COOLDOWN_MS,
    status: "QUEUED",
    attempt: 0,
    createdAt: args.now,
    updatedAt: args.now,
  });
  return enqueueChatReplyJob(ctx, {
    jobId,
    gameId: args.game._id,
    triggerMessageId: args.triggerMessageId,
    phaseGeneration: args.game.phaseGeneration,
  });
}

async function enqueueChatReplyJob(
  ctx: MutationCtx,
  args: {
    jobId: Id<"generationJobs">;
    gameId: Id<"games">;
    triggerMessageId: Id<"chatMessages">;
    phaseGeneration: number;
  },
): Promise<string> {
  const job = await ctx.db.get("generationJobs", args.jobId);
  const generationKey = expectedGenerationKey(args.triggerMessageId);
  if (
    !job ||
    job.gameId !== args.gameId ||
    job.kind !== "CHAT_REPLY" ||
    job.targetId !== args.triggerMessageId ||
    job.responderId === undefined ||
    job.reservedUntil === undefined ||
    job.generationKey !== generationKey ||
    job.status !== "QUEUED" ||
    job.attempt !== 0 ||
    job.workId !== undefined
  ) {
    throw new Error("New chat reply job is not eligible for Workpool handoff");
  }
  const jobsWithKey = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", args.gameId).eq("generationKey", generationKey),
    )
    .take(2);
  if (jobsWithKey.length !== 1 || jobsWithKey[0]?._id !== job._id) {
    throw new Error("Duplicate chat reply job cannot be handed to Workpool");
  }

  const workArgs: ChatReplyWorkArgs = {
    ...args,
    attempt: 1,
  };
  const workId = await aiGenerationWorkpool.enqueueAction(ctx, executeChatReplyRef, workArgs, {
    retry: false,
    onComplete: chatReplyWorkCompleteRef,
    context: workArgs,
  });
  await ctx.db.patch("generationJobs", job._id, {
    attempt: workArgs.attempt,
    error: undefined,
    workId,
    updatedAt: Date.now(),
  });
  return workId;
}

export const claimChatReplyJob = internalMutation({
  args: workArgsValidator,
  returns: v.union(
    v.object({ status: v.literal("CLAIMED"), context: generationContextValidator }),
    v.object({ status: v.literal("CANCELED"), reason: v.string() }),
    v.object({ status: v.literal("IGNORED"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const current = await validateCurrentJob(ctx.db, args, "QUEUED");
    if (current.kind === "ignored") {
      return { status: "IGNORED" as const, reason: current.reason };
    }
    if (current.kind === "stale") {
      await markTerminal(ctx, current.job, "CANCELED", current.reason);
      return { status: "CANCELED" as const, reason: current.reason };
    }

    const { game, job, responder, trigger } = current.value;
    const now = Date.now();
    const players = await loadContextPlayers(ctx.db, game._id);
    if (!players) {
      const reason = "Room exceeds the AI chat context limit";
      await markTerminal(ctx, job, "CANCELED", reason);
      return { status: "CANCELED" as const, reason };
    }

    const recentMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", game._id))
      .order("desc")
      .take(MAX_CONTEXT_MESSAGES);
    const playerNames = new Map(
      players.map((player) => [player._id, player.name.slice(0, MAX_NAME_LENGTH)]),
    );
    const context: ChatReplyGenerationContext = {
      modelId: responder.modelId,
      responderId: responder._id,
      responderName: responder.name.slice(0, MAX_NAME_LENGTH),
      gameStatus: game.status,
      currentRound: game.currentRound,
      totalRounds: game.totalRounds,
      scoreboard: players
        .filter(
          (player): player is Doc<"players"> & { type: "HUMAN" | "AI" } =>
            player.type !== "SPECTATOR" && player.participationStatus === "ACTIVE",
        )
        .toSorted(
          (left, right) =>
            right.score - left.score ||
            left.joinedAt - right.joinedAt ||
            compareIds(left._id, right._id),
        )
        .map((player) => ({
          name: player.name.slice(0, MAX_NAME_LENGTH),
          score: player.score,
          type: player.type,
        })),
      messages: recentMessages.toReversed().map((message) => ({
        authorName: playerNames.get(message.playerId) ?? "Contestant",
        content: message.content.slice(0, MAX_CHAT_LENGTH),
      })),
      triggerContent: trigger.content.slice(0, MAX_CHAT_LENGTH),
    };

    await ctx.db.patch("generationJobs", job._id, {
      status: "RUNNING",
      error: undefined,
      startedAt: now,
      updatedAt: now,
    });
    return { status: "CLAIMED" as const, context };
  },
});

export const persistChatReply = internalMutation({
  args: {
    ...workArgsValidator,
    responderId: v.id("players"),
    text: v.string(),
    usage: v.object({
      modelId: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.number(),
    }),
  },
  returns: v.union(
    v.object({ status: v.literal("SUCCEEDED"), messageId: v.id("chatMessages") }),
    v.object({ status: v.literal("FAILED"), reason: v.string() }),
    v.object({ status: v.literal("CANCELED"), reason: v.string() }),
    v.object({ status: v.literal("IGNORED"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const current = await validateCurrentJob(ctx.db, args, "RUNNING");
    if (current.kind === "ignored") {
      return { status: "IGNORED" as const, reason: current.reason };
    }
    if (current.kind === "stale") {
      await markTerminal(ctx, current.job, "CANCELED", current.reason);
      return { status: "CANCELED" as const, reason: current.reason };
    }

    const { game, job, responder, trigger } = current.value;
    const now = Date.now();
    if (responder._id !== args.responderId) {
      const reason = "Selected AI responder does not match the reservation";
      await markTerminal(ctx, job, "CANCELED", reason);
      return { status: "CANCELED" as const, reason };
    }

    const usageIsValid =
      args.usage.modelId === responder.modelId &&
      Number.isFinite(args.usage.inputTokens) &&
      Number.isFinite(args.usage.outputTokens) &&
      Number.isFinite(args.usage.costUsd) &&
      args.usage.inputTokens >= 0 &&
      args.usage.outputTokens >= 0 &&
      args.usage.costUsd >= 0;
    if (!usageIsValid) {
      const reason = "AI usage does not match the chat reply model";
      await markTerminal(ctx, job, "FAILED", reason);
      return { status: "FAILED" as const, reason };
    }

    const content = sanitize(args.text, MAX_CHAT_LENGTH);
    if (!content) {
      const reason = "AI chat reply was empty";
      await markTerminal(ctx, job, "FAILED", reason);
      return { status: "FAILED" as const, reason };
    }

    const modelUsage = await ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) =>
        index.eq("gameId", game._id).eq("modelId", responder.modelId),
      )
      .unique();
    const messageId = await ctx.db.insert("chatMessages", {
      gameId: game._id,
      playerId: responder._id,
      ...(game.currentRound > 0 ? { roundNumber: game.currentRound } : {}),
      content,
      replyToId: trigger._id,
      createdAt: now,
    });
    await ctx.db.patch("games", game._id, {
      aiInputTokens: game.aiInputTokens + args.usage.inputTokens,
      aiOutputTokens: game.aiOutputTokens + args.usage.outputTokens,
      aiCostUsd: game.aiCostUsd + args.usage.costUsd,
      updatedAt: now,
    });
    if (modelUsage) {
      await ctx.db.patch("gameModelUsage", modelUsage._id, {
        inputTokens: modelUsage.inputTokens + args.usage.inputTokens,
        outputTokens: modelUsage.outputTokens + args.usage.outputTokens,
        costUsd: modelUsage.costUsd + args.usage.costUsd,
      });
    } else {
      await ctx.db.insert("gameModelUsage", {
        gameId: game._id,
        modelId: responder.modelId,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        costUsd: args.usage.costUsd,
      });
    }
    await ctx.db.patch("generationJobs", job._id, {
      status: "SUCCEEDED",
      error: undefined,
      completedAt: now,
      updatedAt: now,
    });

    return { status: "SUCCEEDED" as const, messageId };
  },
});

export const chatReplyWorkComplete = internalMutation({
  args: vOnCompleteArgs(workContextValidator),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const job = await ctx.db.get("generationJobs", context.jobId);
    if (
      !job ||
      job.gameId !== context.gameId ||
      job.kind !== "CHAT_REPLY" ||
      job.targetId !== context.triggerMessageId ||
      job.workId !== workId ||
      job.attempt !== context.attempt ||
      job.status === "SUCCEEDED" ||
      job.status === "FAILED" ||
      job.status === "CANCELED"
    ) {
      return null;
    }

    if (result.kind === "failed") {
      await markTerminal(ctx, job, "FAILED", result.error);
    } else if (result.kind === "canceled") {
      await markTerminal(ctx, job, "CANCELED", "Workpool canceled AI chat reply generation");
    } else {
      const actionResult = result.returnValue as { status?: unknown } | null;
      await markTerminal(
        ctx,
        job,
        "FAILED",
        `Chat reply action completed without terminal state (${String(actionResult?.status)})`,
      );
    }
    return null;
  },
});
