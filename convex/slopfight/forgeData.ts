import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { settle } from "../engine";
import { recordCalls, recordUsage } from "../jobs";
import { aiCallRecordValidator } from "../validators";
import { normalizeRejection, type Champion } from "../../src/games/slopfight/sheet";
import type { Stroke } from "../../src/games/slopfight/strokes";
import { rollUpUsage } from "../../src/lib/ai/usage";
import {
  championOf,
  clearForgeStream,
  findForgeStream,
  isUpgradeKind,
  keepChampion,
  lenientKind,
  loadFighterStrokeRows,
  loadFighters,
  loadState,
  parseChampion,
  settleAfterReveals,
  startForge,
  type Fighter,
} from "./data";
import {
  arenaIdValidator,
  bodyPlanValidator,
  championValidator,
  forgeKindValidator,
  forgeOutcomeValidator,
  partValidator,
  strokeValidator,
  type ForgeKind,
} from "./tables";

// The database half of the forge (forge.ts is the Node half): what a forge
// reads, the streamed parts it patches in, and its guarded result.

export async function loadStrokeBatches(
  ctx: QueryCtx,
  fighter: Fighter,
  maxLayer: number,
): Promise<NonNullable<ForgeInput["batches"]>> {
  const rows = await loadFighterStrokeRows(ctx, fighter._id, maxLayer);
  return rows.map((row) => ({ layer: row.layer, seq: row.seq, strokes: row.strokes as Stroke[] }));
}

/** What one forge works from. Nothing here is stored by the forge; the PNG is made in the action. */
export type ForgeInput = {
  kind: ForgeKind;
  /** A description: the Build text, or a house champion's invented one. */
  text: string | null;
  /** Stroke batches to rasterize (every layer up to `layer`), or null for no drawing. */
  batches: Array<{ layer: number; seq: number; strokes: Stroke[] }> | null;
  /** The newest layer: 0 at Build, the round for an upgrade's addition. */
  layer: number;
  previous: Champion | null;
  /** An upgrade's text addition. */
  addition: string | null;
  arenas: Doc<"slopFightState">["arenas"];
};

const isCurrentForge = (fighter: Fighter | null, forgeToken: string): fighter is Fighter =>
  fighter !== null && fighter.status === "FORGING" && fighter.forgeToken === forgeToken;

export const forgeInput = internalQuery({
  args: { fighterId: v.id("slopFightFighters"), forgeToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      kind: forgeKindValidator,
      text: v.union(v.string(), v.null()),
      batches: v.union(
        v.array(
          v.object({ layer: v.number(), seq: v.number(), strokes: v.array(strokeValidator) }),
        ),
        v.null(),
      ),
      layer: v.number(),
      previous: v.union(championValidator, v.null()),
      addition: v.union(v.string(), v.null()),
      arenas: v.array(arenaIdValidator),
    }),
  ),
  handler: async (ctx, args): Promise<ForgeInput | null> => {
    const fighter = await ctx.db.get("slopFightFighters", args.fighterId);
    if (!isCurrentForge(fighter, args.forgeToken) || !fighter.forge) return null;
    const [game, state] = await Promise.all([
      ctx.db.get("games", fighter.gameId),
      loadState(ctx, fighter.gameId),
    ]);
    if (!game || game.status !== "PLAYING" || !state) return null;
    const { kind, version } = fighter.forge;
    const base = { kind, text: null, batches: null, layer: 0, previous: null, addition: null };
    const arenas = state.arenas;
    const drawing = async (layer: number) => {
      const batches = await loadStrokeBatches(ctx, fighter, layer);
      return batches.length > 0 ? batches : null;
    };

    if (kind === "HOUSE") return { ...base, arenas, text: fighter.text || null };
    if (kind === "SUBMIT" || kind === "LENIENT") {
      // A lenient forge reads whatever is there: the chosen input first.
      const text = fighter.text || null;
      const batches = fighter.inputKind === "DESCRIBE" ? null : await drawing(0);
      if (fighter.inputKind === "DRAW") return { ...base, arenas, batches };
      if (fighter.inputKind === "DESCRIBE") return { ...base, arenas, text };
      return { ...base, arenas, batches, text: batches ? null : text };
    }
    // Upgrades (the house's addition is picked in code when UPGRADE opens).
    const previous = championOf(fighter);
    const addition = fighter.addition?.round === version ? fighter.addition : undefined;
    if (!addition) {
      // Not submitted: whatever was drawn on the new layer is the addition.
      return { ...base, arenas, layer: version, previous, batches: await drawing(version) };
    }
    if (addition.kind === "DESCRIBE") {
      return { ...base, arenas, layer: version, previous, addition: addition.text || null };
    }
    return { ...base, arenas, layer: version, previous, batches: await drawing(version) };
  },
});

