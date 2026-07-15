"use node";

import { v } from "convex/values";
import { generateJoke as generateChatJoke } from "../src/games/ai-chat-showdown/ai";
import { generateJoke as generateSloplashJoke } from "../src/games/sloplash/ai";
import { internalAction } from "./_generated/server";
import { requireAiGatewayApiKey } from "./aiGateway";
import {
  cancelResponseJobRef,
  claimResponseJobRef,
  finishResponseJobRef,
  loadResponseContextRef,
  persistResponseRef,
} from "./aiGenerationContracts";

const responseWorkArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  roundId: v.id("rounds"),
  roundNumber: v.number(),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

export const generateResponse = internalAction({
  args: responseWorkArgsValidator,
  returns: v.object({
    status: v.union(
      v.literal("SUCCEEDED"),
      v.literal("FAILED"),
      v.literal("CANCELED"),
      v.literal("SKIPPED"),
    ),
    persistedResponses: v.number(),
    duplicateResponses: v.number(),
  }),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(claimResponseJobRef, args);
    if (claim.status !== "CLAIMED") {
      return {
        status: claim.status === "CANCELED" ? ("CANCELED" as const) : ("SKIPPED" as const),
        persistedResponses: 0,
        duplicateResponses: 0,
      };
    }

    const context = await ctx.runQuery(loadResponseContextRef, args);
    if (context.kind === "stale") {
      await ctx.runMutation(cancelResponseJobRef, { ...args, reason: context.reason });
      return { status: "CANCELED" as const, persistedResponses: 0, duplicateResponses: 0 };
    }

    const apiKey = requireAiGatewayApiKey();
    let persistedResponses = 0;
    let duplicateResponses = 0;
    for (const prompt of context.prompts) {
      const generated =
        context.gameType === "SLOPLASH"
          ? await generateSloplashJoke(context.modelId, prompt.text, apiKey, context.history)
          : await generateChatJoke(context.modelId, prompt.text, apiKey);
      const persisted = await ctx.runMutation(persistResponseRef, {
        ...args,
        promptId: prompt.promptId,
        text: generated.text,
        failReason: generated.failReason,
        usage: generated.usage,
      });
      if (persisted.status === "STALE") {
        await ctx.runMutation(cancelResponseJobRef, { ...args, reason: persisted.reason });
        return {
          status: "CANCELED" as const,
          persistedResponses,
          duplicateResponses,
        };
      }
      if (persisted.status === "INSERTED") persistedResponses += 1;
      else duplicateResponses += 1;
    }

    const finished = await ctx.runMutation(finishResponseJobRef, args);
    return {
      status: finished.status,
      persistedResponses,
      duplicateResponses,
    };
  },
});
