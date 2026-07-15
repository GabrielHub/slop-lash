import { type WorkflowId } from "@convex-dev/workflow";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { gameWorkflow } from "./components";
import {
  completeWorkflowRef,
  enforceDeadlineRef,
  profilePipelineRef,
  responsePipelineRef,
  votePipelineRef,
  type MatchSlopJobStage,
  type Usage,
  type WorkflowJobArgs,
} from "./matchslopContracts";
import {
  canGenerateMatchSlopProfile,
  getMatchSlopState,
  isMatchSlopGame,
  listMatchSlopPlayers,
  loadMatchSlopRound,
} from "./matchslopData";
import { readMatchSlopRuntimeState } from "./matchslopState";
import { MATCHSLOP_PERSONA_EXAMPLES } from "../src/games/matchslop/config/persona-examples";
import { MATCHSLOP_PLAYER_EXAMPLES } from "../src/games/matchslop/config/player-examples";

type WorkflowKind =
  | "MATCHSLOP_IMAGE"
  | "MATCHSLOP_PERSONA_REPLY"
  | "MATCHSLOP_POST_MORTEM"
  | "MATCHSLOP_PROFILE"
  | "RESPONSE"
  | "VOTE";

type QueuedWorkflow = {
  created: boolean;
  job: Doc<"generationJobs">;
};

export function expectedMatchSlopGenerationKey(
  stage: "RESPONSE" | "VOTE",
  game: Doc<"games">,
  playerId: Id<"players">,
): string {
  return `matchslop:${stage.toLowerCase()}:${game.currentRound}:${game.phaseGeneration}:${playerId}`;
}

export function getMatchSlopDeadline(
  game: Doc<"games">,
  now: number,
  seconds: number,
): number | undefined {
  return game.timersDisabled ? undefined : now + seconds * 1_000;
}

export function getRemainingMatchSlopTimeout(deadline: number | undefined): number | null {
  return deadline === undefined ? null : Math.max(deadline - Date.now(), 1);
}

export async function scheduleMatchSlopDeadline(
  ctx: MutationCtx,
  args: { gameId: Id<"games">; deadline: number; phaseGeneration: number },
): Promise<void> {
  await ctx.scheduler.runAt(args.deadline, enforceDeadlineRef, args);
}

export async function ensureCurrentDeadlineScheduled(
  ctx: MutationCtx,
  game: Doc<"games">,
): Promise<void> {
  if (isMatchSlopGame(game) && game.phaseDeadline !== undefined) {
    await scheduleMatchSlopDeadline(ctx, {
      gameId: game._id,
      deadline: game.phaseDeadline,
      phaseGeneration: game.phaseGeneration,
    });
  }
}

export async function addMatchSlopUsage(
  ctx: MutationCtx,
  game: Doc<"games">,
  usage: Usage,
): Promise<void> {
  const existing = await ctx.db
    .query("gameModelUsage")
    .withIndex("by_gameId_and_modelId", (index) =>
      index.eq("gameId", game._id).eq("modelId", usage.modelId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch("gameModelUsage", existing._id, {
      inputTokens: existing.inputTokens + usage.inputTokens,
      outputTokens: existing.outputTokens + usage.outputTokens,
      costUsd: existing.costUsd + usage.costUsd,
    });
  } else {
    await ctx.db.insert("gameModelUsage", {
      gameId: game._id,
      modelId: usage.modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    });
  }
  await ctx.db.patch("games", game._id, {
    aiInputTokens: game.aiInputTokens + usage.inputTokens,
    aiOutputTokens: game.aiOutputTokens + usage.outputTokens,
    aiCostUsd: game.aiCostUsd + usage.costUsd,
  });
}

async function attachWorkflow(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  stage: MatchSlopJobStage,
  workflow: FunctionReference<"mutation", "internal", { args: WorkflowJobArgs }, string>,
): Promise<string> {
  if (job.workflowId) return job.workflowId;
  const workflowId = await gameWorkflow.start(
    ctx,
    workflow,
    { gameId: job.gameId, jobId: job._id },
    {
      startAsync: true,
      onComplete: completeWorkflowRef,
      context: { gameId: job.gameId, jobId: job._id, stage },
    },
  );
  await ctx.db.patch("generationJobs", job._id, { workflowId, updatedAt: Date.now() });
  return workflowId;
}

export async function queueMatchSlopWorkflow(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    generationKey: string;
    kind: WorkflowKind;
    stage: MatchSlopJobStage;
    targetId?: string;
    workflow: FunctionReference<"mutation", "internal", { args: WorkflowJobArgs }, string>;
  },
): Promise<QueuedWorkflow> {
  const existing = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", args.gameId).eq("generationKey", args.generationKey),
    )
    .unique();
  if (existing) {
    if (existing.status === "QUEUED" && !existing.workflowId) {
      await attachWorkflow(ctx, existing, args.stage, args.workflow);
      return {
        created: false,
        job: (await ctx.db.get("generationJobs", existing._id)) ?? existing,
      };
    }
    return { created: false, job: existing };
  }

  const now = Date.now();
  const jobId = await ctx.db.insert("generationJobs", {
    gameId: args.gameId,
    generationKey: args.generationKey,
    kind: args.kind,
    ...(args.targetId ? { targetId: args.targetId } : {}),
    status: "QUEUED",
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  });
  const job = await ctx.db.get("generationJobs", jobId);
  if (!job) throw new ConvexError("Failed to create MatchSlop generation job");
  await attachWorkflow(ctx, job, args.stage, args.workflow);
  return {
    created: true,
    job: (await ctx.db.get("generationJobs", job._id)) ?? job,
  };
}

