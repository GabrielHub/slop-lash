import { vOnCompleteArgs } from "@convex-dev/workpool";
import { v } from "convex/values";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  enqueueQueuedVoteJobsRef,
  generateVoteRef,
  settleChatslopVoteQuorumRef,
  settleSloplashVoteQuorumRef,
  voteWorkCompleteRef,
  type VoteWorkArgs,
} from "./aiVotingContracts";
import { aiGenerationWorkpool } from "./components";

const MAX_VOTE_JOBS = 32;
const MAX_ROUND_PROMPTS = 32;
const MAX_ROUND_RESPONSES = 256;
const MAX_ERROR_LENGTH = 2_000;

const voteWorkArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  roundId: v.id("rounds"),
  promptId: v.id("prompts"),
  roundNumber: v.number(),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

const voteWorkContextValidator = v.object(voteWorkArgsValidator);

const reactionEmojiValidator = v.union(
  v.literal("laugh"),
  v.literal("fire"),
  v.literal("skull"),
  v.literal("clap"),
  v.literal("puke"),
  v.literal("sleep"),
  v.literal("eyes"),
  v.literal("hundred"),
  v.literal("target"),
  v.literal("clown"),
);

const finalStatusValidator = v.union(
  v.literal("SUCCEEDED"),
  v.literal("FAILED"),
  v.literal("CANCELED"),
);

const voteContextValidator = v.union(
  v.object({
    kind: v.literal("ready"),
    gameType: v.union(v.literal("SLOPLASH"), v.literal("AI_CHAT_SHOWDOWN")),
    modelId: v.string(),
    playerId: v.id("players"),
    promptText: v.string(),
    candidates: v.array(
      v.object({
        responseId: v.id("responses"),
        text: v.string(),
      }),
    ),
    alreadyVoted: v.boolean(),
  }),
  v.object({
    kind: v.literal("stale"),
    reason: v.string(),
  }),
);

type VotingGame = Doc<"games"> & {
  gameType: "SLOPLASH" | "AI_CHAT_SHOWDOWN";
};

interface VotingBundle {
  prompts: Doc<"prompts">[];
  responses: Doc<"responses">[];
  currentPrompt: Doc<"prompts"> | null;
  votingPrompts: Doc<"prompts">[];
}

interface CurrentVoteJob {
  job: Doc<"generationJobs">;
  game: VotingGame;
  round: Doc<"rounds">;
  prompt: Doc<"prompts">;
  player: Doc<"players"> & { modelId: string };
  candidates: Doc<"responses">[];
}

type CurrentVoteJobResult =
  | { kind: "current"; value: CurrentVoteJob }
  | { kind: "stale"; reason: string };

function errorMessage(error: string): string {
  return error.trim().slice(0, MAX_ERROR_LENGTH) || "Unknown AI vote failure";
}

function expectedGenerationKey(
  roundNumber: number,
  promptId: Id<"prompts">,
  playerId: Id<"players">,
): string {
  return `vote:${roundNumber}:${promptId}:${playerId}`;
}

function responsesForPrompt(
  responses: Doc<"responses">[],
  promptId: Id<"prompts">,
): Doc<"responses">[] {
  return responses
    .filter((response) => response.promptId === promptId)
    .toSorted((left, right) => left._id.localeCompare(right._id));
}

function isSloplashVotable(responses: Doc<"responses">[], promptId: Id<"prompts">): boolean {
  const promptResponses = responsesForPrompt(responses, promptId);
  return (
    promptResponses.length >= 2 &&
    !promptResponses.some((response) => response.text === FORFEIT_MARKER)
  );
}

function isChatslopVotable(responses: Doc<"responses">[], promptId: Id<"prompts">): boolean {
  const promptResponses = responsesForPrompt(responses, promptId);
  return (
    promptResponses.length >= 2 &&
    promptResponses.some((response) => response.text !== FORFEIT_MARKER)
  );
}

async function loadVotingBundle(
  db: DatabaseReader,
  game: VotingGame,
  round: Doc<"rounds">,
): Promise<VotingBundle> {
  const [prompts, responses] = await Promise.all([
    db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_ROUND_PROMPTS),
    db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_ROUND_RESPONSES),
  ]);

  if (game.gameType === "SLOPLASH") {
    const votingPrompts = prompts
      .filter((prompt) => isSloplashVotable(responses, prompt._id))
      .toSorted((left, right) => left._id.localeCompare(right._id));
    return {
      prompts,
      responses,
      currentPrompt: votingPrompts[game.votingPromptIndex] ?? null,
      votingPrompts,
    };
  }

  const prompt = prompts.find((candidate) => candidate.ordinal === 0) ?? null;
  const votingPrompts = prompt && isChatslopVotable(responses, prompt._id) ? [prompt] : [];
  return {
    prompts,
    responses,
    currentPrompt: votingPrompts[0] ?? null,
    votingPrompts,
  };
}

