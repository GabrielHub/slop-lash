import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { championOf, decideBySeed, fightSheets, recordOutcome, startSim } from "./data";
import { outcomeLanded } from "./mode";
import {
  arenaIdValidator,
  championValidator,
  fightOutcomeValidator,
  matchupNoteValidator,
} from "./tables";

// The database half of the server sim (fightSim.ts is the Node half).

/** The sim's input for a fight, or null once it has an outcome. */
export const simInput = internalQuery({
  args: { fightId: v.id("slopFightFights") },
  returns: v.union(
    v.null(),
    v.object({
      seed: v.number(),
      arena: arenaIdValidator,
      a: championValidator,
      b: championValidator,
      notes: v.array(matchupNoteValidator),
      limitMs: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const fight = await ctx.db.get("slopFightFights", args.fightId);
    if (!fight || fight.outcome) return null;
    const sheets = await fightSheets(ctx, fight);
    let sheetA = sheets?.A ?? null;
    let sheetB = sheets?.B ?? null;
    if (!sheetA || !sheetB) {
      const [a, b] = await Promise.all([
        ctx.db.get("slopFightFighters", fight.a),
        ctx.db.get("slopFightFighters", fight.b),
      ]);
      sheetA = a && championOf(a);
      sheetB = b && championOf(b);
    }
    if (!sheetA || !sheetB) return null;
    return {
      seed: fight.seed,
      arena: fight.arena,
      a: sheetA,
      b: sheetB,
      notes: fight.notes ?? [],
      limitMs: fight.limitMs,
    };
  },
});

/**
 * Stores the canonical outcome. Any attempt's result is accepted while none
 * is stored: the sim is deterministic, so every attempt computes the same fight.
 */
export const storeOutcome = internalMutation({
  args: {
    fightId: v.id("slopFightFights"),
    attempt: v.number(),
    outcome: fightOutcomeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fight = await ctx.db.get("slopFightFights", args.fightId);
    if (!fight || fight.outcome) return null;
    await recordOutcome(ctx, fight, args.outcome, {
      status: "DONE",
      attempt: Math.max(fight.sim.attempt, args.attempt),
    });
    await outcomeLanded(ctx, fight.gameId, fight._id);
    return null;
  },
});

/** A sim run failed: try once more, then let the seed decide (the view says so). */
export const simFailed = internalMutation({
  args: { fightId: v.id("slopFightFights"), attempt: v.number(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fight = await ctx.db.get("slopFightFights", args.fightId);
    if (!fight || fight.outcome || fight.sim.attempt !== args.attempt) return null;
    console.error(`[slopfight] sim attempt ${args.attempt} failed for ${fight._id}: ${args.error}`);
    const failed = {
      ...fight,
      sim: { ...fight.sim, status: "FAILED" as const, error: args.error },
    };
    await ctx.db.patch("slopFightFights", fight._id, { sim: failed.sim });
    if (args.attempt < 2) {
      await startSim(ctx, failed);
      return null;
    }
    await decideBySeed(ctx, failed);
    await outcomeLanded(ctx, fight.gameId, fight._id);
    return null;
  },
});
