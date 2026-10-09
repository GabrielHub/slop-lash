import { v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { roomPresence } from "./components";
import { DISPOSABLE_GAME_TYPES } from "./modes";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Lobbies nobody started. */
export const STALE_LOBBY_MS = 2 * HOUR_MS;
/** Games that stopped moving. The engine normally finishes these on its own. */
export const STALE_GAME_MS = 6 * HOUR_MS;
/** Finished rooms of modes that do not keep recaps. */
export const FINISHED_RETENTION_MS = HOUR_MS;

const CANDIDATES_PER_SWEEP = 16;
const DELETE_BATCH = 64;

/** Every table that hangs off a game, with an index whose first field is `gameId`. */
const GAME_TABLES = [
  ["playerSessions", "by_gameId"],
  ["players", "by_gameId"],
  ["rounds", "by_gameId_and_roundNumber"],
  ["prompts", "by_gameId"],
  ["responses", "by_gameId"],
  ["votes", "by_gameId"],
  ["reactions", "by_gameId"],
  ["generationJobs", "by_gameId_and_key"],
  ["gameModelUsage", "by_gameId_and_modelId"],
  ["winnerTaglines", "by_gameId_and_phaseGeneration"],
  ["matchSlopState", "by_gameId"],
  ["matchSlopMessages", "by_gameId_and_turn"],
  ["quizSlopSeats", "by_gameId_and_playerId"],
  ["quizSlopRounds", "by_gameId_and_ordinal"],
  ["quizSlopAnswers", "by_gameId_and_ordinal_and_playerId"],
  ["quizSlopCalls", "by_gameId_and_ordinal_and_callerId"],
  ["quizSlopHouseVotes", "by_gameId_and_voterId"],
] as const satisfies readonly (readonly [TableNames, string])[];

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const idle = (status: "LOBBY" | "PLAYING", olderThanMs: number) =>
      ctx.db
        .query("games")
        .withIndex("by_status_and_updatedAt", (index) =>
          index.eq("status", status).lt("updatedAt", now - olderThanMs),
        )
        .take(CANDIDATES_PER_SWEEP);
    const batches = await Promise.all([
      idle("LOBBY", STALE_LOBBY_MS),
      idle("PLAYING", STALE_GAME_MS),
      ...DISPOSABLE_GAME_TYPES.map((gameType) =>
        ctx.db
          .query("games")
          .withIndex("by_gameType_and_status_and_finishedAt", (index) =>
            index
              .eq("gameType", gameType)
              .eq("status", "FINISHED")
              .lt("finishedAt", now - FINISHED_RETENTION_MS),
          )
          .take(CANDIDATES_PER_SWEEP),
      ),
    ]);
    for (const game of batches.flat()) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deleteGame, { gameId: game._id });
    }
  },
});

/** Deletes a game and everything under it, a batch at a time, resuming at the table it reached. */
export const deleteGame = internalMutation({
  args: { gameId: v.id("games"), fromTable: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let budget = DELETE_BATCH;
    for (let position = args.fromTable ?? 0; position < GAME_TABLES.length; position += 1) {
      const [table, index] = GAME_TABLES[position]!;
      // Every listed index starts with `gameId`, which the casts rely on.
      // oxlint-disable-next-line typescript/no-explicit-any -- one loop over differently-typed tables
      const rows = await (ctx.db.query(table) as any)
        // oxlint-disable-next-line typescript/no-explicit-any -- see above
        .withIndex(index, (q: any) => q.eq("gameId", args.gameId))
        .take(budget);
      for (const row of rows as { _id: Id<TableNames> }[]) {
        await ctx.db.delete(table, row._id as never);
      }
      budget -= rows.length;
      if (budget <= 0) {
        await ctx.scheduler.runAfter(0, internal.cleanup.deleteGame, {
          gameId: args.gameId,
          fromTable: position,
        });
        return;
      }
    }
    await roomPresence.removeRoom(ctx, args.gameId);
    const game = await ctx.db.get("games", args.gameId);
    if (game) await ctx.db.delete("games", game._id);
  },
});
