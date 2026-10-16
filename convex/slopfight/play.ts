import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { requireHost, requirePlayer } from "../capabilities";
import { enterPhase, settle } from "../engine";
import {
  DESCRIBE_TEXT_MAX,
  UPGRADE_TEXT_MAX,
} from "../../src/games/slopfight/constants";
import {
  isBlankDoodle,
  layerRoom,
  StrokeBatchSchema,
  strokePointCount,
  type Stroke,
} from "../../src/games/slopfight/strokes";
import { sanitize } from "../../src/lib/sanitize";
import {
  clearForgeStream,
  currentFight,
  faceOffOpensAt,
  findBet,
  findForgeStream,
  findHype,
  findOwnFighter,
  loadFighterStrokeRows,
  retryForges as restartForges,
  startForge,
  type Fighter,
} from "./data";
import { foundryWatchdog, isParked } from "./mode";
import {
  fightSideValidator,
  inputKindValidator,
  strokeBatchFields,
  type InputKind,
} from "./tables";
import { forgePartTarget } from "./view";

// SlopFight's player and host mutations, guarded like SlopLash's: a seat, the
// right game and phase, inputs checked against the current state, idempotent
// where a retry could double up, and `settle` last when the write can finish
// the phase.

/** The stage's typing shimmer needs no more than one keystroke stamp this often. */
export const TYPING_THROTTLE_MS = 3_000;
/** Hype taps one call may carry (phones coalesce them). */
export const HYPE_MAX_PER_CALL = 20;
/** Stroke rows one layer can hold (a batch carries at least one stroke). */
const MAX_LAYER_ROWS = 512;

const BLANK_REJECTION = {
  reason: "The canvas is blank. The Foundry needs something to forge.",
  suggestion: "Draw your champion. A blob with eyes counts.",
};

async function requireSeat(ctx: MutationCtx, capability: string) {
  const { game, player } = await requirePlayer(ctx, capability);
  if (game.gameType !== "SLOPFIGHT" || game.status !== "PLAYING") {
    throw new ConvexError("The fight night is not running");
  }
  return { game, player };
}

async function myFighter(ctx: MutationCtx, game: Doc<"games">, playerId: Id<"players">) {
  const fighter = await findOwnFighter(ctx, game._id, playerId);
  if (!fighter) throw new ConvexError("You don't have a champion in this game");
  return fighter;
}

/** Whether the owner can still change their Build input (not yet forging or forged). */
const drafting = (fighter: Fighter) => fighter.status !== "FORGING" && fighter.status !== "READY";

/** Whether the owner can still change this round's upgrade. */
const upgrading = (fighter: Fighter, round: number) =>
  fighter.version < round && fighter.status !== "FORGING";

/** The fighter whose canvas `layer` is open for drawing right now. */
async function drawingFighter(ctx: MutationCtx, capability: string, layer: number) {
  const { game, player } = await requireSeat(ctx, capability);
  const fighter = await myFighter(ctx, game, player._id);
  if (game.phase === "BUILD" && layer === 0) {
    if (!drafting(fighter)) throw new ConvexError("Your champion is already in the Foundry");
    return { game, fighter };
  }
  if (game.phase === "UPGRADE" && layer === game.round) {
    if (!upgrading(fighter, game.round)) throw new ConvexError("Your upgrade is already in");
    return { game, fighter };
  }
  throw new ConvexError("Drawing time is over");
}

async function lastRow(ctx: MutationCtx, fighterId: Id<"slopFightFighters">, layer: number) {
  return ctx.db
    .query("slopFightStrokes")
    .withIndex("by_fighterId_and_layer_and_seq", (index) =>
      index.eq("fighterId", fighterId).eq("layer", layer),
    )
    .order("desc")
    .first();
}

async function layerRows(ctx: MutationCtx, fighterId: Id<"slopFightFighters">, layer: number) {
  return ctx.db
    .query("slopFightStrokes")
    .withIndex("by_fighterId_and_layer_and_seq", (index) =>
      index.eq("fighterId", fighterId).eq("layer", layer),
    )
    .take(MAX_LAYER_ROWS);
}

async function layerStrokes(ctx: MutationCtx, fighterId: Id<"slopFightFighters">, layer: number) {
  return (await layerRows(ctx, fighterId, layer)).flatMap((row) => row.strokes as Stroke[]);
}

/**
 * A submit's signature: the kind, then the sanitized text or the drawing's
 * revision (its last stroke row: any new stroke, undo or clear changes it).
 */
async function submitSignature(
  ctx: MutationCtx,
  fighterId: Id<"slopFightFighters">,
  layer: number,
  kind: InputKind,
  text: string,
) {
  if (kind === "DESCRIBE") return `DESCRIBE:${text}`;
  const last = await lastRow(ctx, fighterId, layer);
  return `DRAW:${layer}:${last ? `${last.seq}:${last.total}` : "empty"}`;
}