export const patchPartial = internalMutation({
  args: {
    fighterId: v.id("slopFightFighters"),
    forgeToken: v.string(),
    parts: v.array(partValidator),
    /** The first patch of a repair or fallback call, which streams from scratch. */
    restart: v.optional(v.boolean()),
    /** The body plan streamed before the parts, when the model has written it. */
    bodyPlan: v.optional(bodyPlanValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stream = await findForgeStream(ctx, args.fighterId);
    if (!stream || stream.forgeToken !== args.forgeToken) return null;
    // Parts only grow while one call streams; a late, shorter patch never shrinks them.
    if (!args.restart && stream.parts.length >= args.parts.length) return null;
    await ctx.db.patch("slopFightForgeStreams", stream._id, {
      parts: args.parts,
      ...(args.bodyPlan ? { bodyPlan: args.bodyPlan } : {}),
    });
    return null;
  },
});

/** The phase in which the player can still answer a rejection with a new try. */
function canRetryInPhase(kind: ForgeKind | undefined, phase: string): boolean {
  return (kind === "SUBMIT" && phase === "BUILD") || (kind === "UPGRADE" && phase === "UPGRADE");
}

/**
 * Lands a forge: READY with the balanced champion (an upgrade keeps the old
 * sheet as `previous`), REJECTED with a reason while the player can still
 * retry (once their clock is gone a rejection is forged leniently instead),
 * or FAILED. A result for an older token is ignored; its calls are recorded
 * either way, because they were billed.
 */
export const applyForge = internalMutation({
  args: {
    fighterId: v.id("slopFightFighters"),
    forgeToken: v.string(),
    outcome: forgeOutcomeValidator,
    calls: v.array(aiCallRecordValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fighter = await ctx.db.get("slopFightFighters", args.fighterId);
    if (!fighter) return null;
    const game = await ctx.db.get("games", fighter.gameId);
    if (!game) return null;
    await recordUsage(ctx, game._id, rollUpUsage(args.calls));
    await recordCalls(ctx, game._id, args.calls);
    if (game.status !== "PLAYING" || !isCurrentForge(fighter, args.forgeToken)) return null;
    await clearForgeStream(ctx, fighter._id);
    const forge = fighter.forge;
    const done = {
      partial: undefined,
      partialPlan: undefined,
      rejection: undefined,
      failure: undefined,
    };
    const outcome = args.outcome;

    if (outcome.kind === "FORGE") {
      const champion = parseChampion(outcome.champion);
      if (champion) {
        const upgrade = isUpgradeKind(forge?.kind) && fighter.champion !== undefined;
        await ctx.db.patch("slopFightFighters", fighter._id, {
          ...done,
          status: "READY",
          champion,
          ...(upgrade ? { previous: fighter.champion } : {}),
          version: forge?.version ?? fighter.version,
          readyAt: Date.now(),
        });
        // The stage reveals it now; the phase holds for that and is re-checked when it ends.
        await settleAfterReveals(ctx, game, await loadFighters(ctx, game._id));
      } else {
        await ctx.db.patch("slopFightFighters", fighter._id, {
          ...done,
          status: "FAILED",
          failure: "invalid-output",
        });
      }
    } else if (outcome.kind === "REJECT" && canRetryInPhase(forge?.kind, game.phase)) {
      await ctx.db.patch("slopFightFighters", fighter._id, {
        ...done,
        status: "REJECTED",
        rejection: normalizeRejection(outcome),
      });
    } else if (outcome.kind === "REJECT" && forge?.kind === "SUBMIT") {
      // Too late to try again: lenient mode must produce a champion.
      await startForge(ctx, fighter, lenientKind(fighter, 0), 0);
    } else if (outcome.kind === "REJECT" && isUpgradeKind(forge?.kind)) {
      // An addition refused after the clock ran out: the champion fights on unchanged.
      await keepChampion(ctx, fighter, forge?.version ?? fighter.version);
    } else {
      // A lenient or house forge never rejects; if the model does anyway, that is a failure.
      await ctx.db.patch("slopFightFighters", fighter._id, {
        ...done,
        status: "FAILED",
        failure: outcome.kind === "FAILED" ? outcome.failReason : "rejected",
      });
    }
    await settle(ctx, game._id);
    return null;
  },
});
