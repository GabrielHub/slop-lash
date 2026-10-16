import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePlayer } from "./capabilities";
import { TUTORIAL_CHOICES, TUTORIAL_DURATION_MS } from "../src/tutorial/durations";

/**
 * A phone's answer to the how-to-play video's practice question. The first
 * tap locks it, like a real answer; it counts for nothing.
 */
export const pick = mutation({
  args: { capability: v.string(), choice: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    const startedAt = game.tutorialStartedAt;
    if (game.status !== "LOBBY" || startedAt === undefined) {
      throw new ConvexError("The video isn't playing");
    }
    if (Date.now() > startedAt + TUTORIAL_DURATION_MS[game.gameType]) {
      throw new ConvexError("The video is over");
    }
    const choices = TUTORIAL_CHOICES[game.gameType];
    if (choices === undefined) throw new ConvexError("This video has no question");
    if (!Number.isInteger(args.choice) || args.choice < 0 || args.choice >= choices) {
      throw new ConvexError("Pick one of the answers");
    }
    if (player.tutorialPick?.startedAt === startedAt) return null;
    await ctx.db.patch("players", player._id, {
      tutorialPick: { startedAt, choice: args.choice },
    });
    return null;
  },
});
