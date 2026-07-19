import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId, type WorkflowId } from "@convex-dev/workflow";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { gameWorkflow } from "./components";
import {
  QUIZSLOP_PACK_GENERATION_KEY,
  QUIZSLOP_PACK_JOB_KIND,
  QUIZSLOP_PACK_JOB_STAGE,
  quizSlopPackPipelineRef,
  type QuizSlopPackCompletionContext,
} from "./quizslopPackContracts";
import {
  type QuizSlopFreshPackRequest,
  type QuizSlopFrozenPack,
} from "../src/games/quizslop/content-source/contracts";
import {
  buildReviewedFreshPackRequest,
  type QuizSlopFreshPackRequestResolution,
} from "../src/games/quizslop/content-source/catalog-evidence";
import { resolveQuizSlopContentConfig } from "../src/games/quizslop/content-source/content-config";
import { buildCatalogFallbackPack } from "../src/games/quizslop/content-source/pack-materialization";
import { gameHasQuizSlopPackRows, persistQuizSlopPack } from "./quizslopPackPersistence";
import { packValidationError, readFrozenResult } from "./quizslopPackValidation";

const QUEUE_FAILURE = "Fresh AI Pack could not be queued";
const PACK_WRITE_FAILURE = "Fresh AI Pack could not be frozen safely";
const ACTIVE_PACK_STATUSES = new Set(["PENDING", "GENERATING"]);

type QuizSlopAiState = Doc<"quizSlopState"> & {
  contentSource: "AI";
  generatorModelId: string;
};

type PackJob = Doc<"generationJobs"> & { kind: typeof QUIZSLOP_PACK_JOB_KIND };

function isQuizSlopAiState(state: Doc<"quizSlopState"> | null): state is QuizSlopAiState {
  return state?.contentSource === "AI" && typeof state.generatorModelId === "string";
}

function isPackJob(job: Doc<"generationJobs"> | null): job is PackJob {
  return job?.kind === QUIZSLOP_PACK_JOB_KIND;
}

const completionRef = makeFunctionReference<
  "mutation",
  {
    workflowId: string;
    result:
      | { kind: "success"; returnValue: unknown }
      | { kind: "failed"; error: string }
      | { kind: "canceled" };
    context: QuizSlopPackCompletionContext;
  },
  null
>("quizslopPackJobs:completeQuizSlopPack");

function packIdForGame(gameId: Id<"games">): string {
  return `${QUIZSLOP_PACK_GENERATION_KEY}:${gameId}`;
}

async function loadAiState(ctx: MutationCtx, gameId: Id<"games">): Promise<QuizSlopAiState | null> {
  const state = await ctx.db
    .query("quizSlopState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
  return isQuizSlopAiState(state) ? state : null;
}

function requestForState(
  state: QuizSlopAiState,
  packId: string,
  requestedAt: number,
): QuizSlopFreshPackRequestResolution | null {
  try {
    const config = resolveQuizSlopContentConfig({
      mode: "AI",
      generatorModelId: state.generatorModelId,
    });
    if (
      state.verifierModelId !== config.verifierModelId ||
      state.promptVersion !== config.promptVersion ||
      state.schemaVersion !== config.schemaVersion
    ) {
      return null;
    }
    return buildReviewedFreshPackRequest({ packId, requestedAt, config });
  } catch {
    return null;
  }
}

async function findPackJob(ctx: MutationCtx, gameId: Id<"games">): Promise<PackJob | null> {
  const job = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", gameId).eq("generationKey", QUIZSLOP_PACK_GENERATION_KEY),
    )
    .unique();
  return isPackJob(job) ? job : null;
}

async function failPack(
  ctx: MutationCtx,
  state: QuizSlopAiState,
  job: PackJob,
  reason: string,
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    ctx.db.patch("quizSlopState", state._id, { packStatus: "FAILED" }),
    ctx.db.patch("generationJobs", job._id, {
      status: "FAILED",
      error: reason,
      completedAt: now,
      updatedAt: now,
    }),
  ]);
}

async function finishWithPack(
  ctx: MutationCtx,
  args: {
    game: Doc<"games">;
    state: QuizSlopAiState;
    job: PackJob;
    pack: QuizSlopFrozenPack;
    request: QuizSlopFreshPackRequest;
    fallbackReason?: string;
  },
): Promise<boolean> {
  const validationError = packValidationError(
    args.pack,
    args.state,
    args.job.targetId ?? "",
    args.request,
  );
  if (validationError || (await gameHasQuizSlopPackRows(ctx, args.game._id))) {
    await failPack(ctx, args.state, args.job, validationError ?? PACK_WRITE_FAILURE);
    return false;
  }

  const now = Date.now();
  await persistQuizSlopPack(ctx, { game: args.game, pack: args.pack, now });
  await Promise.all([
    ctx.db.patch("quizSlopState", args.state._id, {
      packStatus: args.pack.source === "AI" ? "READY" : "FALLBACK",
    }),
    ctx.db.patch("generationJobs", args.job._id, {
      status: "SUCCEEDED",
      error: args.fallbackReason,
      completedAt: now,
      updatedAt: now,
    }),
  ]);
  return true;
}

