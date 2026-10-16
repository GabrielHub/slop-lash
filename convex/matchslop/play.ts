import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requirePlayer } from "../capabilities";
import { settle } from "../engine";
import { findResponse, findVote, insertResponse, insertVote, isForfeit } from "../rounds";
import { loadCurrentPrompt, loadState, validOpenerPromptId } from "./mode";
import { isForfeitMarker } from "../../src/games/core/constants";
import { cleanLine } from "../../src/games/matchslop/rules";

export const submitResponse = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    text: v.string(),
    /** Which profile prompt (or the photo, once it exists) an opener answers; round 1 only. */
    openerPromptId: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "MATCHSLOP" || game.phase !== "WRITING") {
      throw new ConvexError("Writing time is over");
    }
    const text = cleanLine(args.text);
    if (!text) throw new ConvexError("Write something first");
    if (isForfeitMarker(text)) throw new ConvexError("That message is not allowed");

    const prompt = await loadCurrentPrompt(ctx, game);
    if (!prompt || prompt._id !== args.promptId) {
      throw new ConvexError("That prompt is not in this round");
    }
    if (!prompt.assigneeIds.includes(player._id)) {
      throw new ConvexError("You joined after this round started");
    }
    let opener: string | undefined;
    if (game.round === 1) {
      const state = await loadState(ctx, game._id);
      opener =
        validOpenerPromptId(
          state.profile,
          args.openerPromptId,
          state.portrait?.status === "READY",
        ) ?? undefined;
      if (!opener) throw new ConvexError("Pick which part of their profile you're replying to");
    }
    if (await findResponse(ctx, prompt._id, player._id)) return null;
    await insertResponse(ctx, prompt, player._id, text, opener);
    await settle(ctx, game._id);
    return null;
  },
});

export const castVote = mutation({
  args: { capability: v.string(), promptId: v.id("prompts"), responseId: v.id("responses") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    if (game.gameType !== "MATCHSLOP" || game.phase !== "VOTING") {
      throw new ConvexError("Voting is closed");
    }
    const prompt = await loadCurrentPrompt(ctx, game);
    if (!prompt || prompt._id !== args.promptId) {
      throw new ConvexError("Voting moved on");
    }
    const choice = await ctx.db.get("responses", args.responseId);
    if (!choice || choice.promptId !== prompt._id || isForfeit(choice)) {
      throw new ConvexError("That message is not on the ballot");
    }
    if (choice.playerId === player._id) throw new ConvexError("You can't vote for yourself");
    if (await findVote(ctx, prompt._id, player._id)) return null;
    await insertVote(ctx, prompt, player._id, choice._id);
    await settle(ctx, game._id);
    return null;
  },
});
