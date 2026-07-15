import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { requireHostCapability, requirePlayerCapability } from "./capabilities";
import { restartPersonaWorkflow } from "./matchslopJobs";
import {
  castHumanVote,
  endMatchSlop,
  forceAdvanceMatchSlop,
  settleMatchSlopQuorum,
  submitHumanResponse,
} from "./matchslopRoundEngine";

const phaseValidator = v.union(
  v.literal("FINAL_RESULTS"),
  v.literal("ROUND_RESULTS"),
  v.literal("VOTING"),
  v.literal("WRITING"),
  v.null(),
);

function requireMatchSlop(gameType: string): void {
  if (gameType !== "MATCHSLOP") {
    throw new ConvexError("This action is only available for MatchSlop");
  }
}

export const submitResponse = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    text: v.string(),
    selectedPromptId: v.union(v.string(), v.null()),
  },
  returns: v.object({ phase: phaseValidator, responseId: v.id("responses") }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    requireMatchSlop(authorized.game.gameType);
    return submitHumanResponse(ctx, {
      game: authorized.game,
      player: authorized.player,
      promptId: args.promptId,
      text: args.text,
      selectedPromptId: args.selectedPromptId,
    });
  },
});

export const castVote = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    responseId: v.union(v.id("responses"), v.null()),
  },
  returns: v.object({ phase: phaseValidator, voteId: v.id("votes") }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    requireMatchSlop(authorized.game.gameType);
    return castHumanVote(ctx, {
      game: authorized.game,
      player: authorized.player,
      promptId: args.promptId,
      responseId: args.responseId,
    });
  },
});

export const advance = mutation({
  args: { capability: v.string() },
  returns: v.object({ phase: phaseValidator }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    requireMatchSlop(authorized.game.gameType);
    const phase = await forceAdvanceMatchSlop(ctx, authorized.game, Date.now());
    if (!phase) throw new ConvexError("Cannot advance from current phase");
    return { phase };
  },
});

export const end = mutation({
  args: { capability: v.string() },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    requireMatchSlop(authorized.game.gameType);
    await endMatchSlop(ctx, authorized.game, Date.now());
    return { success: true as const };
  },
});

export const managePersona = mutation({
  args: {
    capability: v.string(),
    action: v.union(v.literal("generate"), v.literal("skip")),
  },
  returns: v.object({
    started: v.boolean(),
    workflowId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    requireMatchSlop(authorized.game.gameType);
    return restartPersonaWorkflow(ctx, authorized.game, args.action);
  },
});

/** Called after a durable AI competitor step persists. */
export const settleQuorum = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.object({ phase: phaseValidator }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.gameType !== "MATCHSLOP") return { phase: null };
    return { phase: await settleMatchSlopQuorum(ctx, game, Date.now()) };
  },
});

export const enforceDeadline = internalMutation({
  args: {
    gameId: v.id("games"),
    deadline: v.number(),
    phaseGeneration: v.number(),
  },
  returns: v.object({ advanced: v.boolean(), phase: phaseValidator }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (
      !game ||
      game.gameType !== "MATCHSLOP" ||
      game.phaseGeneration !== args.phaseGeneration ||
      game.phaseDeadline !== args.deadline ||
      Date.now() < args.deadline
    ) {
      return { advanced: false, phase: null };
    }
    const phase = await forceAdvanceMatchSlop(ctx, game, Date.now(), {
      allowReplyFallback: true,
    });
    return { advanced: phase !== null, phase };
  },
});
