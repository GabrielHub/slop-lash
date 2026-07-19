import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type {
  QuizSlopFreshPackBatch,
  QuizSlopFreshPackRequest,
  QuizSlopFrozenPackResult,
  QuizSlopGeneratedBatch,
  QuizSlopModelUsage,
  QuizSlopVerifierDecision,
} from "../src/games/quizslop/content-source/contracts";
import { makeInternalWorkflowReference } from "./workflowReference";

export const QUIZSLOP_PACK_JOB_KIND = "QUIZSLOP_PACK" as const;
export const QUIZSLOP_PACK_JOB_STAGE = "QUIZSLOP_PACK" as const;
export const QUIZSLOP_PACK_GENERATION_KEY = "quizslop-pack-v1";
/** One-shot fail-safe beyond the pipeline's bounded 14 actions and retries. */
export const QUIZSLOP_PACK_RECOVERY_DELAY_MS = 60 * 60_000;

export const generateCandidateBatchRef = makeFunctionReference<
  "action",
  { batch: QuizSlopFreshPackBatch },
  { generated: QuizSlopGeneratedBatch; usage: QuizSlopModelUsage }
>("quizslopPackAi:generateCandidateBatch");

export const verifyCandidateBatchRef = makeFunctionReference<
  "action",
  { batch: QuizSlopFreshPackBatch; generated: QuizSlopGeneratedBatch },
  { decision: QuizSlopVerifierDecision; usage: QuizSlopModelUsage }
>("quizslopPackAi:verifyCandidateBatch");

export const quizSlopPackPipelineRef = makeInternalWorkflowReference<
  { request: QuizSlopFreshPackRequest },
  QuizSlopFrozenPackResult
>("quizslopPackWorkflow:packPipeline");

export interface QuizSlopPackCompletionContext {
  gameId: Id<"games">;
  jobId: Id<"generationJobs">;
  stage: typeof QUIZSLOP_PACK_JOB_STAGE;
}
