import { z } from "zod";
import {
  QUIZSLOP_CATEGORIES,
  QUIZSLOP_COMEDY_DEVICES,
  QUIZSLOP_TIERS,
  type QuizslopTier,
} from "../types";
import {
  QUIZSLOP_AI_PROMPT_VERSION,
  QUIZSLOP_AI_SCHEMA_VERSION,
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
} from "./content-config";

export const QUIZSLOP_FRESH_PACK_MIN_TOPIC_BANKS = 24;
export const QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS = 25;
export const QUIZSLOP_QUESTIONS_PER_TOPIC_BANK = 4;
export const QUIZSLOP_AI_BANKS_PER_BATCH = 4;

const tierSchema = z.enum(QUIZSLOP_TIERS);
const categorySchema = z.enum(QUIZSLOP_CATEGORIES);
const comedyDeviceSchema = z.enum(QUIZSLOP_COMEDY_DEVICES);

const quizSlopSourceSnapshotSchema = z.object({
  url: z.url().max(2_048),
  title: z.string().trim().min(1).max(200),
  locator: z.string().trim().min(1).max(200),
  retrievedAt: z.iso.datetime(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u),
  supportExcerpt: z.string().trim().min(1).max(320),
  primary: z.boolean(),
});

export const quizSlopSafeEvidenceFactSchema = z.object({
  id: z.string().trim().min(1).max(160),
  provenance: z.literal("REVIEWED_CATALOG_SNAPSHOT"),
  topicId: z.string().trim().min(1).max(120),
  tier: tierSchema,
  neutralQuestion: z.string().trim().min(1).max(220),
  fallbackDisplayPrompt: z.string().trim().min(1).max(220),
  choices: z.array(z.string().trim().min(1).max(80)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  canonicalFact: z.string().trim().min(1).max(240),
  fallbackExplanation: z.string().trim().min(1).max(320),
  fallbackComedyDevices: z.array(comedyDeviceSchema).min(1).max(2),
  sources: z.array(quizSlopSourceSnapshotSchema).min(1).max(3),
  catalogReview: z.object({
    approved: z.literal(true),
    reviewer: z.string().trim().min(1).max(160),
    reviewedAt: z.iso.datetime(),
  }),
});

const quizSlopTopicBankRequestSchema = z.object({
  bankId: z.string().trim().min(1).max(120),
  topic: z.object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(80),
    category: categorySchema,
    scope: z.string().trim().min(1).max(240),
    exclusions: z.array(z.string().trim().min(1).max(120)).max(8),
    canonicalKey: z.string().regex(/^[0-9a-f]{64}$/u),
    packVersion: z.number().int().positive(),
    safetyNotes: z.array(z.string().trim().min(1).max(240)).max(8),
  }),
  evidence: z.array(quizSlopSafeEvidenceFactSchema).length(QUIZSLOP_QUESTIONS_PER_TOPIC_BANK),
});

const REQUIRED_TIERS: readonly QuizslopTier[] = ["EASY", "MEDIUM", "HARD", "INSANE"];

const quizSlopAiConfigSchema = z.object({
  mode: z.literal("AI"),
  generatorModelId: z.string().trim().min(1).max(160),
  verifierModelId: z.literal(QUIZSLOP_FIXED_VERIFIER_MODEL_ID),
  promptVersion: z.literal(QUIZSLOP_AI_PROMPT_VERSION),
  schemaVersion: z.literal(QUIZSLOP_AI_SCHEMA_VERSION),
});

