import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requirePlayerCapability } from "./capabilities";
import { getVotableSloplashPrompts } from "./sloplashEngine";

const MAX_PROMPTS = 16;
const MAX_RESPONSES = 128;

const reactionEmojiValidator = v.union(
  v.literal("laugh"),
  v.literal("fire"),
  v.literal("skull"),
  v.literal("clap"),
  v.literal("puke"),
  v.literal("sleep"),
  v.literal("eyes"),
  v.literal("hundred"),
  v.literal("target"),
  v.literal("clown"),
);

async function currentVotingPrompt(
  ctx: MutationCtx,
  game: Doc<"games">,
  round: Doc<"rounds">,
): Promise<Doc<"prompts"> | null> {
  const [prompts, responses] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_PROMPTS),
    ctx.db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_RESPONSES),
  ]);
  const orderedPrompts =
    game.gameType === "SLOPLASH"
      ? getVotableSloplashPrompts({ prompts, responses })
      : prompts.toSorted((left, right) => left.ordinal - right.ordinal);
  return orderedPrompts[game.votingPromptIndex] ?? null;
}

/** Toggle one authenticated player's reaction on a current-round response. */
export const toggle = mutation({
  args: {
    capability: v.string(),
    emoji: reactionEmojiValidator,
    responseId: v.id("responses"),
  },
  returns: v.object({ added: v.boolean() }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    if (authorized.game.gameType === "QUIZSLOP") {
      throw new ConvexError("Reactions are not available in QuizSlop");
    }
    if (authorized.player.participationStatus !== "ACTIVE") {
      throw new ConvexError("Disconnected players cannot react");
    }
    if (authorized.game.status !== "VOTING") {
      throw new ConvexError("Reactions are only allowed during voting");
    }

    const response = await ctx.db.get("responses", args.responseId);
    if (!response || response.gameId !== authorized.game._id) {
      throw new ConvexError("Response not found in this game");
    }
    const round = await ctx.db.get("rounds", response.roundId);
    if (
      !round ||
      round.gameId !== authorized.game._id ||
      round.roundNumber !== authorized.game.currentRound
    ) {
      throw new ConvexError("Response is not from the current round");
    }
    const votingPrompt = await currentVotingPrompt(ctx, authorized.game, round);
    if (!votingPrompt || response.promptId !== votingPrompt._id) {
      throw new ConvexError("Reactions are only allowed on the current voting prompt");
    }

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_responseId_and_playerId_and_emoji", (index) =>
        index
          .eq("responseId", response._id)
          .eq("playerId", authorized.player._id)
          .eq("emoji", args.emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete("reactions", existing._id);
      return { added: false };
    }

    await ctx.db.insert("reactions", {
      gameId: authorized.game._id,
      roundId: response.roundId,
      responseId: response._id,
      playerId: authorized.player._id,
      emoji: args.emoji,
      createdAt: Date.now(),
    });
    return { added: true };
  },
});