export async function startProfileWorkflow(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<{ started: boolean; workflowId: string | null }> {
  const { job } = await queueMatchSlopWorkflow(ctx, {
    gameId,
    generationKey: "matchslop-profile",
    kind: "MATCHSLOP_PROFILE",
    stage: "PROFILE",
    workflow: profilePipelineRef,
  });
  if (job.status !== "QUEUED") {
    return { started: false, workflowId: job.workflowId ?? null };
  }
  const workflowId = await attachWorkflow(ctx, job, "PROFILE", profilePipelineRef);
  return { started: true, workflowId };
}

async function cancelProfileGenerationWorkflows(
  ctx: MutationCtx,
  gameId: Id<"games">,
  reason: string,
): Promise<void> {
  for (const status of ["QUEUED", "RUNNING"] as const) {
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_status", (index) => index.eq("gameId", gameId).eq("status", status))
      .take(16);
    for (const job of jobs) {
      if (job.kind !== "MATCHSLOP_PROFILE" && job.kind !== "MATCHSLOP_IMAGE") continue;
      await cancelMatchSlopJob(ctx, job, reason);
      if (job.workflowId) await gameWorkflow.cancel(ctx, job.workflowId as WorkflowId);
    }
  }
}

export async function restartPersonaWorkflow(
  ctx: MutationCtx,
  game: Doc<"games">,
  action: "generate" | "skip",
): Promise<{ started: boolean; workflowId: string | null }> {
  if (!isMatchSlopGame(game)) throw new ConvexError("This action is only available for MatchSlop");
  if (!canGenerateMatchSlopProfile(game)) {
    throw new ConvexError(
      "Persona can only be managed from the lobby or during round 1 profile recovery",
    );
  }
  const state = await getMatchSlopState(ctx, game._id);
  const runtime = readMatchSlopRuntimeState(state);
  if (game.status === "WRITING" && runtime.profile) {
    throw new ConvexError("A live MatchSlop profile cannot be replaced mid-round");
  }
  if (action === "generate" && runtime.profile) {
    return { started: false, workflowId: null };
  }
  if (action === "generate") {
    for (const status of ["QUEUED", "RUNNING"] as const) {
      const activeJobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", game._id).eq("status", status),
        )
        .take(16);
      const activeProfileJob = activeJobs.find((job) => job.kind === "MATCHSLOP_PROFILE");
      if (activeProfileJob) {
        return { started: false, workflowId: activeProfileJob.workflowId ?? null };
      }
    }
  }
  if (action === "generate" && runtime.profileGeneration.status === "STREAMING") {
    const jobId = runtime.profileGeneration.generationId
      ? ctx.db.normalizeId("generationJobs", runtime.profileGeneration.generationId)
      : null;
    const job = jobId ? await ctx.db.get("generationJobs", jobId) : null;
    return { started: false, workflowId: job?.workflowId ?? null };
  }

  await cancelProfileGenerationWorkflows(
    ctx,
    game._id,
    action === "skip" ? "Persona skipped by host" : "Persona generation restarted by host",
  );
  const personaPool = MATCHSLOP_PERSONA_EXAMPLES.filter(
    (example) => example.identity === state.personaIdentity,
  );
  const currentPersonaIndex = personaPool.findIndex(
    (example) => example.id === state.selectedPersonaExampleIds[0],
  );
  const personaIndex =
    action === "skip" && personaPool.length > 1
      ? (Math.max(currentPersonaIndex, 0) + 1) % personaPool.length
      : Math.max(currentPersonaIndex, 0);
  const selectedPersonaExampleIds = personaPool[personaIndex] ? [personaPool[personaIndex].id] : [];
  const [firstPlayerExample, ...remainingPlayerExamples] = state.selectedPlayerExamples;
  const selectedPlayerExamples =
    action === "skip" && firstPlayerExample
      ? [...remainingPlayerExamples, firstPlayerExample]
      : state.selectedPlayerExamples.length > 0
        ? state.selectedPlayerExamples
        : MATCHSLOP_PLAYER_EXAMPLES.slice(0, 4);
  const now = Date.now();
  await ctx.db.patch("matchSlopState", state._id, {
    selectedPersonaExampleIds,
    selectedPlayerExamples,
    profile: undefined,
    profileDraft: undefined,
    profileGeneration: {
      status: "NOT_REQUESTED",
      updatedAt: new Date(now).toISOString(),
      generationId: null,
    },
    personaImage: {
      status: "NOT_REQUESTED",
      imageUrl: null,
      updatedAt: new Date(now).toISOString(),
    },
    updatedAt: now,
  });
  const { job } = await queueMatchSlopWorkflow(ctx, {
    gameId: game._id,
    generationKey: `matchslop:profile:${crypto.randomUUID()}`,
    kind: "MATCHSLOP_PROFILE",
    stage: "PROFILE",
    workflow: profilePipelineRef,
  });
  return { started: true, workflowId: job.workflowId ?? null };
}