async function createOrRestartJob(
  ctx: MutationCtx,
  gameId: Id<"games">,
  packId: string,
): Promise<PackJob> {
  const existing = await findPackJob(ctx, gameId);
  const now = Date.now();
  if (existing) {
    if (existing.workflowId) {
      const workflowId = existing.workflowId as WorkflowId;
      // Make any cancellation completion stale before asking the component to
      // cancel. Some component implementations deliver onComplete during the
      // cancellation path; it must not materialize a competing pack.
      await ctx.db.patch("generationJobs", existing._id, {
        status: "CANCELED",
        completedAt: now,
        updatedAt: now,
      });
      try {
        const status = await gameWorkflow.status(ctx, workflowId);
        if (status.type === "inProgress") {
          await gameWorkflow.cancel(ctx, workflowId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("Workflow not found:")) throw error;
      }
      // Retain the canceled workflow ID on the terminal fallback job. A queued
      // startAsync root can then observe cancellation safely, and the normal
      // room lifecycle sweep can reclaim its component storage later.
    }
    await ctx.db.patch("generationJobs", existing._id, {
      targetId: packId,
      status: "RUNNING",
      attempt: existing.attempt + 1,
      workId: undefined,
      error: undefined,
      startedAt: now,
      completedAt: undefined,
      updatedAt: now,
    });
    const updated = await ctx.db.get("generationJobs", existing._id);
    if (!isPackJob(updated)) throw new Error("QuizSlop pack job disappeared during restart");
    return updated;
  }
  const jobId = await ctx.db.insert("generationJobs", {
    gameId,
    kind: QUIZSLOP_PACK_JOB_KIND,
    generationKey: QUIZSLOP_PACK_GENERATION_KEY,
    targetId: packId,
    status: "RUNNING",
    attempt: 1,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
  });
  const job = await ctx.db.get("generationJobs", jobId);
  if (!isPackJob(job)) {
    throw new Error("QuizSlop pack job was not created");
  }
  return job;
}

async function loadActivePackLobby(
  ctx: MutationCtx,
  gameId: Id<"games">,
  generatorModelId: string,
): Promise<{ game: Doc<"games">; state: QuizSlopAiState } | null> {
  const [game, state] = await Promise.all([ctx.db.get("games", gameId), loadAiState(ctx, gameId)]);
  if (
    !game ||
    game.gameType !== "QUIZSLOP" ||
    game.status !== "LOBBY" ||
    !state ||
    state.phase !== "LOBBY_SETUP" ||
    !ACTIVE_PACK_STATUSES.has(state.packStatus) ||
    state.generatorModelId !== generatorModelId
  ) {
    return null;
  }
  return { game, state };
}

export const queueFreshPack = internalMutation({
  args: { gameId: v.id("games"), generatorModelId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("ENQUEUED"), jobId: v.id("generationJobs") }),
    v.object({ status: v.literal("EXISTING"), jobId: v.id("generationJobs") }),
    v.object({ status: v.literal("FALLBACK"), jobId: v.id("generationJobs") }),
    v.object({ status: v.literal("FAILED"), jobId: v.id("generationJobs") }),
    v.object({ status: v.literal("SKIPPED") }),
  ),
  handler: async (ctx, args) => {
    const loaded = await loadActivePackLobby(ctx, args.gameId, args.generatorModelId);
    if (!loaded) return { status: "SKIPPED" as const };

    const existing = await findPackJob(ctx, args.gameId);
    if (existing?.status === "RUNNING" && existing.workflowId) {
      return { status: "EXISTING" as const, jobId: existing._id };
    }

    const packId = packIdForGame(args.gameId);
    const job = await createOrRestartJob(ctx, args.gameId, packId);
    const resolution = requestForState(loaded.state, packId, job.createdAt);
    if (!resolution || resolution.kind === "FALLBACK_REQUIRED") {
      await failPack(ctx, loaded.state, job, "No complete reviewed catalog snapshot was available");
      return { status: "FAILED" as const, jobId: job._id };
    }

    try {
      const workflowId = await gameWorkflow.start(
        ctx,
        quizSlopPackPipelineRef,
        { request: resolution.request },
        {
          startAsync: true,
          onComplete: completionRef,
          context: {
            gameId: args.gameId,
            jobId: job._id,
            stage: QUIZSLOP_PACK_JOB_STAGE,
          },
        },
      );
      const now = Date.now();
      await Promise.all([
        ctx.db.patch("generationJobs", job._id, { workflowId, updatedAt: now }),
        ctx.db.patch("quizSlopState", loaded.state._id, {
          packStatus: "GENERATING",
        }),
      ]);
      return { status: "ENQUEUED" as const, jobId: job._id };
    } catch {
      const persisted = await finishWithPack(ctx, {
        ...loaded,
        job,
        pack: buildCatalogFallbackPack(resolution.request),
        request: resolution.request,
        fallbackReason: `${QUEUE_FAILURE}; complete reviewed catalog fallback loaded`,
      });
      return {
        status: persisted ? ("FALLBACK" as const) : ("FAILED" as const),
        jobId: job._id,
      };
    }
  },
});

