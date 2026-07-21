import {
  QUIZSLOP_AI_BANKS_PER_BATCH,
  quizSlopFreshPackRequestSchema,
  type QuizSlopFreshPackBatch,
  type QuizSlopFrozenPackResult,
  type QuizSlopGeneratedBatch,
  type QuizSlopGeneratedTopicBank,
  type QuizSlopModelUsage,
  type QuizSlopVerifierDecision,
} from "../src/games/quizslop/content-source/contracts";
import {
  buildCatalogFallbackPack,
  materializeGeneratedPack,
} from "../src/games/quizslop/content-source/pack-materialization";
import { gameWorkflow } from "./components";
import { generateCandidateBatchRef, verifyCandidateBatchRef } from "./quizslopPackContracts";
import {
  quizSlopFreshPackRequestValidator,
  quizSlopFrozenPackResultValidator,
} from "./quizslopPackValidators";

const RETRY_TRANSIENT_AI_ACTION = {
  maxAttempts: 3,
  initialBackoffMs: 500,
  base: 2,
} as const;

function fallback(
  request: ReturnType<typeof quizSlopFreshPackRequestSchema.parse>,
  reason: Extract<QuizSlopFrozenPackResult, { kind: "CATALOG_FALLBACK" }>["reason"],
  detail: string,
  usage: readonly QuizSlopModelUsage[],
): QuizSlopFrozenPackResult {
  return {
    kind: "CATALOG_FALLBACK",
    reason,
    detail,
    pack: buildCatalogFallbackPack(request, usage),
  };
}

function batchFrom(
  request: ReturnType<typeof quizSlopFreshPackRequestSchema.parse>,
  start: number,
): QuizSlopFreshPackBatch {
  return {
    purpose: request.purpose,
    packId: request.packId,
    requestedAt: request.requestedAt,
    config: request.config,
    banks: request.banks.slice(start, start + QUIZSLOP_AI_BANKS_PER_BATCH),
  };
}

type BatchSpec = { batch: QuizSlopFreshPackBatch; start: number };
type GenerationOutcome =
  | (BatchSpec & {
      kind: "SUCCESS";
      generated: QuizSlopGeneratedBatch;
      usage: QuizSlopModelUsage;
    })
  | (BatchSpec & { kind: "FAILED"; invalidOutput: boolean });
type VerificationOutcome =
  | (BatchSpec & {
      kind: "SUCCESS";
      decision: QuizSlopVerifierDecision;
      usage: QuizSlopModelUsage;
    })
  | (BatchSpec & { kind: "FAILED" });

function batchSpecs(request: ReturnType<typeof quizSlopFreshPackRequestSchema.parse>): BatchSpec[] {
  const batches: BatchSpec[] = [];
  for (let start = 0; start < request.banks.length; start += QUIZSLOP_AI_BANKS_PER_BATCH) {
    batches.push({ batch: batchFrom(request, start), start });
  }
  return batches;
}

/**
 * Lobby-only durable preflight. It freezes all 96–100 question variants before
 * gameplay can enter TOPIC_REVEAL; callers persist either the complete AI pack
 * or the complete reviewed-catalog fallback returned here.
 */
export const packPipeline = gameWorkflow
  .define({
    args: { request: quizSlopFreshPackRequestValidator },
    returns: quizSlopFrozenPackResultValidator,
  })
  .handler(async (step, args): Promise<QuizSlopFrozenPackResult> => {
    const parsed = quizSlopFreshPackRequestSchema.safeParse(args.request);
    if (!parsed.success) {
      throw new Error("QuizSlop pack pipeline received an invalid preflight request");
    }
    const request = parsed.data;
    const generationOutcomes: GenerationOutcome[] = await Promise.all(
      batchSpecs(request).map(async ({ batch, start }) => {
        try {
          const result = await step.runAction(
            generateCandidateBatchRef,
            { batch },
            {
              name: `generate-quizslop-banks-${start}`,
              retry: RETRY_TRANSIENT_AI_ACTION,
            },
          );
          return { kind: "SUCCESS", batch, start, ...result };
        } catch (error) {
          return {
            kind: "FAILED",
            batch,
            start,
            invalidOutput:
              error instanceof Error && error.message.includes("[INVALID_GENERATOR_OUTPUT]"),
          };
        }
      }),
    );
    const generated = generationOutcomes.filter(
      (outcome): outcome is Extract<GenerationOutcome, { kind: "SUCCESS" }> =>
        outcome.kind === "SUCCESS",
    );
    const generationFailure = generationOutcomes.find(
      (outcome): outcome is Extract<GenerationOutcome, { kind: "FAILED" }> =>
        outcome.kind === "FAILED",
    );
    const usage = generated.map((outcome) => outcome.usage);
    if (generationFailure) {
      return fallback(
        request,
        generationFailure.invalidOutput ? "INVALID_GENERATOR_OUTPUT" : "GENERATION_FAILED",
        generationFailure.invalidOutput
          ? "The generator repeatedly departed from the trusted content contract."
          : "Fresh-pack generation exhausted its retries.",
        usage,
      );
    }

    const verificationOutcomes: VerificationOutcome[] = await Promise.all(
      generated.map(async ({ batch, generated: generatedBatch, start }) => {
        try {
          const result = await step.runAction(
            verifyCandidateBatchRef,
            { batch, generated: generatedBatch },
            {
              name: `verify-quizslop-banks-${start}`,
              retry: RETRY_TRANSIENT_AI_ACTION,
            },
          );
          return { kind: "SUCCESS", batch, start, ...result };
        } catch {
          return { kind: "FAILED", batch, start };
        }
      }),
    );
    const verified = verificationOutcomes.filter(
      (outcome): outcome is Extract<VerificationOutcome, { kind: "SUCCESS" }> =>
        outcome.kind === "SUCCESS",
    );
    usage.push(...verified.map((outcome) => outcome.usage));
    if (verificationOutcomes.some((outcome) => outcome.kind === "FAILED")) {
      return fallback(
        request,
        "VERIFICATION_FAILED",
        "The fixed verifier exhausted its retries.",
        usage,
      );
    }
    const rejection = verified.find((outcome) => !outcome.decision.approved);
    if (rejection) {
      return fallback(
        request,
        "VERIFIER_REJECTED",
        `The fixed verifier rejected ${rejection.decision.issues.length} question issue(s).`,
        usage,
      );
    }
    const generatedBanks: QuizSlopGeneratedTopicBank[] = generated.flatMap(
      (outcome) => outcome.generated.banks,
    );

    try {
      return {
        kind: "AI_FROZEN",
        pack: materializeGeneratedPack(request, { banks: generatedBanks }, usage),
      };
    } catch {
      return fallback(
        request,
        "INVALID_GENERATOR_OUTPUT",
        "The complete generated pack failed final deterministic validation.",
        usage,
      );
    }
  });