function getCandidates(
  gameType: VotingGame["gameType"],
  bundle: VotingBundle,
  promptId: Id<"prompts">,
  voterId: Id<"players">,
): Doc<"responses">[] {
  const promptResponses = responsesForPrompt(bundle.responses, promptId);
  if (gameType === "SLOPLASH") {
    if (
      promptResponses.length !== 2 ||
      promptResponses.some(
        (response) => response.text === FORFEIT_MARKER || response.playerId === voterId,
      )
    ) {
      return [];
    }
    return promptResponses;
  }

  if (!isChatslopVotable(bundle.responses, promptId)) return [];
  return promptResponses.filter(
    (response) => response.text !== FORFEIT_MARKER && response.playerId !== voterId,
  );
}

async function validateVoteJob(
  db: DatabaseReader,
  args: VoteWorkArgs,
  expectedStatus: "QUEUED" | "RUNNING",
): Promise<CurrentVoteJobResult> {
  const job = await db.get("generationJobs", args.jobId);
  if (!job) return { kind: "stale", reason: "AI vote job no longer exists" };
  if (job.gameId !== args.gameId || job.kind !== "VOTE") {
    return { kind: "stale", reason: "AI vote job identity changed" };
  }
  if (job.status !== expectedStatus || job.attempt !== args.attempt) {
    return { kind: "stale", reason: "AI vote attempt is no longer current" };
  }

  const playerId = db.normalizeId("players", job.targetId ?? "");
  if (
    !playerId ||
    job.generationKey !== expectedGenerationKey(args.roundNumber, args.promptId, playerId)
  ) {
    return { kind: "stale", reason: "AI vote generation key is invalid" };
  }

  const [gameDoc, round, prompt, player] = await Promise.all([
    db.get("games", args.gameId),
    db.get("rounds", args.roundId),
    db.get("prompts", args.promptId),
    db.get("players", playerId),
  ]);
  if (!gameDoc || !round || !prompt || !player) {
    return { kind: "stale", reason: "AI vote context no longer exists" };
  }
  if (gameDoc.gameType !== "SLOPLASH" && gameDoc.gameType !== "AI_CHAT_SHOWDOWN") {
    return { kind: "stale", reason: "Game type does not generate comedy votes" };
  }
  const game: VotingGame = { ...gameDoc, gameType: gameDoc.gameType };
  if (
    game.status !== "VOTING" ||
    game.votingRevealing ||
    game.currentRound !== args.roundNumber ||
    game.phaseGeneration !== args.phaseGeneration
  ) {
    return { kind: "stale", reason: "Voting phase is no longer current" };
  }
  if (
    round.gameId !== game._id ||
    round.roundNumber !== args.roundNumber ||
    prompt.gameId !== game._id ||
    prompt.roundId !== round._id
  ) {
    return { kind: "stale", reason: "Voting prompt is no longer current" };
  }
  if (
    player.gameId !== game._id ||
    player.type !== "AI" ||
    player.participationStatus !== "ACTIVE" ||
    !player.modelId
  ) {
    return { kind: "stale", reason: "AI voter is no longer active" };
  }

  const bundle = await loadVotingBundle(db, game, round);
  if (bundle.currentPrompt?._id !== prompt._id) {
    return { kind: "stale", reason: "Voting prompt is not currently visible" };
  }
  if (game.gameType === "AI_CHAT_SHOWDOWN") {
    const assignment = await db
      .query("promptAssignments")
      .withIndex("by_promptId_and_playerId", (index) =>
        index.eq("promptId", prompt._id).eq("playerId", player._id),
      )
      .unique();
    if (!assignment || assignment.gameId !== game._id || assignment.roundId !== round._id) {
      return { kind: "stale", reason: "AI voter is not assigned to this ChatSlop prompt" };
    }
  }

  const candidates = getCandidates(game.gameType, bundle, prompt._id, player._id);
  if (
    (game.gameType === "SLOPLASH" && candidates.length !== 2) ||
    (game.gameType === "AI_CHAT_SHOWDOWN" && candidates.length === 0)
  ) {
    return { kind: "stale", reason: "Voting prompt has no eligible peer responses" };
  }

  return {
    kind: "current",
    value: {
      job,
      game,
      round,
      prompt,
      player: { ...player, modelId: player.modelId },
      candidates,
    },
  };
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

async function markSucceededAndSettle(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  game: VotingGame,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("generationJobs", job._id, {
    status: "SUCCEEDED",
    error: undefined,
    completedAt: now,
    updatedAt: now,
  });
  const settleQuorumRef =
    game.gameType === "SLOPLASH" ? settleSloplashVoteQuorumRef : settleChatslopVoteQuorumRef;
  await ctx.scheduler.runAfter(0, settleQuorumRef, { gameId: game._id });
}

async function failCurrentVoteWork(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  args: VoteWorkArgs,
  status: "FAILED" | "CANCELED",
  reason: string,
): Promise<void> {
  const current = await validateVoteJob(
    ctx.db,
    args,
    job.status === "QUEUED" ? "QUEUED" : "RUNNING",
  );
  if (current.kind === "stale") {
    await markTerminal(ctx, job, status, reason);
    return;
  }

  const { game, player, prompt, round } = current.value;
  const existing = await ctx.db
    .query("votes")
    .withIndex("by_promptId_and_voterId", (index) =>
      index.eq("promptId", prompt._id).eq("voterId", player._id),
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("votes", {
      gameId: game._id,
      roundId: round._id,
      promptId: prompt._id,
      voterId: player._id,
      failReason: errorMessage(reason),
      castAt: Date.now(),
    });
  }

  await markTerminal(ctx, job, status, reason);
  const settleQuorumRef =
    game.gameType === "SLOPLASH" ? settleSloplashVoteQuorumRef : settleChatslopVoteQuorumRef;
  await ctx.scheduler.runAfter(0, settleQuorumRef, { gameId: game._id });
}

export const enqueueQueuedVoteJobs = internalMutation({
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
        index.eq("gameId", args.gameId).eq("kind", "VOTE").eq("status", "QUEUED"),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: MAX_VOTE_JOBS });
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, enqueueQueuedVoteJobsRef, {
        gameId: args.gameId,
        cursor: page.continueCursor,
      });
    }
    const jobs = page.page;
    const result = { enqueued: 0, skipped: 0, failed: 0, canceled: 0 };
    if (jobs.length === 0) return result;

    const gameDoc = await ctx.db.get("games", args.gameId);
    if (
      !gameDoc ||
      (gameDoc.gameType !== "SLOPLASH" && gameDoc.gameType !== "AI_CHAT_SHOWDOWN") ||
      gameDoc.status !== "VOTING"
    ) {
      for (const job of jobs) {
        await markTerminal(ctx, job, "CANCELED", "Voting phase is no longer current");
        result.canceled += 1;
      }
      return result;
    }
    const game: VotingGame = { ...gameDoc, gameType: gameDoc.gameType };
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) =>
        index.eq("gameId", game._id).eq("roundNumber", game.currentRound),
      )
      .unique();
    if (!round) {
      for (const job of jobs) {
        await markTerminal(ctx, job, "FAILED", "Current voting round does not exist");
        result.failed += 1;
      }
      return result;
    }

    const bundle = await loadVotingBundle(ctx.db, game, round);
    if (!bundle.currentPrompt) {
      for (const job of jobs) {
        await markTerminal(ctx, job, "CANCELED", "Voting prompt is no longer current");
        result.canceled += 1;
      }
      return result;
    }

    for (const job of jobs) {
      if (job.workId) {
        result.skipped += 1;
        continue;
      }

      const playerId = ctx.db.normalizeId("players", job.targetId ?? "");
      const prompt = playerId
        ? bundle.prompts.find(
            (candidate) =>
              job.generationKey ===
              expectedGenerationKey(round.roundNumber, candidate._id, playerId),
          )
        : null;
      if (!playerId || !prompt) {
        await markTerminal(ctx, job, "FAILED", "AI vote job has an invalid generation key");
        result.failed += 1;
        continue;
      }

      if (game.gameType === "SLOPLASH") {
        const promptIndex = bundle.votingPrompts.findIndex(
          (candidate) => candidate._id === prompt._id,
        );
        if (promptIndex < 0 || promptIndex < game.votingPromptIndex) {
          await markTerminal(ctx, job, "CANCELED", "Voting prompt is no longer current");
          result.canceled += 1;
          continue;
        }
        if (promptIndex > game.votingPromptIndex) {
          result.skipped += 1;
          continue;
        }
        if (game.votingRevealing) {
          await markTerminal(ctx, job, "CANCELED", "Voting prompt is no longer current");
          result.canceled += 1;
          continue;
        }
      } else if (prompt._id !== bundle.currentPrompt._id || game.votingRevealing) {
        await markTerminal(ctx, job, "CANCELED", "Voting prompt is no longer current");
        result.canceled += 1;
        continue;
      }

      const validationArgs: VoteWorkArgs = {
        jobId: job._id,
        gameId: game._id,
        roundId: round._id,
        promptId: prompt._id,
        roundNumber: round.roundNumber,
        phaseGeneration: game.phaseGeneration,
        attempt: job.attempt,
      };
      const current = await validateVoteJob(ctx.db, validationArgs, "QUEUED");
      if (current.kind === "stale") {
        await markTerminal(ctx, job, "FAILED", current.reason);
        result.failed += 1;
        continue;
      }

      const workArgs: VoteWorkArgs = {
        ...validationArgs,
        attempt: job.attempt + 1,
      };
      const workId = await aiGenerationWorkpool.enqueueAction(ctx, generateVoteRef, workArgs, {
        retry: false,
        onComplete: voteWorkCompleteRef,
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

export const claimVoteJob = internalMutation({
  args: voteWorkArgsValidator,
  returns: v.union(
    v.object({ status: v.literal("CLAIMED") }),
    v.object({ status: v.literal("CANCELED"), reason: v.string() }),
    v.object({ status: v.literal("IGNORED"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.gameId !== args.gameId || job.kind !== "VOTE") {
      return { status: "IGNORED" as const, reason: "AI vote job no longer exists" };
    }
    if (job.status !== "QUEUED" || job.attempt !== args.attempt) {
      return { status: "IGNORED" as const, reason: "AI vote job was already claimed" };
    }
    if (!job.workId) {
      await markTerminal(ctx, job, "FAILED", "AI vote job has no Workpool id");
      return { status: "IGNORED" as const, reason: "AI vote job has no Workpool id" };
    }

    const current = await validateVoteJob(ctx.db, args, "QUEUED");
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

export const loadVoteContext = internalQuery({
  args: voteWorkArgsValidator,
  returns: voteContextValidator,
  handler: async (ctx, args) => {
    const current = await validateVoteJob(ctx.db, args, "RUNNING");
    if (current.kind === "stale") return current;
    const { game, player, prompt, candidates } = current.value;
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_promptId_and_voterId", (index) =>
        index.eq("promptId", prompt._id).eq("voterId", player._id),
      )
      .unique();
    return {
      kind: "ready" as const,
      gameType: game.gameType,
      modelId: player.modelId,
      playerId: player._id,
      promptText: prompt.text,
      candidates: candidates.map((response) => ({
        responseId: response._id,
        text: response.text,
      })),
      alreadyVoted: existing !== null,
    };
  },
});

export const persistVote = internalMutation({
  args: {
    ...voteWorkArgsValidator,
    responseId: v.union(v.id("responses"), v.null()),
    failReason: v.union(v.string(), v.null()),
    reactions: v.array(
      v.object({
        responseId: v.id("responses"),
        emoji: reactionEmojiValidator,
      }),
    ),
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
    const current = await validateVoteJob(ctx.db, args, "RUNNING");
    if (current.kind === "stale") {
      return { status: "STALE" as const, reason: current.reason };
    }
    const { game, player, prompt, round, candidates } = current.value;
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_promptId_and_voterId", (index) =>
        index.eq("promptId", prompt._id).eq("voterId", player._id),
      )
      .unique();
    if (existing) return { status: "DUPLICATE" as const };

    const candidateIds = new Set(candidates.map((candidate) => candidate._id));
    if (args.responseId !== null && !candidateIds.has(args.responseId)) {
      return { status: "STALE" as const, reason: "Selected response is not an eligible peer" };
    }
    if (game.gameType === "AI_CHAT_SHOWDOWN" && args.reactions.length > 0) {
      throw new Error("ChatSlop votes cannot create response reactions");
    }
    if (
      args.usage.modelId !== player.modelId ||
      !Number.isFinite(args.usage.inputTokens) ||
      !Number.isFinite(args.usage.outputTokens) ||
      !Number.isFinite(args.usage.costUsd) ||
      args.usage.inputTokens < 0 ||
      args.usage.outputTokens < 0 ||
      args.usage.costUsd < 0
    ) {
      throw new Error("AI usage does not match the voting model");
    }

    const now = Date.now();
    await ctx.db.insert("votes", {
      gameId: game._id,
      roundId: round._id,
      promptId: prompt._id,
      voterId: player._id,
      ...(args.responseId === null ? {} : { responseId: args.responseId }),
      ...(args.failReason === null ? {} : { failReason: args.failReason }),
      castAt: now,
    });

    const reactionKeys = new Set<string>();
    for (const reaction of args.reactions) {
      if (!candidateIds.has(reaction.responseId)) {
        throw new Error("AI reaction response is not an eligible peer");
      }
      const key = `${reaction.responseId}:${reaction.emoji}`;
      if (reactionKeys.has(key)) continue;
      reactionKeys.add(key);
      const existingReaction = await ctx.db
        .query("reactions")
        .withIndex("by_responseId_and_playerId_and_emoji", (index) =>
          index
            .eq("responseId", reaction.responseId)
            .eq("playerId", player._id)
            .eq("emoji", reaction.emoji),
        )
        .unique();
      if (!existingReaction) {
        await ctx.db.insert("reactions", {
          gameId: game._id,
          roundId: round._id,
          responseId: reaction.responseId,
          playerId: player._id,
          emoji: reaction.emoji,
          createdAt: now,
        });
      }
    }

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

export const cancelVoteJob = internalMutation({
  args: { ...voteWorkArgsValidator, reason: v.string() },
  returns: v.object({ canceled: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (
      !job ||
      job.gameId !== args.gameId ||
      job.kind !== "VOTE" ||
      job.status !== "RUNNING" ||
      job.attempt !== args.attempt
    ) {
      return { canceled: false };
    }
    await markTerminal(ctx, job, "CANCELED", args.reason);
    return { canceled: true };
  },
});

export const finishVoteJob = internalMutation({
  args: voteWorkArgsValidator,
  returns: v.object({ status: finalStatusValidator }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.gameId !== args.gameId || job.kind !== "VOTE") {
      return { status: "CANCELED" as const };
    }
    if (job.status === "SUCCEEDED" || job.status === "FAILED" || job.status === "CANCELED") {
      return { status: job.status };
    }

    const playerId = ctx.db.normalizeId("players", job.targetId ?? "");
    const gameDoc = await ctx.db.get("games", args.gameId);
    if (
      !playerId ||
      job.attempt !== args.attempt ||
      job.generationKey !== expectedGenerationKey(args.roundNumber, args.promptId, playerId) ||
      !gameDoc ||
      (gameDoc.gameType !== "SLOPLASH" && gameDoc.gameType !== "AI_CHAT_SHOWDOWN")
    ) {
      await markTerminal(ctx, job, "CANCELED", "AI vote attempt is no longer current");
      return { status: "CANCELED" as const };
    }

    const existingVote = await ctx.db
      .query("votes")
      .withIndex("by_promptId_and_voterId", (index) =>
        index.eq("promptId", args.promptId).eq("voterId", playerId),
      )
      .unique();
    const game: VotingGame = { ...gameDoc, gameType: gameDoc.gameType };
    if (
      existingVote &&
      existingVote.gameId === args.gameId &&
      existingVote.roundId === args.roundId
    ) {
      await markSucceededAndSettle(ctx, job, game);
      return { status: "SUCCEEDED" as const };
    }

    const current = await validateVoteJob(ctx.db, args, "RUNNING");
    if (current.kind === "stale") {
      await markTerminal(ctx, job, "CANCELED", current.reason);
      return { status: "CANCELED" as const };
    }
    await failCurrentVoteWork(ctx, job, args, "FAILED", "AI vote job completed without a vote");
    return { status: "FAILED" as const };
  },
});

export const voteWorkComplete = internalMutation({
  args: vOnCompleteArgs(voteWorkContextValidator),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const job = await ctx.db.get("generationJobs", context.jobId);
    if (
      !job ||
      job.gameId !== context.gameId ||
      job.kind !== "VOTE" ||
      job.workId !== workId ||
      job.attempt !== context.attempt ||
      job.status === "SUCCEEDED" ||
      job.status === "FAILED" ||
      job.status === "CANCELED"
    ) {
      return null;
    }

    if (result.kind === "failed") {
      await failCurrentVoteWork(ctx, job, context, "FAILED", result.error);
    } else if (result.kind === "canceled") {
      await failCurrentVoteWork(
        ctx,
        job,
        context,
        "CANCELED",
        "Workpool canceled AI vote generation",
      );
    } else {
      const actionResult = result.returnValue as { status?: unknown } | null;
      if (actionResult?.status !== "SKIPPED") {
        await failCurrentVoteWork(
          ctx,
          job,
          context,
          "FAILED",
          "AI vote action completed without terminal state",
        );
      }
    }
    return null;
  },
});
