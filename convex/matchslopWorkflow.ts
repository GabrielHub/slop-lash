import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { gameWorkflow } from "./components";
import {
  claimImageRef,
  claimPostMortemRef,
  claimProfileRef,
  claimReplyRef,
  claimResponseRef,
  claimVoteRef,
  generateImageRef,
  generatePostMortemRef,
  generateProfileRef,
  generateReplyRef,
  generateResponseRef,
  generateVoteRef,
  persistImageRef,
  persistPostMortemRef,
  persistProfileRef,
  persistReplyRef,
  persistResponseRef,
  persistVoteRef,
} from "./matchslopContracts";
import {
  ensureCurrentDeadlineScheduled,
  queueAiResponseWorkflows,
  startProfileWorkflow,
} from "./matchslopJobs";
import { getMatchSlopState } from "./matchslopData";
import { readMatchSlopRuntimeState } from "./matchslopState";

const workflowArgs = {
  gameId: v.id("games"),
  jobId: v.id("generationJobs"),
};

const retryTransientActions = {
  maxAttempts: 3,
  initialBackoffMs: 500,
  base: 2,
} as const;

export const profilePipeline = gameWorkflow
  .define({ args: workflowArgs, returns: v.string() })
  .handler(async (step, args): Promise<string> => {
    const context = await step.runMutation(claimProfileRef, args, { name: "claim-profile" });
    if (context.kind === "stale") return "CANCELED";
    const generated = await step.runAction(
      generateProfileRef,
      { context },
      { name: "generate-profile", retry: retryTransientActions },
    );
    const persisted = await step.runMutation(
      persistProfileRef,
      { ...args, ...generated },
      { name: "persist-profile" },
    );
    return persisted.status;
  });

export const imagePipeline = gameWorkflow
  .define({ args: workflowArgs, returns: v.string() })
  .handler(async (step, args): Promise<string> => {
    const context = await step.runMutation(claimImageRef, args, { name: "claim-image" });
    if (context.kind === "stale") return "CANCELED";
    const generated = await step.runAction(
      generateImageRef,
      { context },
      { name: "generate-image", retry: retryTransientActions },
    );
    const persisted = await step.runMutation(
      persistImageRef,
      { ...args, ...generated },
      { name: "persist-image" },
    );
    return persisted.status;
  });

export const responsePipeline = gameWorkflow
  .define({ args: workflowArgs, returns: v.string() })
  .handler(async (step, args): Promise<string> => {
    const context = await step.runMutation(claimResponseRef, args, { name: "claim-response" });
    if (context.kind === "stale") return "CANCELED";
    const generated = await step.runAction(
      generateResponseRef,
      { context },
      { name: "generate-response", retry: retryTransientActions },
    );
    const persisted = await step.runMutation(
      persistResponseRef,
      { ...args, ...generated },
      { name: "persist-response" },
    );
    return persisted.status;
  });

export const votePipeline = gameWorkflow
  .define({ args: workflowArgs, returns: v.string() })
  .handler(async (step, args): Promise<string> => {
    const context = await step.runMutation(claimVoteRef, args, { name: "claim-vote" });
    if (context.kind === "stale") return "CANCELED";
    const generated = await step.runAction(
      generateVoteRef,
      { context },
      { name: "generate-vote", retry: retryTransientActions },
    );
    const persisted = await step.runMutation(
      persistVoteRef,
      { ...args, ...generated },
      { name: "persist-vote" },
    );
    return persisted.status;
  });

export const replyPipeline = gameWorkflow
  .define({ args: workflowArgs, returns: v.string() })
  .handler(async (step, args): Promise<string> => {
    const context = await step.runMutation(claimReplyRef, args, { name: "claim-persona-reply" });
    if (context.kind === "stale") return "CANCELED";
    const generated = await step.runAction(
      generateReplyRef,
      { context },
      { name: "generate-persona-reply", retry: retryTransientActions },
    );
    const persisted = await step.runMutation(
      persistReplyRef,
      { ...args, ...generated },
      { name: "persist-persona-reply" },
    );
    return persisted.status;
  });

export const postMortemPipeline = gameWorkflow
  .define({ args: workflowArgs, returns: v.string() })
  .handler(async (step, args): Promise<string> => {
    const context = await step.runMutation(claimPostMortemRef, args, {
      name: "claim-postmortem",
    });
    if (context.kind === "stale") return "CANCELED";
    const generated = await step.runAction(
      generatePostMortemRef,
      { context },
      { name: "generate-postmortem", retry: retryTransientActions },
    );
    const persisted = await step.runMutation(
      persistPostMortemRef,
      { ...args, ...generated },
      { name: "persist-postmortem" },
    );
    return persisted.status;
  });

export const startProfilePipeline = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.object({ started: v.boolean(), workflowId: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => startProfileWorkflow(ctx, args.gameId),
});

/** Runs after lobby start so the first durable pipeline sees committed game state. */
export const startGamePipelines = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.object({ profileStarted: v.boolean(), responseJobs: v.number() }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.gameType !== "MATCHSLOP" || game.status !== "WRITING") {
      return { profileStarted: false, responseJobs: 0 };
    }
    const state = await getMatchSlopState(ctx, game._id);
    await ensureCurrentDeadlineScheduled(ctx, game);
    if (!readMatchSlopRuntimeState(state).profile) {
      const profile = await startProfileWorkflow(ctx, game._id);
      return { profileStarted: profile.started, responseJobs: 0 };
    }
    return {
      profileStarted: false,
      responseJobs: await queueAiResponseWorkflows(ctx, game),
    };
  },
});
