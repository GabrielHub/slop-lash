import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
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
import { castStagedBallot as castStaged, votingMatchup } from "./mode";
import { MAX_ANSWER_LENGTH, isForfeitMarker } from "../../src/games/core/constants";
import { sanitize } from "../../src/lib/sanitize";
import { isValidReactionEmoji } from "../../src/lib/reactions";
import { capAnswer } from "../../src/games/sloplash/answer";
import { REACTION_STRIP, SLOPLASH_MAX_ANSWER } from "../../src/games/sloplash/game-constants";

export const submitResponse = mutation({
  args: { capability: v.string(), promptId: v.id("prompts"), text: v.string() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPLASH" || game.phase !== "WRITING") {
      throw new ConvexError("Writing time is over");
    }
    const text = capAnswer(sanitize(args.text, MAX_ANSWER_LENGTH), SLOPLASH_MAX_ANSWER);
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
    responseId: v.id("responses"),
  },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPLASH" || game.phase !== "VOTING") {
      throw new ConvexError("Voting is closed");
    }
    const bundle = await loadCurrentRound(ctx, game);
    const prompt = bundle ? votingMatchup(game, bundle)?.prompt : undefined;
    if (!bundle || !prompt || prompt._id !== args.promptId) {
      throw new ConvexError("Voting moved on to another matchup");
    }
    if (prompt.assigneeIds.includes(player._id)) {
      throw new ConvexError("You can't vote on your own matchup");
    }
    if (!responsesFor(bundle, prompt._id).some((response) => response._id === args.responseId)) {
      throw new ConvexError("That answer is not in this matchup");
    }
    if (await findVote(ctx, prompt._id, player._id)) return;
    await insertVote(ctx, prompt, player._id, args.responseId);
    await settle(ctx, game._id);
  },
});

/**
 * Adds a reaction to the answer the player voted for, while the matchup is
 * being voted on. Add-only: sending the same reaction again is a no-op, so a
 * player sends each reaction at most once per matchup.
 */
export const react = mutation({
  args: { capability: v.string(), responseId: v.id("responses"), emoji: v.string() },
  handler: async (ctx, args) => {
    if (
      !isValidReactionEmoji(args.emoji) ||
      !(REACTION_STRIP as readonly string[]).includes(args.emoji)
    ) {
      throw new ConvexError("Unknown reaction");
    }
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "SLOPLASH" || game.phase !== "VOTING") {
      throw new ConvexError("Reactions open during voting");
    }
    const bundle = await loadCurrentRound(ctx, game);
    const prompt = bundle ? votingMatchup(game, bundle)?.prompt : undefined;
    const response =
      bundle && prompt
        ? responsesFor(bundle, prompt._id).find((r) => r._id === args.responseId)
        : undefined;
    if (!prompt || !response) throw new ConvexError("That answer is not on screen");
    if (prompt.assigneeIds.includes(player._id)) {
      throw new ConvexError("You can't react to your own matchup");
    }
    const vote = await findVote(ctx, prompt._id, player._id);
    if (vote?.responseId !== args.responseId) throw new ConvexError("Vote first");
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_responseId_and_playerId_and_emoji", (index) =>
        index.eq("responseId", response._id).eq("playerId", player._id).eq("emoji", args.emoji),
      )
      .unique();
    if (existing) return;
    await insertReaction(ctx, response, player._id, args.emoji);
  },
});

/**
 * Casts a staged AI ballot a few seconds into its matchup's VOTING phase.
 * Dropped when the phase has moved on: closing the vote already cast it.
 */
export const castStagedBallot = internalMutation({
  args: { ballotId: v.id("sloplashBallots"), phaseGeneration: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ballot = await ctx.db.get("sloplashBallots", args.ballotId);
    if (!ballot) return null;
    const game = await ctx.db.get("games", ballot.gameId);
    if (!game || game.status !== "PLAYING" || game.phaseGeneration !== args.phaseGeneration) {
      return null;
    }
    const bundle = await loadCurrentRound(ctx, game);
    const prompt = bundle ? votingMatchup(game, bundle)?.prompt : undefined;
    if (!prompt || prompt._id !== ballot.promptId) return null;
    await castStaged(ctx, prompt, ballot);
    await settle(ctx, game._id);
    return null;
  },
});
