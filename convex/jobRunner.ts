"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { JobResult } from "./jobs";
import { matchslopRunners } from "./matchslop/runners";
import { slopfightRunners } from "./slopfight/runners";
import { sloplashRunners } from "./sloplash/runners";

const runners: Record<string, (input: never) => Promise<JobResult<unknown>>> = {
  ...sloplashRunners,
  ...matchslopRunners,
  ...slopfightRunners,
};

/** Runs one AI job: load its input, make the call, hand the result back. */
export const run = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const prepared = await ctx.runQuery(internal.jobs.prepare, args);
    if (!prepared) return null;
    const runner = runners[prepared.kind];
    if (!runner) throw new Error(`No runner for job kind ${prepared.kind}`);
    // `jobs.prepare` loaded this input with the same kind's handler.
    const result = await runner(prepared.input as never);
    await ctx.runMutation(internal.jobs.apply, {
      jobId: args.jobId,
      output: result.output,
      failReason: result.failReason,
      calls: result.calls,
      startedAt,
      latencyMs: Date.now() - startedAt,
    });
    return null;
  },
});
