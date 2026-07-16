import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { requireHostCapability } from "./capabilities";

export const authorizeSpeech = internalQuery({
  args: { capability: v.string() },
  returns: v.object({ gameId: v.id("games"), voice: v.string() }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    if (authorized.game.gameType !== "SLOPLASH") {
      throw new ConvexError("This game mode does not support narrator");
    }
    if (authorized.game.ttsMode !== "ON") {
      throw new ConvexError("Narrator not enabled");
    }
    if (authorized.game.status === "LOBBY" || authorized.game.status === "FINAL_RESULTS") {
      throw new ConvexError("Narrator is not available in the current phase");
    }
    return { gameId: authorized.game._id, voice: authorized.game.ttsVoice };
  },
});
