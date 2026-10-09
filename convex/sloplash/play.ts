import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requirePlayer } from "../capabilities";
import { settle } from "../engine";
import {
  findResponse,
  findVote,
  insertReaction,
  insertResponse,
  insertVote,
  loadCurrentRound,
  responsesFor,
} from "../rounds";
import { votablePrompts } from "./mode";
import { MAX_ANSWER_LENGTH, isForfeitMarker } from "../../src/games/core/constants";
import { sanitize } from "../../src/lib/sanitize";
import { isValidReactionEmoji } from "../../src/lib/reactions";

export const submitResponse = mutation({
  args: { capability: v.string(), promptId: v.id("prompts"), text: v.string() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPLASH" || game.phase !== "WRITING") {
      throw new ConvexError("Writing time is over");
    }
    const text = sanitize(args.text, MAX_ANSWER_LENGTH);
    if (!text) throw new ConvexError("Write something first");
    if (isForfeitMarker(text)) throw new ConvexError("That answer is not allowed");

    const prompt = await ctx.db.get("prompts", args.promptId);
    const round = prompt ? await ctx.db.get("rounds", prompt.roundId) : null;
    if (!prompt || !round || round.gameId !== game._id || round.roundNumber !== game.round) {
      throw new ConvexError("That prompt is not in this round");
    }
    if (!prompt.assigneeIds.includes(player._id)) {
      throw new ConvexError("That prompt is not yours");
    }
    // Resubmitting the same prompt (a retry after a flaky network) is a no-op.
    if (await findResponse(ctx, prompt._id, player._id)) return;
    await insertResponse(ctx, prompt, player._id, text);
    await settle(ctx, game._id);
  },
});

export const castVote = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    /** Null passes without picking either answer. */
    responseId: v.union(v.id("responses"), v.null()),
  },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPLASH" || game.phase !== "VOTING") {
      throw new ConvexError("Voting is closed");
    }
    const bundle = await loadCurrentRound(ctx, game);
    const prompt = bundle ? votablePrompts(bundle)[game.step] : undefined;
    if (!bundle || !prompt || prompt._id !== args.promptId) {
      throw new ConvexError("Voting moved on to another matchup");
    }
    if (prompt.assigneeIds.includes(player._id)) {
      throw new ConvexError("You can't vote on your own matchup");
    }
    if (
      args.responseId !== null &&
      !responsesFor(bundle, prompt._id).some((response) => response._id === args.responseId)
    ) {
      throw new ConvexError("That answer is not in this matchup");
    }
    if (await findVote(ctx, prompt._id, player._id)) return;
    await insertVote(ctx, prompt, player._id, args.responseId);
    await settle(ctx, game._id);
  },
});

/** Toggles a reaction on an answer in the matchup on screen. */
export const react = mutation({
  args: { capability: v.string(), responseId: v.id("responses"), emoji: v.string() },
  handler: async (ctx, args) => {
    if (!isValidReactionEmoji(args.emoji)) throw new ConvexError("Unknown reaction");
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.phase !== "VOTING" && game.phase !== "REVEAL") {
      throw new ConvexError("Reactions open during voting");
    }
    const response = await ctx.db.get("responses", args.responseId);
    const round = response ? await ctx.db.get("rounds", response.roundId) : null;
    if (!response || !round || round.gameId !== game._id || round.roundNumber !== game.round) {
      throw new ConvexError("That answer is not on screen");
    }
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_responseId_and_playerId_and_emoji", (index) =>
        index.eq("responseId", response._id).eq("playerId", player._id).eq("emoji", args.emoji),
      )
      .unique();
    if (existing) {
      await ctx.db.delete("reactions", existing._id);
      return;
    }
    await insertReaction(ctx, response, player._id, args.emoji);
  },
});
