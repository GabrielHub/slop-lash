import type {
  QuizSlopFreshPackBatch,
  QuizSlopGeneratedBatch,
  QuizSlopModelUsage,
  QuizSlopVerifierDecision,
} from "../src/games/quizslop/content-source/contracts";
import { calculateCostUsd, getModelInfo } from "../src/lib/models";

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
  const pricedModelId = getModelInfo(resolvedActualModelId)
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

type JudgeVerdict = Exclude<QuizSlopVerifierDecision["issues"][number]["code"], "OTHER"> | "PASS";

export const JUDGE_VERDICT_CRITERIA: Record<JudgeVerdict, string> = {
  PASS: "Tests exactly the trusted neutralQuestion with the trusted choices and answer, has one clear answer, never leaks it, adds no unsupported fact, and any joke is kind and readable",
  FACT_UNSUPPORTED: "States or implies a fact that retainedSupport does not support",
  AMBIGUOUS: "More than one choice could reasonably be defended as correct",
  ANSWER_LEAK: "The displayPrompt gives away the correct answer",
  MEAN_OR_UNSAFE:
    "The humor targets a player, identity, illness, victim, prisoner, atrocity, or animal suffering, or breaks a topic safety note",
  NOT_EQUIVALENT:
    "Asks something different from the trusted neutralQuestion or changes its choices",
  FLAT_OR_TRY_HARD: "The copy is flat, or a try-hard joke gets in the way of understanding",
};

/** A question passes only when the judge is at least this sure it is clean. */
const JUDGE_PASS_PROBABILITY = 0.5;

function isIssueVerdict(verdict: string | undefined): verdict is Exclude<JudgeVerdict, "PASS"> {
  return verdict !== undefined && verdict !== "PASS" && verdict in JUDGE_VERDICT_CRITERIA;
}

function mostLikelyIssue(probabilities: Record<string, number> | undefined): string | undefined {
  return Object.entries(probabilities ?? {})
    .filter(([verdict]) => verdict !== "PASS")
    .toSorted((left, right) => right[1] - left[1])[0]?.[0];
}

/**
 * The decision model's view of a batch: each bank's topic once, and one item
 * per generated question, keyed `q0`, `q1`, ...
 */
export function judgePayload(batch: QuizSlopFreshPackBatch, generated: QuizSlopGeneratedBatch) {
  const trustedByBank = new Map(generationPayload(batch).map((bank) => [bank.bankId, bank]));
  const topics = Object.fromEntries(
    generated.banks.map((bank) => [bank.bankId, trustedByBank.get(bank.bankId)?.topic ?? null]),
  );
  const items = generated.banks
    .flatMap((bank) =>
      bank.questions.map((question) => {
        const fact = trustedByBank
          .get(bank.bankId)
          ?.evidence.find((candidate) => candidate.evidenceFactId === question.evidenceFactId);
        return {
          bankId: bank.bankId,
          evidenceFactId: question.evidenceFactId,
          // Content hashes are audit data the judge has no use for.
          trusted: fact
            ? {
                ...fact,
                retainedSupport: fact.retainedSupport.map(({ title, locator, supportExcerpt }) => ({
                  title,
                  locator,
                  supportExcerpt,
                })),
              }
            : null,
          generated: question,
        };
      }),
    )
    .map((item, index) => ({ key: `q${index}`, ...item }));
  return { topics, items };
}

/**
 * Fails closed: anything short of a confident PASS rejects the batch, exactly
 * like the language-model verifier. A missing answer counts as a failure.
 */
export function judgeDecision(
  items: readonly { key: string; bankId: string; evidenceFactId: string }[],
  answers: Partial<
    Record<string, { choice?: string; probabilities?: Record<string, number> | undefined }>
  >,
  judgeName: string,
): QuizSlopVerifierDecision {
  const issues: QuizSlopVerifierDecision["issues"] = [];
  for (const item of items) {
    const answer = answers[item.key];
    const passProbability = answer?.probabilities?.PASS ?? (answer?.choice === "PASS" ? 1 : 0);
    if (answer?.choice === "PASS" && passProbability >= JUDGE_PASS_PROBABILITY) continue;
    // A hesitant PASS still fails; blame the likeliest problem instead.
    const verdict =
      answer?.choice === "PASS" ? mostLikelyIssue(answer.probabilities) : answer?.choice;
    issues.push({
      bankId: item.bankId,
      evidenceFactId: item.evidenceFactId,
      code: isIssueVerdict(verdict) ? verdict : "OTHER",
      detail: `${judgeName} ruled ${verdict ?? "nothing"} (PASS ${Math.round(passProbability * 100)}%)`,
    });
  }
  return { approved: issues.length === 0, issues };
}
