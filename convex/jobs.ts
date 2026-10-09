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
import { aiWorkpool } from "./components";
import { settle } from "./engine";
import { getJobHandler } from "./modes";
import { aiUsageValidator } from "./validators";

export type AiUsage = Infer<typeof aiUsageValidator>;

/**
 * The database half of one kind of AI job. The matching network half lives in
 * `jobRunner.ts`, keyed by the same kind.
 */
export interface JobHandler<Input = unknown, Output = unknown> {
  /** Phase-bound jobs are dropped once the phase that queued them is over. */
  phaseBound: boolean;
  /** Loads what the AI call needs, or null when the job no longer applies. */
  prepare(ctx: QueryCtx, game: Doc<"games">, job: Doc<"generationJobs">): Promise<Input | null>;
  /** Persists a successful result. */
  apply(
    ctx: MutationCtx,
    game: Doc<"games">,
    job: Doc<"generationJobs">,
    output: Output,
  ): Promise<void>;
  /** Fills in for a failed call (e.g. forfeit) so the phase can still finish. */
  fallback?(ctx: MutationCtx, game: Doc<"games">, job: Doc<"generationJobs">): Promise<void>;
}

export type JobResult<Output> = { output: Output; usage: AiUsage[] };

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
 * is a harmless no-op.
 */
export async function enqueueJob(
  ctx: MutationCtx,
  game: Doc<"games">,
  kind: string,
  key: string,
  payload?: unknown,
): Promise<boolean> {
  if (await findJob(ctx, game._id, key)) return false;
  const now = Date.now();
  const jobId = await ctx.db.insert("generationJobs", {
    gameId: game._id,
    kind,
    key,
    phaseGeneration: game.phaseGeneration,
    phaseBound: getJobHandler(kind).phaseBound,
    ...(payload === undefined ? {} : { payload }),
    status: "QUEUED",
    createdAt: now,
    updatedAt: now,
  });
  await aiWorkpool.enqueueAction(
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

async function recordUsage(ctx: MutationCtx, gameId: Id<"games">, usage: AiUsage[]) {
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
    usage: v.array(aiUsageValidator),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) return;
    // The call happened either way, so its cost is always recorded.
    await recordUsage(ctx, job.gameId, args.usage);
    const game = await ctx.db.get("games", job.gameId);
    const now = Date.now();
    if (!isCurrent(game, job)) {
      if (job.status === "QUEUED") {
        await ctx.db.patch("generationJobs", job._id, { status: "CANCELED", updatedAt: now });
      }
      return;
    }
    await getJobHandler(job.kind).apply(ctx, game, job, args.output);
    await ctx.db.patch("generationJobs", job._id, { status: "SUCCEEDED", updatedAt: now });
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
      ...(args.result.kind === "failed" ? { error: args.result.error.slice(0, 500) } : {}),
      updatedAt: now,
    });
    if (!isCurrent(game, job)) return;
    // Still live but nothing was applied: fill the gap either way.
    await getJobHandler(job.kind).fallback?.(ctx, game, job);
    await settle(ctx, game._id);
  },
});
