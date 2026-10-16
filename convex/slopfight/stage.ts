import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { findGameByCode, findGameByNumber } from "../roster";
import { CHAMPIONS } from "../../src/games/slopfight/constants";
import { championOf, findHype, loadFighters, MAX_FIGHTER_STROKE_ROWS } from "./data";
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
 * `gameNumber`). The game-wide cap covers every champion's full doodle on
 * every layer. Reading strokes directly avoids invalidation on forge/typing
 * changes to the fighter rows.
 */
export const strokes = query({
  args: { roomCode: v.string(), gameNumber: v.optional(v.number()) },
  returns: v.array(v.object({ id: v.id("slopFightStrokes"), ...strokeBatchFields })),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode, args.gameNumber);
    if (!game) return [];
    const rows = await ctx.db
      .query("slopFightStrokes")
      .withIndex("by_gameId_and_fighterId", (index) => index.eq("gameId", game._id))
      .take(CHAMPIONS * MAX_FIGHTER_STROKE_ROWS);
    rows.sort((a, b) => a.fighterId.localeCompare(b.fighterId) || a.layer - b.layer || a.seq - b.seq);
    return rows.map((row) => ({
      id: row._id,
      fighterId: row.fighterId,
      layer: row.layer,
      seq: row.seq,
      strokes: row.strokes,
    }));
  },
});

/** Only the live stage needs crowd pulses; room views keep the final snapshot. */
export const hype = query({
  args: { roomCode: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      fightId: v.id("slopFightFights"),
      hype: v.object({ A: v.number(), B: v.number() }),
    }),
  ),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode, undefined);
    if (!game || game.status !== "PLAYING" || game.phase !== "FIGHT") return null;
    const crowd = await findHype(ctx, game._id, game.round, game.step);
    return crowd ? { fightId: crowd.fightId, hype: crowd.hype } : null;
  },
});

function foundryEntry(fighter: Doc<"slopFightFighters">, stream?: Doc<"slopFightForgeStreams">) {
  return {
    id: fighter._id,
    slot: fighter.slot,
    ownerId: fighter.ownerId,
    status: fighter.status,
    forge: fighter.forge ?? null,
    /** The streamed parts so far, while forging. */
    partial: fighter.status === "FORGING" && stream?.forgeToken === fighter.forgeToken ? stream.parts : [],
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
    const [fighters, streams] = await Promise.all([
      loadFighters(ctx, game._id),
      ctx.db
        .query("slopFightForgeStreams")
        .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
        .take(CHAMPIONS),
    ]);
    return fighters.map((fighter) => foundryEntry(fighter, streams.find((stream) => stream.fighterId === fighter._id)));
  },
});
