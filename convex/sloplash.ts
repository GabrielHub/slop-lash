import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { requireHostCapability, requirePlayerCapability } from "./capabilities";
import {
  endSloplashEarly,
  forceAdvanceSloplash,
  getVotableSloplashPrompts,
  loadSloplashRound,
  settleSloplashQuorum,
  type SloplashAdvanceResult,
} from "./sloplashEngine";
import { sanitize } from "../src/lib/sanitize";
import { isForfeitMarker } from "../src/games/core/constants";
import { requireExpectedPhaseGeneration } from "./gamePhase";

const advanceResultValidator = v.union(
  v.literal("FINAL_RESULTS"),
  v.literal("ROUND_RESULTS"),
  v.literal("VOTING"),
  v.literal("VOTING_SUBPHASE"),
  v.literal("WRITING"),
  v.null(),
);

function requireActiveHuman(player: {
  participationStatus: "ACTIVE" | "DISCONNECTED";
  type: "AI" | "HUMAN" | "SPECTATOR";
}): void {
  if (player.type !== "HUMAN") {
    throw new ConvexError("Only human players can perform this action");
  }
  if (player.participationStatus !== "ACTIVE") {
    throw new ConvexError("Disconnected players cannot perform this action");
  }
}

export const submitResponse = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    text: v.string(),
  },
  returns: v.object({
    phase: advanceResultValidator,
    responseId: v.id("responses"),
  }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    if (authorized.game.gameType !== "SLOPLASH") {
      throw new ConvexError("This action is only available for Slop-Lash");
    }
    if (authorized.game.status !== "WRITING") {
      throw new ConvexError("Game not in writing phase");
    }
    requireActiveHuman(authorized.player);

    const text = sanitize(args.text, 200);
    if (!text) throw new ConvexError("Response text cannot be empty");
    if (isForfeitMarker(text)) throw new ConvexError("Response text is not allowed");
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) =>
        index.eq("gameId", authorized.game._id).eq("roundNumber", authorized.game.currentRound),
      )
      .unique();
    const prompt = await ctx.db.get("prompts", args.promptId);
    if (
      !round ||
      !prompt ||
      prompt.gameId !== authorized.game._id ||
      prompt.roundId !== round._id
    ) {
      throw new ConvexError("Prompt is not from the current round");
    }
    const assignment = await ctx.db
      .query("promptAssignments")
      .withIndex("by_promptId_and_playerId", (index) =>
        index.eq("promptId", prompt._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (!assignment) throw new ConvexError("You are not assigned to this prompt");
    const existing = await ctx.db
      .query("responses")
      .withIndex("by_promptId_and_playerId", (index) =>
        index.eq("promptId", prompt._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (existing) throw new ConvexError("Already responded to this prompt");

    const now = Date.now();
    const responseId = await ctx.db.insert("responses", {
      gameId: authorized.game._id,
      roundId: round._id,
      promptId: prompt._id,
      playerId: authorized.player._id,
      text,
      pointsEarned: 0,
      submittedAt: now,
    });
    const phase = await settleSloplashQuorum(ctx, authorized.game, now);
    return { phase, responseId };
  },
});

export const castVote = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    responseId: v.union(v.id("responses"), v.null()),
  },
  returns: v.object({
    phase: advanceResultValidator,
    voteId: v.id("votes"),
  }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    if (authorized.game.gameType !== "SLOPLASH") {
      throw new ConvexError("This action is only available for Slop-Lash");
    }
    if (authorized.game.status !== "VOTING") {
      throw new ConvexError("Game not in voting phase");
    }
    if (authorized.game.votingRevealing) {
      throw new ConvexError("Voting is paused during reveal");
    }
    requireActiveHuman(authorized.player);

    const bundle = await loadSloplashRound(ctx, authorized.game._id, authorized.game.currentRound);
    const currentPrompt = bundle
      ? getVotableSloplashPrompts(bundle)[authorized.game.votingPromptIndex]
      : null;
    if (!bundle || !currentPrompt || currentPrompt._id !== args.promptId) {
      throw new ConvexError("Not the current prompt");
    }
    const responses = bundle.responses.filter(
      (response) => response.promptId === currentPrompt._id,
    );
    const selectedResponse = args.responseId
      ? responses.find((response) => response._id === args.responseId)
      : null;
    if (args.responseId && !selectedResponse) {
      throw new ConvexError("Response does not belong to this prompt");
    }
    if (selectedResponse?.playerId === authorized.player._id) {
      throw new ConvexError("Cannot vote for your own response");
    }
    if (responses.some((response) => response.playerId === authorized.player._id)) {
      throw new ConvexError("Cannot vote on a prompt you responded to");
    }
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_promptId_and_voterId", (index) =>
        index.eq("promptId", currentPrompt._id).eq("voterId", authorized.player._id),
      )
      .unique();
    if (existing) throw new ConvexError("Already voted on this prompt");

    const now = Date.now();
    const voteId = await ctx.db.insert("votes", {
      gameId: authorized.game._id,
      roundId: bundle.round._id,
      promptId: currentPrompt._id,
      voterId: authorized.player._id,
      ...(selectedResponse ? { responseId: selectedResponse._id } : {}),
      castAt: now,
    });
    const phase = await settleSloplashQuorum(ctx, authorized.game, now);
    return { phase, voteId };
  },
});

export const advance = mutation({
  args: { capability: v.string(), expectedPhaseGeneration: v.number() },
  returns: v.object({ phase: advanceResultValidator }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    if (authorized.game.gameType !== "SLOPLASH") {
      throw new ConvexError("This action is only available for Slop-Lash");
    }
    requireExpectedPhaseGeneration(
      authorized.game.phaseGeneration,
      args.expectedPhaseGeneration,
    );
    const phase = await forceAdvanceSloplash(ctx, authorized.game, Date.now());
    if (!phase) throw new ConvexError("Cannot advance from current phase");
    return { phase };
  },
});

export const end = mutation({
  args: { capability: v.string() },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    const result = await endSloplashEarly(ctx, authorized.game, Date.now());
    if (result === "INVALID") {
      throw new ConvexError("Cannot end game in current state");
    }
    return { success: true as const };
  },
});

/** Called by generation workers after a response or current-prompt vote settles. */
export const settleQuorum = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.object({ phase: advanceResultValidator }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game) return { phase: null };
    return { phase: await settleSloplashQuorum(ctx, game, Date.now()) };
  },
});

/** Guarded scheduler target; stale phase/deadline invocations are harmless no-ops. */
export const enforceDeadline = internalMutation({
  args: {
    deadline: v.number(),
    gameId: v.id("games"),
    phaseGeneration: v.number(),
  },
  returns: v.object({
    advanced: v.boolean(),
    phase: advanceResultValidator,
  }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (
      !game ||
      game.gameType !== "SLOPLASH" ||
      game.phaseGeneration !== args.phaseGeneration ||
      game.phaseDeadline !== args.deadline ||
      args.deadline > Date.now()
    ) {
      return { advanced: false, phase: null };
    }
    const phase: SloplashAdvanceResult | null = await forceAdvanceSloplash(ctx, game, Date.now());
    return { advanced: phase !== null, phase };
  },
});
