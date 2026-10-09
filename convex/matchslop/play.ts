import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requirePlayer } from "../capabilities";
import { settle } from "../engine";
import { findResponse, findVote, insertResponse, insertVote, isForfeit } from "../rounds";
import { loadCurrentRound } from "../rounds";
import { loadState, validOpenerPromptId } from "./mode";
import { MAX_ANSWER_LENGTH, isForfeitMarker } from "../../src/games/core/constants";
import { sanitize } from "../../src/lib/sanitize";

export const submitResponse = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    text: v.string(),
    /** Which profile prompt (or the photo) an opener answers; round 1 only. */
    openerPromptId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "MATCHSLOP" || game.phase !== "WRITING") {
      throw new ConvexError("Writing time is over");
    }
    const text = sanitize(args.text, MAX_ANSWER_LENGTH);
    if (!text) throw new ConvexError("Write something first");
    if (isForfeitMarker(text)) throw new ConvexError("That message is not allowed");

    const bundle = await loadCurrentRound(ctx, game);
    const prompt = bundle?.prompts[0];
    if (!prompt || prompt._id !== args.promptId) {
      throw new ConvexError("That prompt is not in this round");
    }
    if (!prompt.assigneeIds.includes(player._id)) {
      throw new ConvexError("You joined after this round started");
    }
    let opener: string | undefined;
    if (game.round === 1) {
      const state = await loadState(ctx, game._id);
      opener = validOpenerPromptId(state.profile, args.openerPromptId) ?? undefined;
      if (!opener) throw new ConvexError("Pick which part of their profile you're replying to");
    }
    if (await findResponse(ctx, prompt._id, player._id)) return;
    await insertResponse(ctx, prompt, player._id, text, opener);
    await settle(ctx, game._id);
  },
});

export const castVote = mutation({
  args: { capability: v.string(), promptId: v.id("prompts"), responseId: v.id("responses") },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "MATCHSLOP" || game.phase !== "VOTING") {
      throw new ConvexError("Voting is closed");
    }
    const bundle = await loadCurrentRound(ctx, game);
    const prompt = bundle?.prompts[0];
    if (!bundle || !prompt || prompt._id !== args.promptId) {
      throw new ConvexError("Voting moved on");
    }
    const choice = bundle.responses.find((response) => response._id === args.responseId);
    if (!choice || isForfeit(choice)) throw new ConvexError("That message is not on the ballot");
    if (choice.playerId === player._id) throw new ConvexError("You can't vote for yourself");
    if (await findVote(ctx, prompt._id, player._id)) return;
    await insertVote(ctx, prompt, player._id, choice._id);
    await settle(ctx, game._id);
  },
});