/** The player's own forge of exactly this input is still running, so a resubmit changes nothing. */
const alreadyForging = (
  fighter: Fighter,
  kind: "SUBMIT" | "UPGRADE",
  version: number,
  signature: string,
) =>
  fighter.status === "FORGING" &&
  fighter.forge?.kind === kind &&
  fighter.forge.version === version &&
  fighter.forgeInput === signature;

export const chooseInput = mutation({
  args: { capability: v.string(), kind: inputKindValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requireSeat(ctx, args.capability);
    if (game.phase !== "BUILD") throw new ConvexError("Build time is over");
    const fighter = await myFighter(ctx, game, player._id);
    if (!drafting(fighter)) throw new ConvexError("Your champion is already in the Foundry");
    await ctx.db.patch("slopFightFighters", fighter._id, {
      inputKind: args.kind,
      status: args.kind === "DRAW" ? "DRAWING" : "DESCRIBING",
    });
    return null;
  },
});

/** One finished batch of strokes (at most 4 a second). A retried batch is a no-op. */
export const addStrokes = mutation({
  args: {
    capability: v.string(),
    layer: v.number(),
    seq: v.number(),
    strokes: v.array(v.object({ c: v.number(), w: v.number(), p: v.array(v.number()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.seq) || args.seq < 0) throw new ConvexError("Bad stroke batch");
    const parsed = StrokeBatchSchema.safeParse(args.strokes);
    if (!parsed.success) throw new ConvexError("Those strokes don't fit on the canvas");
    const { game, fighter } = await drawingFighter(ctx, args.capability, args.layer);
    const existing = await ctx.db
      .query("slopFightStrokes")
      .withIndex("by_fighterId_and_layer_and_seq", (index) =>
        index.eq("fighterId", fighter._id).eq("layer", args.layer).eq("seq", args.seq),
      )
      .unique();
    if (existing) return null;
    const last = await lastRow(ctx, fighter._id, args.layer);
    // The phone serializes batches. A new row must append: inserting before
    // the cumulative totals would undercount the layer and bypass its cap.
    if (last && args.seq <= last.seq) throw new ConvexError("That stroke batch is out of order");
    // The last row's running totals are the whole layer's, so the cap never re-reads it.
    const total = last?.total ?? 0;
    // A row saved before `points` existed: count the layer once.
    const points = last ? (last.points ?? strokePointCount(await layerStrokes(ctx, fighter._id, args.layer))) : 0;
    const room = layerRoom(total, points);
    // Keep the whole submitted batch or reject it: a partial save would make
    // the phone's optimistic drawing disagree with what the Foundry receives.
    const strokes = parsed.data;
    const added = strokePointCount(strokes);
    if (strokes.length > room.strokes || added > room.points) {
      throw new ConvexError("The canvas is full. Undo a stroke or clear it to make room");
    }
    await ctx.db.insert("slopFightStrokes", {
      gameId: game._id,
      fighterId: fighter._id,
      layer: args.layer,
      seq: args.seq,
      strokes,
      total: total + strokes.length,
      points: points + added,
    });
    // The first stroke picks the drawing input; later batches never touch the fighter row.
    if (args.layer === 0 && fighter.status !== "DRAWING") {
      await ctx.db.patch("slopFightFighters", fighter._id, {
        inputKind: "DRAW",
        status: "DRAWING",
      });
    }
    return null;
  },
});

/** Removes the last stroke on a layer. */
export const undoStroke = mutation({
  args: { capability: v.string(), layer: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { fighter } = await drawingFighter(ctx, args.capability, args.layer);
    const row = await lastRow(ctx, fighter._id, args.layer);
    if (!row) return null;
    if (row.strokes.length <= 1) {
      await ctx.db.delete("slopFightStrokes", row._id);
    } else {
      const removed = strokePointCount(row.strokes.slice(-1));
      await ctx.db.patch("slopFightStrokes", row._id, {
        strokes: row.strokes.slice(0, -1),
        total: row.total - 1,
        points: row.points === undefined ? undefined : row.points - removed,
      });
    }
    return null;
  },
});

export const clearStrokes = mutation({
  args: { capability: v.string(), layer: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { fighter } = await drawingFighter(ctx, args.capability, args.layer);
    for (const row of await layerRows(ctx, fighter._id, args.layer)) {
      await ctx.db.delete("slopFightStrokes", row._id);
    }
    return null;
  },
});

/**
 * A keystroke in the describe box, for the stage's typing shimmer (throttled).
 * The stamp goes in its own small row (only stage.typing reads it); the
 * fighter row changes once, when the first keystroke picks the describe input.
 */
export const setTyping = mutation({
  args: { capability: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requireSeat(ctx, args.capability);
    if (game.phase !== "BUILD" && game.phase !== "UPGRADE") return null;
    const fighter = await myFighter(ctx, game, player._id);
    const now = Date.now();
    const stamp = await ctx.db
      .query("slopFightTyping")
      .withIndex("by_gameId_and_fighterId", (index) =>
        index.eq("gameId", game._id).eq("fighterId", fighter._id),
      )
      .unique();
    if (stamp && now - stamp.at < TYPING_THROTTLE_MS) return null;
    if (stamp) await ctx.db.patch("slopFightTyping", stamp._id, { at: now });
    else await ctx.db.insert("slopFightTyping", { gameId: game._id, fighterId: fighter._id, at: now });
    if (game.phase === "BUILD" && drafting(fighter) && fighter.status !== "DESCRIBING") {
      await ctx.db.patch("slopFightFighters", fighter._id, {
        inputKind: "DESCRIBE",
        status: "DESCRIBING",
      });
    }
    return null;
  },
});

/**
 * Sends the champion to the Foundry: the description, or the strokes already
 * on the server. Also the retry after a rejection or a failure, for as long as
 * Build lasts; a changed submit supersedes a forge still in flight, and the
 * same input again (a double tap, a retried call) leaves it running.
 */
export const submitChampion = mutation({
  args: { capability: v.string(), kind: inputKindValidator, text: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requireSeat(ctx, args.capability);
    if (game.phase !== "BUILD") throw new ConvexError("Build time is over");
    const fighter = await myFighter(ctx, game, player._id);
    if (fighter.status === "READY") throw new ConvexError("Your champion is already forged");
    const text = args.kind === "DESCRIBE" ? sanitize(args.text ?? "", DESCRIBE_TEXT_MAX) : "";
    if (args.kind === "DESCRIBE" && !text) throw new ConvexError("Describe your champion first");
    const signature = await submitSignature(ctx, fighter._id, 0, args.kind, text);
    if (alreadyForging(fighter, "SUBMIT", 0, signature)) return null;
    if (args.kind === "DESCRIBE") {
      await ctx.db.patch("slopFightFighters", fighter._id, { inputKind: "DESCRIBE", text });
    } else {
      await ctx.db.patch("slopFightFighters", fighter._id, { inputKind: "DRAW" });
      if (isBlankDoodle(await layerStrokes(ctx, fighter._id, 0))) {
        // Nothing readable: rejected on the spot, no model call needed.
        await clearForgeStream(ctx, fighter._id);
        await ctx.db.patch("slopFightFighters", fighter._id, {
          status: "REJECTED",
          rejection: BLANK_REJECTION,
          partial: undefined,
        });
        return null;
      }
    }
    const fresh = (await ctx.db.get("slopFightFighters", fighter._id))!;
    await startForge(ctx, fresh, "SUBMIT", 0, signature);
    return null;
  },
});

/** "Add one thing": a short text or the strokes on this round's layer. */
export const submitUpgrade = mutation({
  args: { capability: v.string(), kind: inputKindValidator, text: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requireSeat(ctx, args.capability);
    if (game.phase !== "UPGRADE") throw new ConvexError("Upgrade time is over");
    const fighter = await myFighter(ctx, game, player._id);
    // A forge still in flight is superseded; a finished upgrade is final.
    if (fighter.version >= game.round) throw new ConvexError("Your upgrade is already in");
    let text = "";
    if (args.kind === "DESCRIBE") {
      text = sanitize(args.text ?? "", UPGRADE_TEXT_MAX);
      if (!text) throw new ConvexError("Add something first");
    }
    // The same addition again while it forges is a no-op; a changed one supersedes it.
    const signature = await submitSignature(ctx, fighter._id, game.round, args.kind, text);
    if (alreadyForging(fighter, "UPGRADE", game.round, signature)) return null;
    if (args.kind === "DRAW" && isBlankDoodle(await layerStrokes(ctx, fighter._id, game.round))) {
      throw new ConvexError("Draw your addition first");
    }
    await ctx.db.patch("slopFightFighters", fighter._id, {
      addition: { round: game.round, kind: args.kind, text },
    });
    const fresh = (await ctx.db.get("slopFightFighters", fighter._id))!;
    await startForge(ctx, fresh, "UPGRADE", game.round, signature);
    return null;
  },
});

/** One bet per player on the fight in the face-off, changeable until it closes. */
export const placeBet = mutation({
  args: { capability: v.string(), fightId: v.id("slopFightFights"), side: fightSideValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requireSeat(ctx, args.capability);
    if (game.phase !== "FACE_OFF") throw new ConvexError("Bets are closed");
    const fight = await currentFight(ctx, game);
    if (!fight || fight._id !== args.fightId) throw new ConvexError("That fight is not up");
    const existing = await findBet(ctx, fight._id, player._id);
    if (existing?.side === args.side) return null;
    if (existing) await ctx.db.patch("slopFightBets", existing._id, { side: args.side });
    else {
      await ctx.db.insert("slopFightBets", {
        gameId: game._id,
        fightId: fight._id,
        playerId: player._id,
        side: args.side,
      });
    }
    // The face-off can't end before its minimum, and a ping settles it then:
    // bets before it skip the roster and fight reads of a settle.
    if (Date.now() >= faceOffOpensAt(game)) await settle(ctx, game._id);
    return null;
  },
});

/**
 * Hype from a non-owner during the fight: a counter for the crowd and the
 * confetti, worth no points. It cheers the side given, else the side the
 * player bet on, else the underdog.
 */
export const hype = mutation({
  args: { capability: v.string(), count: v.number(), side: v.optional(fightSideValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requireSeat(ctx, args.capability);
    if (game.phase !== "FIGHT") return null;
    const crowd = await findHype(ctx, game._id, game.round, game.step);
    if (!crowd) return null;
    if (crowd.owners.A === player._id || crowd.owners.B === player._id) {
      throw new ConvexError("Owners can't hype their own fight");
    }
    const count = Math.min(HYPE_MAX_PER_CALL, Math.max(0, Math.floor(args.count)));
    if (!Number.isFinite(count) || count === 0) return null;
    const bet = args.side === undefined ? await findBet(ctx, crowd.fightId, player._id) : null;
    const side = args.side ?? bet?.side ?? (crowd.hype.A <= crowd.hype.B ? "A" : "B");
    await ctx.db.patch("slopFightHype", crowd._id, {
      hype: { ...crowd.hype, [side]: crowd.hype[side] + count },
    });
    return null;
  },
});

/**
 * The host's forge retry, in the Foundry only: failed forges (and stuck ones)
 * run again, leniently, and the watchdog restarts, un-parking it. Elsewhere it
 * is a no-op: in BUILD and UPGRADE a failed forge is the player's to resubmit
 * and the deadline forges it leniently anyway, and later phases have nothing
 * to forge. (A tap that races the Foundry closing lands here too.)
 */
export const retryForges = mutation({
  args: { capability: v.string() },
  returns: v.object({ restarted: v.number() }),
  handler: async (ctx, args) => {
    const { game } = await requireHost(ctx, args.capability);
    if (game.gameType !== "SLOPFIGHT" || game.status !== "PLAYING") {
      throw new ConvexError("The fight night is not running");
    }
    if (game.phase !== "FOUNDRY") return { restarted: 0 };
    const restarted = await restartForges(ctx, game, isParked(game));
    if (restarted > 0) await enterPhase(ctx, game, foundryWatchdog());
    return { restarted };
  },
});

/**
 * The caller's own stroke rows in this game, for the phone to restore its
 * canvas after a reload or a reconnect: every layer, or only those up to
 * `layer` (the canvas and the underlay below it). Never anyone else's.
 */
export const myStrokes = query({
  args: { capability: v.string(), layer: v.optional(v.number()) },
  returns: v.array(v.object(strokeBatchFields)),
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPFIGHT") return [];
    const fighter = await findOwnFighter(ctx, game._id, player._id);
    if (!fighter) return [];
    const rows = await loadFighterStrokeRows(ctx, fighter._id, args.layer);
    return rows.map((row) => ({
      fighterId: row.fighterId,
      layer: row.layer,
      seq: row.seq,
      strokes: row.strokes,
    }));
  },
});

/** The owner's live count without reading champion sheets or the shared room view. */
export const myForgeProgress = query({
  args: { capability: v.string(), fighterId: v.id("slopFightFighters") },
  returns: v.union(v.null(), v.object({ streamed: v.number(), target: v.number() })),
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPFIGHT" || game.status !== "PLAYING") return null;
    const stream = await findForgeStream(ctx, args.fighterId);
    if (!stream || stream.gameId !== game._id || stream.ownerId !== player._id) return null;
    return {
      streamed: stream.parts.length,
      target: forgePartTarget(stream.parts.length, stream.bodyPlan ?? null, stream.previousParts),
    };
  },
});

/** Re-checks a phase at a time it may complete without new input (the face-off minimum). */
export const settlePing = internalMutation({
  args: { gameId: v.id("games"), phaseGeneration: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.status !== "PLAYING" || game.phaseGeneration !== args.phaseGeneration) {
      return null;
    }
    await settle(ctx, game._id);
    return null;
  },
});
