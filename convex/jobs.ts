import { v, type Infer } from "convex/values";
import { vOnCompleteArgs } from "@convex-dev/workpool";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { aiWorkpools } from "./components";
import { settle } from "./engine";
import { getJobHandler } from "./modes";
import { aiCallRecordValidator } from "./validators";
import type { AiPool } from "../src/lib/ai/tasks";
import { rollUpUsage, type AiModelUsage } from "../src/lib/ai/usage";

export type AiCallRow = Infer<typeof aiCallRecordValidator>;

/**
 * The database half of one kind of AI job. The matching network half lives in
 * `jobRunner.ts`, keyed by the same kind.
 */
export interface JobHandler<Input = unknown, Output = unknown> {
  /** Phase-bound jobs are dropped once the phase that queued them is over. */
  phaseBound: boolean;
  /**
   * Workpool for this kind: `critical` when the room waits on the result
   * (persona replies, ballots), else `background` (the default).
   */
  pool?: AiPool;
  /** Loads what the AI call needs, or null when the job no longer applies. */
  prepare(ctx: QueryCtx, game: Doc<"games">, job: Doc<"generationJobs">): Promise<Input | null>;
  /** Persists the runner's output, including a failed call's fallback output. */
  apply(
    ctx: MutationCtx,
    game: Doc<"games">,
    job: Doc<"generationJobs">,
    output: Output,
  ): Promise<void>;
  /** Fills in for a failed call (e.g. forfeit) so the phase can still finish. */
  fallback?(ctx: MutationCtx, game: Doc<"games">, job: Doc<"generationJobs">): Promise<void>;
}

/**
 * What a runner returns. `calls` are the `aiCalls` rows (`result.call` from
 * the task layer), which `apply` also rolls up into `gameModelUsage`;
 * `failReason` marks the job FAILED (with that reason) even though `apply`
 * still runs, so a failure never looks like a success.
 */
export type JobResult<Output> = {
  output: Output;
  calls: AiCallRow[];
  failReason: string | null;
};

/** A runner result from task-layer calls. */
export function jobResult<Output>(
  output: Output,
  calls: readonly AiCallRow[],
  failReason: string | null = null,
): JobResult<Output> {
  return { output, calls: [...calls], failReason };
}

/** Map of job kind → its input and output payloads, declared once per mode. */
export type JobSpecs = Record<string, { input: unknown; output: unknown }>;

export type JobHandlers<Specs extends JobSpecs> = {
  [Kind in keyof Specs]: JobHandler<Specs[Kind]["input"], Specs[Kind]["output"]>;
};

export type JobRunners<Specs extends JobSpecs> = {
  [Kind in keyof Specs]: (input: Specs[Kind]["input"]) => Promise<JobResult<Specs[Kind]["output"]>>;
};

/**
 * Queues one AI job. Keys are unique per game, so queueing the same work twice
 * is a harmless no-op. It runs in the handler's `pool` (default `background`).
 */
export async function enqueueJob(
  ctx: MutationCtx,
  game: Doc<"games">,
  kind: string,
  key: string,
  payload?: unknown,
): Promise<boolean> {
  if (await findJob(ctx, game._id, key)) return false;
  const handler = getJobHandler(kind);
  const now = Date.now();
  const jobId = await ctx.db.insert("generationJobs", {
    gameId: game._id,
    kind,
    key,
    phaseGeneration: game.phaseGeneration,
    phaseBound: handler.phaseBound,
    ...(payload === undefined ? {} : { payload }),
    status: "QUEUED",
    createdAt: now,
    updatedAt: now,
  });
  await aiWorkpools[handler.pool ?? "background"].enqueueAction(
    ctx,
    internal.jobRunner.run,
    { jobId },
    { onComplete: internal.jobs.complete, context: { jobId } },
  );
  return true;
}

export async function findJob(ctx: QueryCtx | MutationCtx, gameId: Id<"games">, key: string) {
  return ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_key", (index) => index.eq("gameId", gameId).eq("key", key))
    .unique();
}

/** The payload of a job that acts for one AI seat. */
export type PlayerJobPayload = { playerId: Id<"players"> };

/** The AI seat a job acts for, or null once it no longer plays. */
export async function jobAiPlayer(ctx: QueryCtx, job: Doc<"generationJobs">) {
  const player = await ctx.db.get("players", (job.payload as PlayerJobPayload).playerId);
  return player && player.type === "AI" && player.modelId && player.kickedAt === undefined
    ? { ...player, modelId: player.modelId }
    : null;
}

