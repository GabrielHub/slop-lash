import { vOnCompleteArgs } from "@convex-dev/workpool";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { pickTopScoringPlayer, sortPlayersByScore } from "../src/games/core/player-rankings";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import { sanitize } from "../src/lib/sanitize";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { aiGenerationWorkpool } from "./components";
import {
  executeWinnerTaglineRef,
  winnerTaglineWorkCompleteRef,
  type EnqueueWinnerTaglineResult,
  type WinnerTaglineGenerationContext,
  type WinnerTaglineStatus,
  type WinnerTaglineWorkArgs,
} from "./winnerTaglineContracts";

const WINNER_TAGLINE_JOB_PREFIX = "winner-tagline:";
const MAX_PLAYERS = 64;
const MAX_ROUNDS = 10;
const MAX_PROMPTS_PER_ROUND = 32;
const MAX_RESPONSES_PER_ROUND = 32;
const MAX_CONTEXT_JOKES = 64;
const MAX_PENDING_JOBS = 32;
const MAX_NAME_LENGTH = 80;
const MAX_PROMPT_LENGTH = 300;
const MAX_RESPONSE_LENGTH = 200;
const MAX_TAGLINE_LENGTH = 300;
const MAX_ERROR_LENGTH = 2_000;

const projectFinalGameReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("leaderboards:projectFinalGame");

type AiLeader = Doc<"players"> & {
  type: "AI";
  modelId: string;
};

interface CurrentWinnerTaglineJob {
  job: Doc<"generationJobs">;
  game: Doc<"games"> & {
    gameType: "SLOPLASH";
    status: WinnerTaglineStatus;
  };
  players: Doc<"players">[];
  leader: AiLeader;
}

type CurrentWinnerTaglineJobResult =
  | { kind: "current"; value: CurrentWinnerTaglineJob }
  | { kind: "stale"; job: Doc<"generationJobs">; reason: string }
  | { kind: "ignored"; reason: string };

type LoadedPlayers =
  | { kind: "ready"; players: Doc<"players">[] }
  | { kind: "unavailable"; reason: string };

const workArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  leaderId: v.id("players"),
  gameStatus: v.union(v.literal("ROUND_RESULTS"), v.literal("FINAL_RESULTS")),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

const workContextValidator = v.object(workArgsValidator);

const generationContextValidator = v.object({
  modelId: v.string(),
  leaderId: v.id("players"),
  leaderName: v.string(),
  isFinal: v.boolean(),
  scoreboard: v.array(
    v.object({
      name: v.string(),
      score: v.number(),
      type: v.union(v.literal("HUMAN"), v.literal("AI")),
    }),
  ),
  jokes: v.array(
    v.object({
      roundNumber: v.number(),
      prompt: v.string(),
      answer: v.string(),
    }),
  ),
});

function expectedGenerationKey(phaseGeneration: number, leaderId: Id<"players">): string {
  return `${WINNER_TAGLINE_JOB_PREFIX}${phaseGeneration}:${leaderId}`;
}

function boundedError(reason: string): string {
  return reason.trim().slice(0, MAX_ERROR_LENGTH) || "Unknown winner tagline failure";
}

function rankedCompetitors(players: readonly Doc<"players">[]): Doc<"players">[] {
  return sortPlayersByScore(
    players
      .filter((player) => player.type !== "SPECTATOR")
      .map((player) => ({ id: player._id, score: player.score, player })),
  ).map(({ player }) => player);
}

function pickAiLeader(players: readonly Doc<"players">[]): AiLeader | null {
  const leader = pickTopScoringPlayer(
    players
      .filter((player) => player.type !== "SPECTATOR")
      .map((player) => ({ id: player._id, score: player.score, player })),
  )?.player;
  return leader?.type === "AI" && typeof leader.modelId === "string" && leader.modelId.length > 0
    ? { ...leader, type: "AI", modelId: leader.modelId }
    : null;
}

async function loadBoundedPlayers(db: DatabaseReader, gameId: Id<"games">): Promise<LoadedPlayers> {
  const players = await db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS + 1);
  return players.length > MAX_PLAYERS
    ? { kind: "unavailable", reason: "Room exceeds the winner tagline player limit" }
    : { kind: "ready", players };
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
  await ctx.scheduler.runAfter(0, projectFinalGameReference, { gameId: job.gameId });
}