function validateTopicBanks(
  banks: readonly z.infer<typeof quizSlopTopicBankRequestSchema>[],
  context: z.RefinementCtx,
): void {
  const bankIds = new Set<string>();
  const topicIds = new Set<string>();
  const evidenceIds = new Set<string>();

  for (const [bankIndex, bank] of banks.entries()) {
    if (bankIds.has(bank.bankId)) {
      context.addIssue({
        code: "custom",
        path: ["banks", bankIndex, "bankId"],
        message: "bank IDs must be unique",
      });
    }
    bankIds.add(bank.bankId);

    if (topicIds.has(bank.topic.id)) {
      context.addIssue({
        code: "custom",
        path: ["banks", bankIndex, "topic", "id"],
        message: "topic banks must use distinct topics",
      });
    }
    topicIds.add(bank.topic.id);

    const tierCounts = new Map<QuizslopTier, number>();
    for (const [factIndex, fact] of bank.evidence.entries()) {
      if (fact.topicId !== bank.topic.id) {
        context.addIssue({
          code: "custom",
          path: ["banks", bankIndex, "evidence", factIndex, "topicId"],
          message: "evidence topic must match its bank topic",
        });
      }
      if (evidenceIds.has(fact.id)) {
        context.addIssue({
          code: "custom",
          path: ["banks", bankIndex, "evidence", factIndex, "id"],
          message: "evidence facts must be unique across the pack",
        });
      }
      evidenceIds.add(fact.id);
      tierCounts.set(fact.tier, (tierCounts.get(fact.tier) ?? 0) + 1);
    }
    for (const tier of REQUIRED_TIERS) {
      if ((tierCounts.get(tier) ?? 0) !== 1) {
        context.addIssue({
          code: "custom",
          path: ["banks", bankIndex, "evidence"],
          message: `topic bank must contain exactly one ${tier} question`,
        });
      }
    }
  }
}

// Fresh-pack requests and generation batches share every field except the
// `banks` array bounds, so keep the common fields in one place.
const quizSlopFreshPackBaseShape = {
  purpose: z.literal("LOBBY_PREFLIGHT"),
  packId: z.string().trim().min(1).max(160),
  requestedAt: z.number().int().nonnegative(),
  config: quizSlopAiConfigSchema,
} as const;

export const quizSlopFreshPackRequestSchema = z
  .object({
    ...quizSlopFreshPackBaseShape,
    banks: z
      .array(quizSlopTopicBankRequestSchema)
      .min(QUIZSLOP_FRESH_PACK_MIN_TOPIC_BANKS)
      .max(QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS),
  })
  .superRefine((request, context) => validateTopicBanks(request.banks, context));

export const quizSlopFreshPackBatchSchema = z
  .object({
    ...quizSlopFreshPackBaseShape,
    banks: z.array(quizSlopTopicBankRequestSchema).min(1).max(QUIZSLOP_AI_BANKS_PER_BATCH),
  })
  .superRefine((request, context) => validateTopicBanks(request.banks, context));

const quizSlopGeneratedQuestionSchema = z.object({
  evidenceFactId: z.string().trim().min(1).max(160),
  displayPrompt: z.string().trim().min(1).max(220),
  choices: z.array(z.string().trim().min(1).max(80)).length(4),
  correctAnswer: z.string().trim().min(1).max(80),
  explanation: z.string().trim().min(1).max(320),
  comedyDevices: z.array(comedyDeviceSchema).min(1).max(2),
});

const quizSlopGeneratedTopicBankSchema = z.object({
  bankId: z.string().trim().min(1).max(120),
  topicId: z.string().trim().min(1).max(120),
  questions: z.array(quizSlopGeneratedQuestionSchema).length(QUIZSLOP_QUESTIONS_PER_TOPIC_BANK),
});

export const quizSlopGeneratedBatchSchema = z.object({
  banks: z.array(quizSlopGeneratedTopicBankSchema).min(1).max(QUIZSLOP_AI_BANKS_PER_BATCH),
});

export const quizSlopGeneratedPackSchema = z.object({
  banks: z
    .array(quizSlopGeneratedTopicBankSchema)
    .min(QUIZSLOP_FRESH_PACK_MIN_TOPIC_BANKS)
    .max(QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS),
});

export const quizSlopVerifierDecisionSchema = z.object({
  approved: z.boolean(),
  issues: z
    .array(
      z.object({
        bankId: z.string().trim().min(1).max(120),
        evidenceFactId: z.string().trim().min(1).max(160),
        code: z.enum([
          "FACT_UNSUPPORTED",
          "AMBIGUOUS",
          "ANSWER_LEAK",
          "MEAN_OR_UNSAFE",
          "NOT_EQUIVALENT",
          "FLAT_OR_TRY_HARD",
          "OTHER",
        ]),
        detail: z.string().trim().min(1).max(240),
      }),
    )
    .max(QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS * QUIZSLOP_QUESTIONS_PER_TOPIC_BANK * 2),
});

const quizSlopModelUsageSchema = z.object({
  requestedModelId: z.string().trim().min(1).max(160),
  actualModelId: z.string().trim().min(1).max(160),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
});