/** Stops every job that has not started; running calls are discarded on return. */
export async function cancelGameJobs(ctx: MutationCtx, gameId: Id<"games">): Promise<void> {
  const queued = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_status", (index) => index.eq("gameId", gameId).eq("status", "QUEUED"))
    .take(256);
  const now = Date.now();
  for (const job of queued) {
    await ctx.db.patch("generationJobs", job._id, { status: "CANCELED", updatedAt: now });
  }
}

function isCurrent(game: Doc<"games"> | null, job: Doc<"generationJobs">): game is Doc<"games"> {
  if (!game || job.status !== "QUEUED") return false;
  return !job.phaseBound || game.phaseGeneration === job.phaseGeneration;
}

/** Rolls call usage into `gameModelUsage`, which feeds the leaderboard spend. */
export async function recordUsage(ctx: MutationCtx, gameId: Id<"games">, usage: AiModelUsage[]) {
  for (const entry of usage) {
    if (!entry.modelId) continue;
    const existing = await ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) =>
        index.eq("gameId", gameId).eq("modelId", entry.modelId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("gameModelUsage", existing._id, {
        inputTokens: existing.inputTokens + entry.inputTokens,
        outputTokens: existing.outputTokens + entry.outputTokens,
        costUsd: existing.costUsd + entry.costUsd,
      });
    } else {
      await ctx.db.insert("gameModelUsage", { gameId, ...entry });
    }
  }
}

/** Inserts `aiCalls` rows, one per model call. */
export async function recordCalls(
  ctx: MutationCtx,
  gameId: Id<"games">,
  calls: readonly AiCallRow[],
  jobId?: Id<"generationJobs">,
): Promise<void> {
  for (const call of calls) {
    await ctx.db.insert("aiCalls", { gameId, ...(jobId ? { jobId } : {}), ...call });
  }
}

/** Records calls made outside a job, such as narrator lines. */
export const recordAiCalls = internalMutation({
  args: { gameId: v.id("games"), calls: v.array(aiCallRecordValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await ctx.db.get("games", args.gameId))) return null;
    await recordCalls(ctx, args.gameId, args.calls);
    return null;
  },
});

export const prepare = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) return null;
    const game = await ctx.db.get("games", job.gameId);
    if (!isCurrent(game, job)) return null;
    const input = await getJobHandler(job.kind).prepare(ctx, game, job);
    return input === null ? null : { kind: job.kind, input };
  },
});

export const apply = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    output: v.any(),
    failReason: v.union(v.string(), v.null()),
    calls: v.array(aiCallRecordValidator),
    startedAt: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) return;
    // The calls happened either way, so their cost is always recorded.
    await recordUsage(ctx, job.gameId, rollUpUsage(args.calls));
    await recordCalls(ctx, job.gameId, args.calls, job._id);
    const game = await ctx.db.get("games", job.gameId);
    const now = Date.now();
    const timing = {
      ...(args.startedAt === undefined ? {} : { startedAt: args.startedAt }),
      ...(args.latencyMs === undefined ? {} : { latencyMs: args.latencyMs }),
    };
    if (!isCurrent(game, job)) {
      if (job.status === "QUEUED") {
        await ctx.db.patch("generationJobs", job._id, {
          status: "CANCELED",
          ...timing,
          updatedAt: now,
        });
      }
      return;
    }
    await getJobHandler(job.kind).apply(ctx, game, job, args.output);
    await ctx.db.patch("generationJobs", job._id, {
      ...(args.failReason
        ? { status: "FAILED" as const, failReason: args.failReason }
        : { status: "SUCCEEDED" as const }),
      ...timing,
      updatedAt: now,
    });
    await settle(ctx, game._id);
  },
});

/**
 * Workpool completion. Anything that did not reach `apply` ends here, and a
 * job whose phase is still live gets its fallback, so a missing AI answer can
 * never hold a phase open.
 */
export const complete = internalMutation({
  args: vOnCompleteArgs(v.object({ jobId: v.id("generationJobs") })),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.context.jobId);
    if (!job || job.status !== "QUEUED") return;
    const game = await ctx.db.get("games", job.gameId);
    const now = Date.now();
    const failed = args.result.kind !== "success";
    if (failed) console.error(`[jobs] ${job.kind} ${job.key} failed`, args.result);
    await ctx.db.patch("generationJobs", job._id, {
      status: failed ? "FAILED" : "CANCELED",
      ...(args.result.kind === "failed"
        ? { failReason: "action-error", error: args.result.error.slice(0, 500) }
        : {}),
      updatedAt: now,
    });
    if (!isCurrent(game, job)) return;
    // Still live but nothing was applied: fill the gap either way.
    await getJobHandler(job.kind).fallback?.(ctx, game, job);
    await settle(ctx, game._id);
  },
});