export async function cancelPendingWinnerTaglineJobs(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    reason: string;
    exceptGenerationKey?: string;
  },
): Promise<number> {
  const winnerTaglineJobs = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index
        .eq("gameId", args.gameId)
        .gte("generationKey", WINNER_TAGLINE_JOB_PREFIX)
        .lt("generationKey", `${WINNER_TAGLINE_JOB_PREFIX}\uffff`),
    )
    .take(MAX_PENDING_JOBS);
  const staleJobs = winnerTaglineJobs.filter(
    (job) =>
      job.kind === "WINNER_TAGLINE" &&
      (job.status === "QUEUED" || job.status === "RUNNING") &&
      job.generationKey !== args.exceptGenerationKey,
  );
  for (const job of staleJobs) {
    await markTerminal(ctx, job, "CANCELED", args.reason);
  }
  return staleJobs.length;
}

export async function queueWinnerTaglineForResults(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    gameStatus: WinnerTaglineStatus;
    phaseGeneration: number;
  },
): Promise<EnqueueWinnerTaglineResult> {
  const game = await ctx.db.get("games", args.gameId);
  if (
    !game ||
    game.gameType !== "SLOPLASH" ||
    game.status !== args.gameStatus ||
    game.phaseGeneration !== args.phaseGeneration
  ) {
    return { status: "SKIPPED", reason: "Winner tagline phase is no longer current" };
  }

  const loadedPlayers = await loadBoundedPlayers(ctx.db, game._id);
  if (loadedPlayers.kind === "unavailable") {
    await cancelPendingWinnerTaglineJobs(ctx, {
      gameId: game._id,
      reason: loadedPlayers.reason,
    });
    return { status: "SKIPPED", reason: loadedPlayers.reason };
  }
  const leader = pickAiLeader(loadedPlayers.players);
  if (!leader) {
    const reason = "Current Slop-Lash leader is not an AI player";
    await cancelPendingWinnerTaglineJobs(ctx, { gameId: game._id, reason });
    return { status: "SKIPPED", reason };
  }

  const generationKey = expectedGenerationKey(args.phaseGeneration, leader._id);
  await cancelPendingWinnerTaglineJobs(ctx, {
    gameId: game._id,
    reason: "Winner tagline phase or leader changed",
    exceptGenerationKey: generationKey,
  });
  const existing = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", game._id).eq("generationKey", generationKey),
    )
    .take(2);
  if (existing.length > 0) {
    const job = existing[0];
    if (existing.length === 1 && job?.kind === "WINNER_TAGLINE" && job.targetId === leader._id) {
      return { status: "EXISTING", jobId: job._id };
    }
    return { status: "SKIPPED", reason: "Duplicate winner tagline work was rejected" };
  }
  if (game.winnerTagline !== undefined) {
    return { status: "SKIPPED", reason: "Winner tagline is already available" };
  }

  const now = Date.now();
  const jobId = await ctx.db.insert("generationJobs", {
    gameId: game._id,
    kind: "WINNER_TAGLINE",
    generationKey,
    targetId: leader._id,
    status: "QUEUED",
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  });
  const workArgs: WinnerTaglineWorkArgs = {
    jobId,
    gameId: game._id,
    leaderId: leader._id,
    gameStatus: args.gameStatus,
    phaseGeneration: args.phaseGeneration,
    attempt: 1,
  };
  const workId = await aiGenerationWorkpool.enqueueAction(ctx, executeWinnerTaglineRef, workArgs, {
    retry: false,
    onComplete: winnerTaglineWorkCompleteRef,
    context: workArgs,
  });
  await ctx.db.patch("generationJobs", jobId, {
    attempt: workArgs.attempt,
    workId,
    updatedAt: Date.now(),
  });
  return { status: "ENQUEUED", jobId };
}

export async function isWinnerTaglinePending(
  db: DatabaseReader,
  game: Doc<"games">,
  players: readonly Doc<"players">[],
): Promise<boolean> {
  if (
    game.gameType !== "SLOPLASH" ||
    (game.status !== "ROUND_RESULTS" && game.status !== "FINAL_RESULTS")
  ) {
    return false;
  }
  const leader = pickAiLeader(players);
  if (!leader) return false;
  const generationKey = expectedGenerationKey(game.phaseGeneration, leader._id);
  const jobs = await db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", game._id).eq("generationKey", generationKey),
    )
    .take(2);
  return (
    jobs.length === 1 &&
    jobs[0]?.kind === "WINNER_TAGLINE" &&
    jobs[0].targetId === leader._id &&
    (jobs[0].status === "QUEUED" || jobs[0].status === "RUNNING")
  );
}

