import {
  QUIZSLOP_AI_BANKS_PER_BATCH,
  QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS,
  QUIZSLOP_FRESH_PACK_MIN_TOPIC_BANKS,
  QUIZSLOP_QUESTIONS_PER_TOPIC_BANK,
  quizSlopFrozenPackResultSchema,
  type QuizSlopFreshPackRequest,
  type QuizSlopFrozenPack,
  type QuizSlopFrozenPackResult,
  type QuizSlopModelUsage,
} from "../src/games/quizslop/content-source/contracts";
import {
  QUIZSLOP_AI_PROMPT_VERSION,
  QUIZSLOP_AI_SCHEMA_VERSION,
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
} from "../src/games/quizslop/content-source/content-config";
import { assertFrozenPackMatchesRequest } from "../src/games/quizslop/content-source/pack-materialization";

export function readFrozenResult(value: unknown): QuizSlopFrozenPackResult | null {
  const parsed = quizSlopFrozenPackResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isFiniteUsage(usage: QuizSlopModelUsage): boolean {
  return (
    usage.requestedModelId.trim().length > 0 &&
    usage.actualModelId.trim().length > 0 &&
    Number.isFinite(usage.inputTokens) &&
    Number.isFinite(usage.outputTokens) &&
    Number.isFinite(usage.costUsd) &&
    usage.inputTokens >= 0 &&
    usage.outputTokens >= 0 &&
    usage.costUsd >= 0
  );
}

/** Complete fail-closed validation at the workflow-to-database boundary. */
export function packValidationError(
  pack: QuizSlopFrozenPack,
  state: { generatorModelId: string },
  expectedPackId: string,
  request?: QuizSlopFreshPackRequest,
): string | null {
  if (
    pack.id !== expectedPackId ||
    !Number.isInteger(pack.frozenAt) ||
    pack.frozenAt < 0 ||
    pack.promptVersion !== QUIZSLOP_AI_PROMPT_VERSION ||
    pack.schemaVersion !== QUIZSLOP_AI_SCHEMA_VERSION ||
    pack.banks.length < QUIZSLOP_FRESH_PACK_MIN_TOPIC_BANKS ||
    pack.banks.length > QUIZSLOP_FRESH_PACK_MAX_TOPIC_BANKS ||
    !pack.usage.every(isFiniteUsage)
  ) {
    return "The frozen pack header did not match the queued request";
  }
  if (
    pack.source === "AI" &&
    (pack.generatorModelId !== state.generatorModelId ||
      pack.verifierModelId !== QUIZSLOP_FIXED_VERIFIER_MODEL_ID ||
      pack.review.humanApproved ||
      !pack.review.automatedVerifierApproved)
  ) {
    return "The generated pack did not match the server-owned model contract";
  }
  if (
    pack.source === "CATALOG" &&
    (pack.generatorModelId !== null ||
      pack.verifierModelId !== null ||
      !pack.review.humanApproved ||
      pack.review.automatedVerifierApproved)
  ) {
    return "The fallback pack did not match the reviewed-catalog contract";
  }

  const bankIds = new Set<string>();
  const topicIds = new Set<string>();
  const canonicalKeys = new Set<string>();
  const evidenceFactIds = new Set<string>();
  const batchCount = Math.ceil(pack.banks.length / QUIZSLOP_AI_BANKS_PER_BATCH);
  if (
    pack.usage.length > batchCount * 2 ||
    (pack.source === "AI" && pack.usage.length !== batchCount * 2) ||
    pack.usage.some(
      (usage) =>
        usage.requestedModelId !== state.generatorModelId &&
        usage.requestedModelId !== QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
    )
  ) {
    return "The frozen pack contained impossible model usage provenance";
  }
  if (state.generatorModelId !== QUIZSLOP_FIXED_VERIFIER_MODEL_ID) {
    const generatorCalls = pack.usage.filter(
      (usage) => usage.requestedModelId === state.generatorModelId,
    ).length;
    const verifierCalls = pack.usage.filter(
      (usage) => usage.requestedModelId === QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
    ).length;
    if (
      generatorCalls > batchCount ||
      verifierCalls > batchCount ||
      (pack.source === "AI" && (generatorCalls !== batchCount || verifierCalls !== batchCount))
    ) {
      return "The frozen pack contained impossible model call counts";
    }
  }
  for (const bank of pack.banks) {
    if (
      bankIds.has(bank.bankId) ||
      topicIds.has(bank.topic.id) ||
      canonicalKeys.has(bank.topic.canonicalKey) ||
      bank.questions.length !== QUIZSLOP_QUESTIONS_PER_TOPIC_BANK ||
      bank.topic.label.trim().length === 0 ||
      bank.topic.scope.trim().length === 0 ||
      !Number.isInteger(bank.topic.packVersion) ||
      bank.topic.packVersion < 1
    ) {
      return "The frozen pack contained a duplicate or malformed topic bank";
    }
    bankIds.add(bank.bankId);
    topicIds.add(bank.topic.id);
    canonicalKeys.add(bank.topic.canonicalKey);

    const tiers = new Set<string>();
    for (const question of bank.questions) {
      if (
        evidenceFactIds.has(question.evidenceFactId) ||
        tiers.has(question.tier) ||
        question.choices.length !== 4 ||
        !Number.isInteger(question.correctIndex) ||
        question.correctIndex < 0 ||
        question.correctIndex >= question.choices.length ||
        question.neutralQuestion.trim().length === 0 ||
        question.displayPrompt.trim().length === 0 ||
        question.canonicalFact.trim().length === 0 ||
        question.explanation.trim().length === 0 ||
        question.sources.length === 0 ||
        question.sources.filter((source) => source.primary).length !== 1
      ) {
        return "The frozen pack contained a duplicate or malformed question";
      }
      evidenceFactIds.add(question.evidenceFactId);
      tiers.add(question.tier);
    }
    if (!["EASY", "MEDIUM", "HARD", "INSANE"].every((tier) => tiers.has(tier))) {
      return "A topic bank was missing an adaptive difficulty tier";
    }
  }
  if (request) {
    try {
      assertFrozenPackMatchesRequest(request, pack);
    } catch {
      return "The frozen pack did not match the room's retained evidence";
    }
  }
  return null;
}
