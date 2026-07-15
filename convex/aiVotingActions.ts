"use node";

import { v } from "convex/values";
import { aiVote as generateSloplashVote } from "../src/games/sloplash/ai";
import {
  aiVoteNWay as generateChatslopVote,
  LABELS,
  simpleHash,
} from "../src/games/ai-chat-showdown/ai";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { requireAiGatewayApiKey } from "./aiGateway";
import {
  cancelVoteJobRef,
  claimVoteJobRef,
  finishVoteJobRef,
  loadVoteContextRef,
  persistVoteRef,
  type VoteReaction,
  type VoteUsage,
} from "./aiVotingContracts";

const voteWorkArgsValidator = {
  jobId: v.id("generationJobs"),
  gameId: v.id("games"),
  roundId: v.id("rounds"),
  promptId: v.id("prompts"),
  roundNumber: v.number(),
  phaseGeneration: v.number(),
  attempt: v.number(),
};

export const generateVote = internalAction({
  args: voteWorkArgsValidator,
  returns: v.object({
    status: v.union(
      v.literal("SUCCEEDED"),
      v.literal("FAILED"),
      v.literal("CANCELED"),
      v.literal("SKIPPED"),
    ),
    persistedVote: v.boolean(),
    duplicateVote: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(claimVoteJobRef, args);
    if (claim.status !== "CLAIMED") {
      return {
        status: claim.status === "CANCELED" ? ("CANCELED" as const) : ("SKIPPED" as const),
        persistedVote: false,
        duplicateVote: false,
      };
    }

    const context = await ctx.runQuery(loadVoteContextRef, args);
    if (context.kind === "stale") {
      await ctx.runMutation(cancelVoteJobRef, { ...args, reason: context.reason });
      return { status: "CANCELED" as const, persistedVote: false, duplicateVote: false };
    }
    if (context.alreadyVoted) {
      const finished = await ctx.runMutation(finishVoteJobRef, args);
      return { status: finished.status, persistedVote: false, duplicateVote: true };
    }

    const apiKey = requireAiGatewayApiKey();
    let responseId: Id<"responses"> | null = null;
    let failReason: string | null = null;
    let reactions: VoteReaction[] = [];
    let usage: VoteUsage;

    if (context.gameType === "SLOPLASH") {
      const [responseA, responseB] = context.candidates;
      if (!responseA || !responseB) throw new Error("Slop-Lash vote requires two responses");
      const generated = await generateSloplashVote(
        context.modelId,
        context.promptText,
        responseA.text,
        responseB.text,
        apiKey,
      );
      responseId =
        generated.choice === "A"
          ? responseA.responseId
          : generated.choice === "B"
            ? responseB.responseId
            : null;
      failReason = generated.failReason;
      reactions = [
        ...generated.reactionsA.map((emoji) => ({ responseId: responseA.responseId, emoji })),
        ...generated.reactionsB.map((emoji) => ({ responseId: responseB.responseId, emoji })),
      ];
      usage = generated.usage;
    } else {
      const labeledResponses = context.candidates.map((candidate, index) => ({
        id: candidate.responseId,
        label: LABELS[index] ?? String(index),
        text: candidate.text,
      }));
      const generated = await generateChatslopVote(
        context.modelId,
        context.promptText,
        labeledResponses,
        simpleHash(`${args.gameId}:${args.roundNumber}:${context.playerId}`),
        { apiKey },
      );
      responseId =
        context.candidates.find((candidate) => candidate.responseId === generated.chosenResponseId)
          ?.responseId ?? null;
      failReason = responseId ? generated.failReason : (generated.failReason ?? "invalid-choice");
      usage = generated.usage;
    }

    const persisted = await ctx.runMutation(persistVoteRef, {
      ...args,
      responseId,
      failReason,
      reactions,
      usage,
    });
    if (persisted.status === "STALE") {
      await ctx.runMutation(cancelVoteJobRef, { ...args, reason: persisted.reason });
      return { status: "CANCELED" as const, persistedVote: false, duplicateVote: false };
    }

    const finished = await ctx.runMutation(finishVoteJobRef, args);
    return {
      status: finished.status,
      persistedVote: persisted.status === "INSERTED",
      duplicateVote: persisted.status === "DUPLICATE",
    };
  },
});