async function validateCurrentJob(
  db: DatabaseReader,
  args: WinnerTaglineWorkArgs,
  expectedStatus: "QUEUED" | "RUNNING",
): Promise<CurrentWinnerTaglineJobResult> {
  const job = await db.get("generationJobs", args.jobId);
  if (!job) return { kind: "ignored", reason: "Winner tagline job no longer exists" };
  if (
    job.gameId !== args.gameId ||
    job.kind !== "WINNER_TAGLINE" ||
    job.targetId !== args.leaderId
  ) {
    return { kind: "ignored", reason: "Winner tagline work identity does not match" };
  }
  if (job.status !== expectedStatus || job.attempt !== args.attempt) {
    return { kind: "ignored", reason: "Winner tagline attempt is no longer current" };
  }
  if (!job.workId) {
    return { kind: "stale", job, reason: "Winner tagline job has no Workpool id" };
  }

  const generationKey = expectedGenerationKey(args.phaseGeneration, args.leaderId);
  if (job.generationKey !== generationKey) {
    return { kind: "stale", job, reason: "Winner tagline generation key is invalid" };
  }
  const jobsWithKey = await db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", args.gameId).eq("generationKey", generationKey),
    )
    .take(2);
  if (jobsWithKey.length !== 1 || jobsWithKey[0]?._id !== job._id) {
    return { kind: "stale", job, reason: "Duplicate winner tagline work was rejected" };
  }

  const game = await db.get("games", args.gameId);
  if (!game || game.gameType !== "SLOPLASH") {
    return { kind: "stale", job, reason: "Winner tagline game no longer exists" };
  }
  if (game.status !== args.gameStatus || game.phaseGeneration !== args.phaseGeneration) {
    return { kind: "stale", job, reason: "Winner tagline phase is no longer current" };
  }
  if (game.winnerTagline !== undefined) {
    return { kind: "stale", job, reason: "Winner tagline is already available" };
  }

  const loadedPlayers = await loadBoundedPlayers(db, game._id);
  if (loadedPlayers.kind === "unavailable") {
    return { kind: "stale", job, reason: loadedPlayers.reason };
  }
  const leader = pickAiLeader(loadedPlayers.players);
  if (!leader || leader._id !== args.leaderId) {
    return { kind: "stale", job, reason: "Current AI leader changed" };
  }

  return {
    kind: "current",
    value: {
      job,
      game: { ...game, gameType: "SLOPLASH", status: game.status },
      players: loadedPlayers.players,
      leader,
    },
  };
}

async function loadGenerationContext(
  db: DatabaseReader,
  current: CurrentWinnerTaglineJob,
): Promise<
  | { kind: "ready"; context: WinnerTaglineGenerationContext }
  | { kind: "unavailable"; reason: string }
> {
  const { game, leader, players } = current;
  const rounds =
    game.status === "FINAL_RESULTS"
      ? await db
          .query("rounds")
          .withIndex("by_gameId_and_roundNumber", (index) => index.eq("gameId", game._id))
          .order("asc")
          .take(MAX_ROUNDS + 1)
      : [
          await db
            .query("rounds")
            .withIndex("by_gameId_and_roundNumber", (index) =>
              index.eq("gameId", game._id).eq("roundNumber", game.currentRound),
            )
            .unique(),
        ].filter((round): round is Doc<"rounds"> => round !== null);
  if (rounds.length === 0) {
    return { kind: "unavailable", reason: "Winner tagline round context is missing" };
  }
  if (rounds.length > MAX_ROUNDS) {
    return { kind: "unavailable", reason: "Winner tagline round context exceeds its limit" };
  }

  const jokes: WinnerTaglineGenerationContext["jokes"] = [];
  for (const round of rounds) {
    const [promptsWithOverflow, responsesWithOverflow] = await Promise.all([
      db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", game._id).eq("roundId", round._id),
        )
        .take(MAX_PROMPTS_PER_ROUND + 1),
      db
        .query("responses")
        .withIndex("by_playerId_and_roundId", (index) =>
          index.eq("playerId", leader._id).eq("roundId", round._id),
        )
        .take(MAX_RESPONSES_PER_ROUND + 1),
    ]);
    if (
      promptsWithOverflow.length > MAX_PROMPTS_PER_ROUND ||
      responsesWithOverflow.length > MAX_RESPONSES_PER_ROUND
    ) {
      return { kind: "unavailable", reason: "Winner tagline joke context exceeds its limit" };
    }
    const prompts = new Map(promptsWithOverflow.map((prompt) => [prompt._id, prompt]));
    for (const response of responsesWithOverflow) {
      const prompt = prompts.get(response.promptId);
      if (!prompt || response.text === FORFEIT_MARKER) continue;
      jokes.push({
        roundNumber: round.roundNumber,
        prompt: prompt.text.slice(0, MAX_PROMPT_LENGTH),
        answer: response.text.slice(0, MAX_RESPONSE_LENGTH),
      });
    }
  }
  if (jokes.length > MAX_CONTEXT_JOKES) {
    return { kind: "unavailable", reason: "Winner tagline joke context exceeds its limit" };
  }

  return {
    kind: "ready",
    context: {
      modelId: leader.modelId,
      leaderId: leader._id,
      leaderName: leader.name.slice(0, MAX_NAME_LENGTH),
      isFinal: game.status === "FINAL_RESULTS",
      scoreboard: rankedCompetitors(players).map((player) => ({
        name: player.name.slice(0, MAX_NAME_LENGTH),
        score: player.score,
        type: player.type === "AI" ? ("AI" as const) : ("HUMAN" as const),
      })),
      jokes,
    },
  };
}