const quizSlopFrozenQuestionSchema = z.object({
  evidenceFactId: z.string().trim().min(1).max(160),
  tier: tierSchema,
  neutralQuestion: z.string().trim().min(1).max(220),
  displayPrompt: z.string().trim().min(1).max(220),
  choices: z.array(z.string().trim().min(1).max(80)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  canonicalFact: z.string().trim().min(1).max(240),
  explanation: z.string().trim().min(1).max(320),
  comedyDevices: z.array(comedyDeviceSchema).min(1).max(2),
  sources: z.array(quizSlopSourceSnapshotSchema).min(1).max(3),
});

const quizSlopFrozenTopicBankSchema = z.object({
  bankId: z.string().trim().min(1).max(120),
  topic: quizSlopTopicBankRequestSchema.shape.topic,
  questions: z.array(quizSlopFrozenQuestionSchema).length(QUIZSLOP_QUESTIONS_PER_TOPIC_BANK),
});

export const quizSlopFrozenPackSchema = z.object({
  id: z.string().trim().min(1).max(160),
  source: z.enum(["AI", "CATALOG"]),
  frozenAt: z.number().int().nonnegative(),
  promptVersion: z.literal(QUIZSLOP_AI_PROMPT_VERSION),
  schemaVersion: z.literal(QUIZSLOP_AI_SCHEMA_VERSION),
  generatorModelId: z.string().trim().min(1).max(160).nullable(),
  verifierModelId: z.literal(QUIZSLOP_FIXED_VERIFIER_MODEL_ID).nullable(),
  banks: z
    .array(quizSlopFrozenTopicBankSchema)
    .min(QUIZSLOP_FRESH_PACK_MIN_TOPIC_BANKS)
    .max(QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS),
  review: z.object({
    humanApproved: z.boolean(),
    automatedVerifierApproved: z.boolean(),
  }),
  usage: z
    .array(quizSlopModelUsageSchema)
    .max(Math.ceil(QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS / QUIZSLOP_AI_BANKS_PER_BATCH) * 2),
});

const quizSlopPackFallbackReasonSchema = z.enum([
  "NO_TRUSTED_EVIDENCE",
  "GENERATION_FAILED",
  "INVALID_GENERATOR_OUTPUT",
  "VERIFICATION_FAILED",
  "VERIFIER_REJECTED",
]);

export const quizSlopFrozenPackResultSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("AI_FROZEN"), pack: quizSlopFrozenPackSchema }),
    z.object({
      kind: z.literal("CATALOG_FALLBACK"),
      reason: quizSlopPackFallbackReasonSchema,
      detail: z.string().trim().min(1).max(240),
      pack: quizSlopFrozenPackSchema,
    }),
  ])
  .superRefine((result, context) => {
    const expectedSource = result.kind === "AI_FROZEN" ? "AI" : "CATALOG";
    if (result.pack.source !== expectedSource) {
      context.addIssue({
        code: "custom",
        path: ["pack", "source"],
        message: `${result.kind} must contain a ${expectedSource} pack`,
      });
    }
  });

export type QuizSlopSafeEvidenceFact = z.infer<typeof quizSlopSafeEvidenceFactSchema>;
export type QuizSlopFreshPackRequest = z.infer<typeof quizSlopFreshPackRequestSchema>;
export type QuizSlopFreshPackBatch = z.infer<typeof quizSlopFreshPackBatchSchema>;
export type QuizSlopGeneratedQuestion = z.infer<typeof quizSlopGeneratedQuestionSchema>;
export type QuizSlopGeneratedTopicBank = z.infer<typeof quizSlopGeneratedTopicBankSchema>;
export type QuizSlopGeneratedBatch = z.infer<typeof quizSlopGeneratedBatchSchema>;
export type QuizSlopGeneratedPack = z.infer<typeof quizSlopGeneratedPackSchema>;
export type QuizSlopVerifierDecision = z.infer<typeof quizSlopVerifierDecisionSchema>;
export type QuizSlopModelUsage = z.infer<typeof quizSlopModelUsageSchema>;
export type QuizSlopFrozenPack = z.infer<typeof quizSlopFrozenPackSchema>;
export type QuizSlopFrozenPackResult = z.infer<typeof quizSlopFrozenPackResultSchema>;
