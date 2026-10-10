"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { compactOutcome } from "./outcome";
import { loadFightSim, type FightInput } from "./ports";
import { fightMethodValidator, fightSideValidator } from "./tables";

// The canonical fight: the same deterministic sim every stage replays, run
// once on the server as soon as both sheets and the matchup notes are final.

export const run = internalAction({
  args: { fightId: v.id("slopFightFights"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const input: FightInput | null = await ctx.runQuery(internal.slopfight.fightData.simInput, {
      fightId: args.fightId,
    });
    if (!input) return null;
    try {
      const sim = await loadFightSim();
      const outcome = sim.run(input);
      await ctx.runMutation(internal.slopfight.fightData.storeOutcome, {
        ...args,
        outcome: compactOutcome(outcome),
      });
    } catch (error) {
      await ctx.runMutation(internal.slopfight.fightData.simFailed, {
        ...args,
        error: String(error instanceof Error ? (error.stack ?? error.message) : error).slice(
          0,
          500,
        ),
      });
    }
    return null;
  },
});

/**
 * Dev smoke test: one sample fight on the server, for the cross-environment
 * determinism check against the same fight run locally in Node.
 * `vp exec convex run slopfight/fightSim:smoke` on the dev deployment.
 */
export const smoke = internalAction({
  args: {},
  returns: v.object({
    hash: v.string(),
    winner: fightSideValidator,
    method: fightMethodValidator,
    endMs: v.number(),
    events: v.number(),
    loadMs: v.number(),
    rapierInitMs: v.number(),
    runMs: v.number(),
  }),
  handler: async () => {
    const loading = Date.now();
    const sim = await loadFightSim();
    const loadMs = Date.now() - loading;
    const started = Date.now();
    const outcome = sim.run(sim.smokeInput());
    return {
      hash: outcome.hash,
      winner: outcome.winner,
      method: outcome.method,
      endMs: outcome.endMs,
      events: outcome.events.length,
      loadMs,
      rapierInitMs: sim.rapierInitMs,
      runMs: Date.now() - started,
    };
  },
});
