import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import { findGameByCode } from "../roster";
import { CHAMPIONS } from "../../src/games/slopfight/constants";
import { findHype, loadFighterStrokeRows } from "./data";
import { partValidator, strokeBatchFields } from "./tables";

// The stage's own subscriptions (build plan decision 5): the heavy, fast-moving
// data that stays out of `views.room`, so phones drawing at 4 Hz, forges
// streaming parts and players typing never resend the room view to every
// client. Like `views.watch`, they take the room code: a TV watches without a
// seat. They carry only what the shared screen shows anyway, and each reads
// its own small table, never the fighter rows and their champion sheets.

async function stageGame(ctx: QueryCtx, roomCode: string) {
  const game = await findGameByCode(ctx, roomCode);
  return game?.gameType === "SLOPFIGHT" ? game : null;
}

/**
 * One champion's stroke batches, every layer, in layer then seq order, for
 * its easel. The stage subscribes once per fighter, so a batch re-reads and
 * resends only its drawer's rows, never the other three doodles.
 */
export const strokes = query({
  args: { roomCode: v.string(), fighterId: v.id("slopFightFighters") },
  returns: v.array(v.object({ id: v.id("slopFightStrokes"), ...strokeBatchFields })),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode);
    if (!game) return [];
    const rows = await loadFighterStrokeRows(ctx, args.fighterId);
    return rows
      .filter((row) => row.gameId === game._id)
      .map((row) => ({
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
    const game = await stageGame(ctx, args.roomCode);
    if (!game || game.status !== "PLAYING" || game.phase !== "FIGHT") return null;
    const crowd = await findHype(ctx, game._id, game.round, game.step);
    return crowd ? { fightId: crowd.fightId, hype: crowd.hype } : null;
  },
});

/**
 * The parts each forge has streamed so far. A stream row exists only while
 * its fighter forges: starting a forge replaces it and landing one deletes
 * it, and a superseded forge's late parts never reach it, so the rows alone
 * are current. Status and the finished sheet come from the room view, which
 * the same transaction updates.
 */
export const forges = query({
  args: { roomCode: v.string() },
  returns: v.array(v.object({ fighterId: v.id("slopFightFighters"), parts: v.array(partValidator) })),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode);
    if (!game || game.status !== "PLAYING") return [];
    const streams = await ctx.db
      .query("slopFightForgeStreams")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(CHAMPIONS);
    return streams.map((stream) => ({ fighterId: stream.fighterId, parts: stream.parts }));
  },
});

/** Each describer's last keystroke (server time), for the easels' typing shimmer. */
export const typing = query({
  args: { roomCode: v.string() },
  returns: v.array(v.object({ fighterId: v.id("slopFightFighters"), at: v.number() })),
  handler: async (ctx, args) => {
    const game = await stageGame(ctx, args.roomCode);
    if (!game || game.status !== "PLAYING" || (game.phase !== "BUILD" && game.phase !== "UPGRADE")) {
      return [];
    }
    const rows = await ctx.db
      .query("slopFightTyping")
      .withIndex("by_gameId_and_fighterId", (index) => index.eq("gameId", game._id))
      .take(CHAMPIONS);
    return rows.map((row) => ({ fighterId: row.fighterId, at: row.at }));
  },
});