export async function queueAiResponseWorkflows(
  ctx: MutationCtx,
  game: Doc<"games">,
): Promise<number> {
  if (!isMatchSlopGame(game) || game.status !== "WRITING") return 0;
  const [players, bundle] = await Promise.all([
    listMatchSlopPlayers(ctx, game._id),
    loadMatchSlopRound(ctx, game._id, game.currentRound),
  ]);
  if (!bundle) return 0;
  const assigned = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  const responded = new Set(bundle.responses.map((response) => response.playerId));
  let queued = 0;
  for (const player of players) {
    if (
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      !player.modelId ||
      !assigned.has(player._id) ||
      responded.has(player._id)
    ) {
      continue;
    }
    const result = await queueMatchSlopWorkflow(ctx, {
      gameId: game._id,
      generationKey: expectedMatchSlopGenerationKey("RESPONSE", game, player._id),
      kind: "RESPONSE",
      stage: "RESPONSE",
      targetId: player._id,
      workflow: responsePipelineRef,
    });
    if (result.created) queued += 1;
  }
  return queued;
}

export async function queueAiVoteWorkflows(
  ctx: MutationCtx,
  game: Doc<"games">,
  players: Doc<"players">[],
  bundle: import("./matchslopData").MatchSlopRoundBundle,
): Promise<number> {
  const voted = new Set(bundle.votes.map((vote) => vote.voterId));
  const assigned = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  let queued = 0;
  for (const player of players) {
    if (
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      !player.modelId ||
      !assigned.has(player._id) ||
      voted.has(player._id)
    ) {
      continue;
    }
    const result = await queueMatchSlopWorkflow(ctx, {
      gameId: game._id,
      generationKey: expectedMatchSlopGenerationKey("VOTE", game, player._id),
      kind: "VOTE",
      stage: "VOTE",
      targetId: player._id,
      workflow: votePipelineRef,
    });
    if (result.created) queued += 1;
  }
  return queued;
}

export async function cancelMatchSlopJob(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  reason: string,
): Promise<void> {
  if (job.status === "SUCCEEDED" || job.status === "CANCELED") return;
  const now = Date.now();
  await ctx.db.patch("generationJobs", job._id, {
    status: "CANCELED",
    error: reason,
    completedAt: now,
    updatedAt: now,
  });
}

export async function claimMatchSlopJob(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
): Promise<boolean> {
  if (job.status !== "QUEUED") return false;
  const now = Date.now();
  await ctx.db.patch("generationJobs", job._id, {
    status: "RUNNING",
    attempt: job.attempt + 1,
    startedAt: now,
    updatedAt: now,
    error: undefined,
  });
  return true;
}

export async function finishMatchSlopJob(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  status: "CANCELED" | "SUCCEEDED",
  error?: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("generationJobs", job._id, {
    status,
    ...(error ? { error } : { error: undefined }),
    completedAt: now,
    updatedAt: now,
  });
}

export async function loadMatchSlopJobAndGame(
  ctx: MutationCtx,
  args: WorkflowJobArgs,
): Promise<{ job: Doc<"generationJobs">; game: Doc<"games"> } | null> {
  const [job, game] = await Promise.all([
    ctx.db.get("generationJobs", args.jobId),
    ctx.db.get("games", args.gameId),
  ]);
  if (!job || !game || job.gameId !== args.gameId || game._id !== job.gameId) return null;
  return { job, game };
}

export function staleMatchSlopContext(reason: string): { kind: "stale"; reason: string } {
  return { kind: "stale", reason };
}

export async function markMatchSlopClaimStale(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  reason: string,
): Promise<{ kind: "stale"; reason: string }> {
  await cancelMatchSlopJob(ctx, job, reason);
  return staleMatchSlopContext(reason);
}
