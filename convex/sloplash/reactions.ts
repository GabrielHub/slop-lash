import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireViewer } from "../capabilities";
import { findGameByCode, loadPlayers } from "../roster";
import { MAX_PLAYERS, REACTION_STRIP } from "../../src/games/sloplash/game-constants";

/** Each player can send each emoji once per answer. */
export async function loadResponseReactions(ctx: QueryCtx, responseIds: Id<"responses">[]) {
  const batches = await Promise.all(
    responseIds.map((responseId) =>
      ctx.db
        .query("reactions")
        .withIndex("by_responseId_and_playerId_and_emoji", (index) =>
          index.eq("responseId", responseId),
        )
        .take(MAX_PLAYERS * REACTION_STRIP.length),
    ),
  );
  return batches.flat().toSorted((left, right) => left._creationTime - right._creationTime);
}

/** Anonymous human effects; this small feed is independent of the full room view. */
export const live = query({
  args: {
    roomCode: v.string(),
    phaseGeneration: v.number(),
    promptId: v.id("prompts"),
    capability: v.optional(v.string()),
  },
  returns: v.array(v.object({ id: v.id("reactions"), emoji: v.string(), mine: v.boolean() })),
  handler: async (ctx, args) => {
    const viewer = args.capability ? await requireViewer(ctx, args.capability) : null;
    const game = viewer?.game ?? (await findGameByCode(ctx, args.roomCode));
    if (
      !game ||
      game.roomCode !== args.roomCode ||
      game.gameType !== "SLOPLASH" ||
      game.status !== "PLAYING" ||
      game.phase !== "VOTING" ||
      game.phaseGeneration !== args.phaseGeneration
    )
      return [];
    const prompt = await ctx.db.get("prompts", args.promptId);
    if (!prompt || prompt.gameId !== game._id || prompt.scoredAt !== undefined) return [];
    const round = await ctx.db.get("rounds", prompt.roundId);
    if (!round || round.roundNumber !== game.round) return [];
    // Future matchups have no human reactions: the write path only accepts
    // the matchup on screen. Already revealed matchups are excluded above.
    const [responses, players] = await Promise.all([
      ctx.db
        .query("responses")
        .withIndex("by_promptId_and_playerId", (index) => index.eq("promptId", prompt._id))
        .take(2),
      loadPlayers(ctx, game._id),
    ]);
    const humanIds = new Set(
      players.filter((player) => player.type === "HUMAN").map((player) => player._id),
    );
    const reactions = await loadResponseReactions(
      ctx,
      responses.map((response) => response._id),
    );
    return reactions
      .filter((reaction) => humanIds.has(reaction.playerId))
      .map((reaction) => ({
        id: reaction._id,
        emoji: reaction.emoji,
        mine: reaction.playerId === viewer?.player?._id,
      }));
  },
});