export const enqueueWinnerTaglineJob = internalMutation({
  args: {
    gameId: v.id("games"),
    gameStatus: v.union(v.literal("ROUND_RESULTS"), v.literal("FINAL_RESULTS")),
    phaseGeneration: v.number(),
  },
  returns: v.union(
    v.object({
      status: v.union(v.literal("ENQUEUED"), v.literal("EXISTING")),
      jobId: v.id("generationJobs"),
    }),
    v.object({ status: v.literal("SKIPPED"), reason: v.string() }),
  ),
  handler: (ctx, args) => queueWinnerTaglineForResults(ctx, args),
});

export const claimWinnerTaglineJob = internalMutation({
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

    const loadedContext = await loadGenerationContext(ctx.db, current.value);
    if (loadedContext.kind === "unavailable") {
      await markTerminal(ctx, current.value.job, "CANCELED", loadedContext.reason);
      return { status: "CANCELED" as const, reason: loadedContext.reason };
    }

    const now = Date.now();
    await ctx.db.patch("generationJobs", current.value.job._id, {
      status: "RUNNING",
      error: undefined,
      startedAt: now,
      updatedAt: now,
    });
    return { status: "CLAIMED" as const, context: loadedContext.context };
  },
});

export const persistWinnerTagline = internalMutation({
  args: {
    ...workArgsValidator,
    text: v.string(),
    usage: v.object({
      modelId: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.number(),
    }),
  },
  returns: v.union(
    v.object({ status: v.literal("SUCCEEDED"), tagline: v.string() }),
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

    const { game, job, leader } = current.value;
    const usageIsValid =
      args.usage.modelId === leader.modelId &&
      Number.isFinite(args.usage.inputTokens) &&
      Number.isFinite(args.usage.outputTokens) &&
      Number.isFinite(args.usage.costUsd) &&
      args.usage.inputTokens >= 0 &&
      args.usage.outputTokens >= 0 &&
      args.usage.costUsd >= 0;
    if (!usageIsValid) {
      const reason = "AI usage does not match the winner tagline model";
      await markTerminal(ctx, job, "FAILED", reason);
      return { status: "FAILED" as const, reason };
    }

    const tagline = sanitize(args.text, MAX_TAGLINE_LENGTH);
    if (!tagline) {
      const reason = "Winner tagline generation returned empty text";
      await markTerminal(ctx, job, "FAILED", reason);
      return { status: "FAILED" as const, reason };
    }

    const modelUsage = await ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) =>
        index.eq("gameId", game._id).eq("modelId", leader.modelId),
      )
      .unique();
    const now = Date.now();
    await ctx.db.patch("games", game._id, {
      winnerTagline: tagline,
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
        modelId: leader.modelId,
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
    await ctx.scheduler.runAfter(0, projectFinalGameReference, { gameId: game._id });
    return { status: "SUCCEEDED" as const, tagline };
  },
});

export const winnerTaglineWorkComplete = internalMutation({
  args: vOnCompleteArgs(workContextValidator),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const job = await ctx.db.get("generationJobs", context.jobId);
    if (
      !job ||
      job.gameId !== context.gameId ||
      job.kind !== "WINNER_TAGLINE" ||
      job.targetId !== context.leaderId ||
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
      await markTerminal(ctx, job, "CANCELED", "Workpool canceled winner tagline generation");
    } else {
      const actionResult = result.returnValue as { status?: unknown } | null;
      await markTerminal(
        ctx,
        job,
        "FAILED",
        `Winner tagline action completed without terminal state (${String(actionResult?.status)})`,
      );
    }
    return null;
  },
});
