import type {
  QuizSlopFreshPackBatch,
  QuizSlopGeneratedBatch,
  QuizSlopModelUsage,
} from "../src/games/quizslop/content-source/contracts";
import { calculateCostUsd, getModelByModelId } from "../src/lib/models";

export function usageFor(
  requestedModelId: string,
  actualModelId: string | undefined,
  usage: { inputTokens?: number; outputTokens?: number },
): QuizSlopModelUsage {
  const resolvedActualModelId = actualModelId?.trim() || requestedModelId;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  // Gateway responses may report a provider-native model revision that is not
  // one of our priced catalog aliases. Keep the actual ID for audit, but bill
  // against the requested catalog model instead of silently recording $0.
  const pricedModelId = getModelByModelId(resolvedActualModelId)
    ? resolvedActualModelId
    : requestedModelId;
  return {
    requestedModelId,
    actualModelId: resolvedActualModelId,
    inputTokens,
    outputTokens,
    costUsd: calculateCostUsd(pricedModelId, inputTokens, outputTokens),
  };
}

export function generationPayload(batch: QuizSlopFreshPackBatch) {
  return batch.banks.map((bank) => ({
    bankId: bank.bankId,
    topic: bank.topic,
    evidence: bank.evidence.map((fact) => ({
      evidenceFactId: fact.id,
      tier: fact.tier,
      neutralQuestion: fact.neutralQuestion,
      choices: fact.choices,
      correctAnswer: fact.choices[fact.correctIndex],
      canonicalFact: fact.canonicalFact,
      reviewedFallbackExplanation: fact.fallbackExplanation,
      retainedSupport: fact.sources.map((source) => ({
        title: source.title,
        locator: source.locator,
        supportExcerpt: source.supportExcerpt,
        contentHash: source.contentHash,
      })),
    })),
  }));
}

export function verificationPayload(
  batch: QuizSlopFreshPackBatch,
  generated: QuizSlopGeneratedBatch,
) {
  const trustedByBank = new Map(
    generationPayload(batch).map((bank) => [bank.bankId, bank] as const),
  );
  return generated.banks.map((bank) => ({
    generated: bank,
    trusted: trustedByBank.get(bank.bankId) ?? null,
  }));
}
