"use node";

import { v } from "convex/values";
import { generateWinnerTagline } from "../src/games/sloplash/ai";
import { calculateCostUsd } from "../src/lib/models";
import { internalAction } from "./_generated/server";
import { requireAiGatewayApiKey } from "./aiGateway";
import {
  claimWinnerTaglineJobRef,
  persistWinnerTaglineRef,
  type WinnerTaglineGenerationContext,
  type WinnerTaglineUsage,
} from "./winnerTaglineContracts";

const workArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  leaderId: v.id("players"),
  gameStatus: v.union(v.literal("ROUND_RESULTS"), v.literal("FINAL_RESULTS")),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

function buildWinnerContext(context: WinnerTaglineGenerationContext): string {
  const scoreboard = context.scoreboard
    .map((player, index) => `${index + 1}. ${player.name} (${player.type}) - ${player.score} pts`)
    .join("\n");
  const jokes = context.jokes
    .map(
      (joke) =>
        `Round ${joke.roundNumber}: Prompt: "${joke.prompt}" -> Your answer: "${joke.answer}"`,
    )
    .join("\n");
  return `Scores:\n${scoreboard}\n\nYour jokes this ${context.isFinal ? "game" : "round"}:\n${jokes || "(none)"}`;
}

export async function generateWinnerTaglineForContext(
  context: WinnerTaglineGenerationContext,
  apiKey: string,
): Promise<{ text: string; usage: WinnerTaglineUsage }> {
  const generation = generateWinnerTagline(
    context.modelId,
    context.leaderName,
    context.isFinal,
    buildWinnerContext(context),
    () => undefined,
    apiKey,
  );
  const [text, rawUsage] = await Promise.all([generation.text, generation.usage]);
  const inputTokens = rawUsage.inputTokens ?? 0;
  const outputTokens = rawUsage.outputTokens ?? 0;
  return {
    text,
    usage: {
      modelId: context.modelId,
      inputTokens,
      outputTokens,
      costUsd: calculateCostUsd(context.modelId, inputTokens, outputTokens),
    },
  };
}

export const executeWinnerTagline = internalAction({
  args: workArgsValidator,
  returns: v.object({
    status: v.union(
      v.literal("SUCCEEDED"),
      v.literal("FAILED"),
      v.literal("CANCELED"),
      v.literal("SKIPPED"),
    ),
    tagline: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(claimWinnerTaglineJobRef, args);
    if (claim.status !== "CLAIMED") {
      return {
        status: claim.status === "CANCELED" ? ("CANCELED" as const) : ("SKIPPED" as const),
        tagline: null,
      };
    }

    const generated = await generateWinnerTaglineForContext(
      claim.context,
      requireAiGatewayApiKey(),
    );
    const persisted = await ctx.runMutation(persistWinnerTaglineRef, {
      ...args,
      text: generated.text,
      usage: generated.usage,
    });
    if (persisted.status === "SUCCEEDED") {
      return { status: "SUCCEEDED" as const, tagline: persisted.tagline };
    }
    return {
      status: persisted.status === "IGNORED" ? ("SKIPPED" as const) : persisted.status,
      tagline: null,
    };
  },
});