export const recoverFreshPack = internalMutation({
  args: { gameId: v.id("games"), generatorModelId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("FALLBACK"), jobId: v.id("generationJobs") }),
    v.object({ status: v.literal("FAILED"), jobId: v.id("generationJobs") }),
    v.object({ status: v.literal("SKIPPED") }),
  ),
  handler: async (ctx, args) => {
    const loaded = await loadActivePackLobby(ctx, args.gameId, args.generatorModelId);
    if (!loaded) return { status: "SKIPPED" as const };
    const packId = packIdForGame(args.gameId);
    const job = await createOrRestartJob(ctx, args.gameId, packId);
    const resolution = requestForState(loaded.state, packId, job.createdAt);
    if (!resolution || resolution.kind === "FALLBACK_REQUIRED") {
      await failPack(ctx, loaded.state, job, "No complete reviewed catalog snapshot was available");
      return { status: "FAILED" as const, jobId: job._id };
    }
    const persisted = await finishWithPack(ctx, {
      ...loaded,
      job,
      pack: buildCatalogFallbackPack(resolution.request),
      request: resolution.request,
      fallbackReason: `${QUEUE_FAILURE}; complete reviewed catalog fallback loaded`,
    });
    return {
      status: persisted ? ("FALLBACK" as const) : ("FAILED" as const),
      jobId: job._id,
    };
  },
});

export const markFreshPackFailed = internalMutation({
  args: { gameId: v.id("games"), generatorModelId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await loadActivePackLobby(ctx, args.gameId, args.generatorModelId);
    if (!loaded) return null;
    const job = await createOrRestartJob(ctx, args.gameId, packIdForGame(args.gameId));
    await failPack(ctx, loaded.state, job, QUEUE_FAILURE);
    return null;
  },
});

export const completeQuizSlopPack = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      gameId: v.id("games"),
      jobId: v.id("generationJobs"),
      stage: v.literal(QUIZSLOP_PACK_JOB_STAGE),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [game, state, storedJob] = await Promise.all([
      ctx.db.get("games", args.context.gameId),
      loadAiState(ctx, args.context.gameId),
      ctx.db.get("generationJobs", args.context.jobId),
    ]);
    if (
      !isPackJob(storedJob) ||
      storedJob.gameId !== args.context.gameId ||
      storedJob.status !== "RUNNING" ||
      storedJob.workflowId !== args.workflowId
    ) {
      return null;
    }
    const job = storedJob;
    if (
      !game ||
      game.gameType !== "QUIZSLOP" ||
      game.status !== "LOBBY" ||
      !state ||
      state.phase !== "LOBBY_SETUP" ||
      !ACTIVE_PACK_STATUSES.has(state.packStatus)
    ) {
      const now = Date.now();
      await Promise.all([
        state && ACTIVE_PACK_STATUSES.has(state.packStatus)
          ? ctx.db.patch("quizSlopState", state._id, {
              packStatus: "FAILED",
            })
          : Promise.resolve(),
        ctx.db.patch("generationJobs", job._id, {
          status: "CANCELED",
          error: "QuizSlop lobby preflight was no longer current",
          completedAt: now,
          updatedAt: now,
        }),
      ]);
      return null;
    }

    const resolution = requestForState(state, job.targetId ?? "", job.createdAt);
    if (!resolution || resolution.kind === "FALLBACK_REQUIRED") {
      await failPack(ctx, state, job, "No complete reviewed catalog snapshot was available");
      return null;
    }

    const returned =
      args.result.kind === "success" ? readFrozenResult(args.result.returnValue) : null;
    const returnedError = returned
      ? packValidationError(returned.pack, state, job.targetId ?? "", resolution.request)
      : null;
    const useReturned = returned !== null && returnedError === null;
    const pack = useReturned ? returned.pack : buildCatalogFallbackPack(resolution.request);
    const fallbackReason =
      useReturned && returned.kind === "CATALOG_FALLBACK"
        ? `Fresh AI Pack used complete catalog fallback (${returned.reason})`
        : useReturned
          ? undefined
          : args.result.kind === "failed"
            ? "Fresh AI Pack workflow failed; complete reviewed catalog fallback loaded"
            : args.result.kind === "canceled"
              ? "Fresh AI Pack workflow was canceled; complete reviewed catalog fallback loaded"
              : "Fresh AI Pack returned an invalid result; complete reviewed catalog fallback loaded";

    await finishWithPack(ctx, {
      game,
      state,
      job,
      pack,
      request: resolution.request,
      fallbackReason,
    });
    return null;
  },
});
