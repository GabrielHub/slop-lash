import { v } from "convex/values";
import {
  QUIZSLOP_AI_PROMPT_VERSION,
  QUIZSLOP_AI_SCHEMA_VERSION,
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
} from "../src/games/quizslop/content-source/content-config";
import {
  quizslopCategoryValidator,
  quizslopComedyDeviceValidator,
  quizslopTierValidator,
} from "./quizslopValidators";

const quizSlopSourceSnapshotValidator = v.object({
  url: v.string(),
  title: v.string(),
  locator: v.string(),
  retrievedAt: v.string(),
  contentHash: v.string(),
  supportExcerpt: v.string(),
  primary: v.boolean(),
});

const quizSlopSafeEvidenceFactValidator = v.object({
  id: v.string(),
  provenance: v.literal("REVIEWED_CATALOG_SNAPSHOT"),
  topicId: v.string(),
  tier: quizslopTierValidator,
  neutralQuestion: v.string(),
  fallbackDisplayPrompt: v.string(),
  choices: v.array(v.string()),
  correctIndex: v.number(),
  canonicalFact: v.string(),
  fallbackExplanation: v.string(),
  fallbackComedyDevices: v.array(quizslopComedyDeviceValidator),
  sources: v.array(quizSlopSourceSnapshotValidator),
  catalogReview: v.object({
    approved: v.literal(true),
    reviewer: v.string(),
    reviewedAt: v.string(),
  }),
});

const quizSlopAiContentConfigValidator = v.object({
  mode: v.literal("AI"),
  generatorModelId: v.string(),
  verifierModelId: v.literal(QUIZSLOP_FIXED_VERIFIER_MODEL_ID),
  promptVersion: v.literal(QUIZSLOP_AI_PROMPT_VERSION),
  schemaVersion: v.literal(QUIZSLOP_AI_SCHEMA_VERSION),
});

const quizSlopTopicBankRequestValidator = v.object({
  bankId: v.string(),
  topic: v.object({
    id: v.string(),
    label: v.string(),
    category: quizslopCategoryValidator,
    scope: v.string(),
    exclusions: v.array(v.string()),
    canonicalKey: v.string(),
    packVersion: v.number(),
    safetyNotes: v.array(v.string()),
  }),
  evidence: v.array(quizSlopSafeEvidenceFactValidator),
});

export const quizSlopFreshPackRequestValidator = v.object({
  purpose: v.literal("LOBBY_PREFLIGHT"),
  packId: v.string(),
  requestedAt: v.number(),
  config: quizSlopAiContentConfigValidator,
  banks: v.array(quizSlopTopicBankRequestValidator),
});

// A generation batch carries the same fields as a fresh-pack request; the
// array size bounds that distinguish them live in the Zod layer (contracts.ts).
export const quizSlopFreshPackBatchValidator = quizSlopFreshPackRequestValidator;

const quizSlopGeneratedQuestionValidator = v.object({
  evidenceFactId: v.string(),
  displayPrompt: v.string(),
  choices: v.array(v.string()),
  correctAnswer: v.string(),
  explanation: v.string(),
  comedyDevices: v.array(quizslopComedyDeviceValidator),
});

const quizSlopGeneratedTopicBankValidator = v.object({
  bankId: v.string(),
  topicId: v.string(),
  questions: v.array(quizSlopGeneratedQuestionValidator),
});

export const quizSlopGeneratedBatchValidator = v.object({
  banks: v.array(quizSlopGeneratedTopicBankValidator),
});

const quizSlopVerifierDecisionValidator = v.object({
  approved: v.boolean(),
  issues: v.array(
    v.object({
      bankId: v.string(),
      evidenceFactId: v.string(),
      code: v.union(
        v.literal("FACT_UNSUPPORTED"),
        v.literal("AMBIGUOUS"),
        v.literal("ANSWER_LEAK"),
        v.literal("MEAN_OR_UNSAFE"),
        v.literal("NOT_EQUIVALENT"),
        v.literal("FLAT_OR_TRY_HARD"),
        v.literal("OTHER"),
      ),
      detail: v.string(),
    }),
  ),
});

const quizSlopModelUsageValidator = v.object({
  requestedModelId: v.string(),
  actualModelId: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
});

export const quizSlopGenerationActionResultValidator = v.object({
  generated: quizSlopGeneratedBatchValidator,
  usage: quizSlopModelUsageValidator,
});

export const quizSlopVerificationActionResultValidator = v.object({
  decision: quizSlopVerifierDecisionValidator,
  usage: quizSlopModelUsageValidator,
});

const quizSlopFrozenQuestionValidator = v.object({
  evidenceFactId: v.string(),
  tier: quizslopTierValidator,
  neutralQuestion: v.string(),
  displayPrompt: v.string(),
  choices: v.array(v.string()),
  correctIndex: v.number(),
  canonicalFact: v.string(),
  explanation: v.string(),
  comedyDevices: v.array(quizslopComedyDeviceValidator),
  sources: v.array(quizSlopSourceSnapshotValidator),
});

const quizSlopFrozenTopicBankValidator = v.object({
  bankId: v.string(),
  topic: v.object({
    id: v.string(),
    label: v.string(),
    category: quizslopCategoryValidator,
    scope: v.string(),
    exclusions: v.array(v.string()),
    canonicalKey: v.string(),
    packVersion: v.number(),
    safetyNotes: v.array(v.string()),
  }),
  questions: v.array(quizSlopFrozenQuestionValidator),
});

const quizSlopFrozenPackValidator = v.object({
  id: v.string(),
  source: v.union(v.literal("AI"), v.literal("CATALOG")),
  frozenAt: v.number(),
  promptVersion: v.literal(QUIZSLOP_AI_PROMPT_VERSION),
  schemaVersion: v.literal(QUIZSLOP_AI_SCHEMA_VERSION),
  generatorModelId: v.union(v.string(), v.null()),
  verifierModelId: v.union(v.literal(QUIZSLOP_FIXED_VERIFIER_MODEL_ID), v.null()),
  banks: v.array(quizSlopFrozenTopicBankValidator),
  review: v.object({
    humanApproved: v.boolean(),
    automatedVerifierApproved: v.boolean(),
  }),
  usage: v.array(quizSlopModelUsageValidator),
});

const quizSlopPackFallbackReasonValidator = v.union(
  v.literal("NO_TRUSTED_EVIDENCE"),
  v.literal("GENERATION_FAILED"),
  v.literal("INVALID_GENERATOR_OUTPUT"),
  v.literal("VERIFICATION_FAILED"),
  v.literal("VERIFIER_REJECTED"),
);

export const quizSlopFrozenPackResultValidator = v.union(
  v.object({ kind: v.literal("AI_FROZEN"), pack: quizSlopFrozenPackValidator }),
  v.object({
    kind: v.literal("CATALOG_FALLBACK"),
    reason: quizSlopPackFallbackReasonValidator,
    detail: v.string(),
    pack: quizSlopFrozenPackValidator,
  }),
);
