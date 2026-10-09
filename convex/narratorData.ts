import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { requireHost } from "./capabilities";

export const authorizeSpeech = internalQuery({
  args: { capability: v.string() },
  returns: v.object({ gameId: v.id("games"), voice: v.string() }),
  handler: async (ctx, args) => {
    const { game } = await requireHost(ctx, args.capability);
    if (game.gameType !== "SLOPLASH") {
      throw new ConvexError("This game mode does not support narrator");
    }
    if (game.ttsMode !== "ON") throw new ConvexError("Narrator not enabled");
    if (game.status !== "PLAYING") {
      throw new ConvexError("Narrator is not available in the current phase");
    }
    return { gameId: game._id, voice: game.ttsVoice };
  },
});
