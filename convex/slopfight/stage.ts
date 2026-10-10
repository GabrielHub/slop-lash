import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { findGameByCode, findGameByNumber } from "../roster";
import { championOf, loadFighters, loadGameStrokeRows } from "./data";
import {
  championValidator,
  fighterStatusValidator,
  forgeValidator,
  partValidator,
  strokeBatchFields,
} from "./tables";

// The stage's own subscriptions (build plan decision 5): the heavy, fast-moving
// data that stays out of `views.room`, so phones drawing at 4 Hz and forges
// streaming parts never resend the room view to every client. Like
// `views.watch`, they take the room code: a TV watches without a seat. Both
// carry only what the shared screen shows anyway.

async function stageGame(ctx: QueryCtx, roomCode: string, gameNumber: number | undefined) {
  const game =
    gameNumber === undefined
      ? await findGameByCode(ctx, roomCode)
      : await findGameByNumber(ctx, roomCode, gameNumber);
  return game?.gameType === "SLOPFIGHT" ? game : null;
}

/**
 * Every stroke batch of the game, for the easels (and the recap with
 * `gameNumber`): each fighter's rows in slot order, then layer and seq. Read
 * per fighter, each capped to cover a full doodle on every layer.
 */
export const strokes = query({
  args: { roomCode: v.string(), gameNumber: v.optional(v.number()) },
  returns: v.array(v.object({ id: v.id("slopFightStrokes"), ...strokeBatchFields })),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode, args.gameNumber);
    if (!game) return [];
    const rows = await loadGameStrokeRows(ctx, await loadFighters(ctx, game._id));
    return rows.map((row) => ({
      id: row._id,
      fighterId: row.fighterId,
      layer: row.layer,
      seq: row.seq,
      strokes: row.strokes,
    }));
  },
});

function foundryEntry(fighter: Doc<"slopFightFighters">) {
  return {
    id: fighter._id,
    slot: fighter.slot,
    ownerId: fighter.ownerId,
    status: fighter.status,
    forge: fighter.forge ?? null,
    /** The streamed parts so far, while forging. */
    partial: fighter.status === "FORGING" ? (fighter.partial ?? []) : [],
    champion: championOf(fighter),
    previous: fighter.previous ?? null,
    version: fighter.version,
    failure: fighter.status === "FAILED" ? (fighter.failure ?? "failed") : null,
  };
}

/** Each fighter's forge as it grows: status, streamed parts, and the finished sheet. */
export const foundry = query({
  args: { roomCode: v.string() },
  returns: v.array(
    v.object({
      id: v.id("slopFightFighters"),
      slot: v.number(),
      ownerId: v.union(v.id("players"), v.null()),
      status: fighterStatusValidator,
      forge: v.union(forgeValidator, v.null()),
      partial: v.array(partValidator),
      champion: v.union(championValidator, v.null()),
      previous: v.union(championValidator, v.null()),
      version: v.number(),
      failure: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode, undefined);
    if (!game) return [];
    return (await loadFighters(ctx, game._id)).map(foundryEntry);
  },
});
