import { validatePackStructure, validateQuestionContent } from "../content-validation";
import type { QuizslopQuestionContent } from "../types";
import {
  QUIZSLOP_AI_PROMPT_VERSION,
  QUIZSLOP_AI_SCHEMA_VERSION,
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
} from "./content-config";
import {
  quizSlopFreshPackBatchSchema,
  quizSlopFreshPackRequestSchema,
  quizSlopFrozenPackSchema,
  quizSlopGeneratedBatchSchema,
  quizSlopGeneratedPackSchema,
  type QuizSlopFreshPackBatch,
  type QuizSlopFreshPackRequest,
  type QuizSlopFrozenPack,
  type QuizSlopGeneratedPack,
  type QuizSlopGeneratedBatch,
  type QuizSlopGeneratedQuestion,
  type QuizSlopGeneratedTopicBank,
  type QuizSlopModelUsage,
  type QuizSlopSafeEvidenceFact,
} from "./contracts";

export class InvalidQuizSlopGeneratedPackError extends Error {
  override readonly name = "InvalidQuizSlopGeneratedPackError";

  constructor(readonly reason: string) {
    super(`[INVALID_GENERATOR_OUTPUT] ${reason}`);
  }
}

function requireValidRequest(request: QuizSlopFreshPackRequest): QuizSlopFreshPackRequest {
  const parsed = quizSlopFreshPackRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new InvalidQuizSlopGeneratedPackError("preflight request failed validation");
  }
  return parsed.data;
}

function structurallyValidateQuestion(question: QuizslopQuestionContent): void {
  if (validateQuestionContent(question).length > 0) {
    throw new InvalidQuizSlopGeneratedPackError("a question violated the content contract");
  }
}

function requireExactChoicePermutation(
  generatedChoices: readonly string[],
  trustedChoices: readonly string[],
): readonly string[] {
  if (generatedChoices.length !== trustedChoices.length) {
    throw new InvalidQuizSlopGeneratedPackError("choice count changed");
  }
  const remaining = [...trustedChoices];
  const canonical: string[] = [];
  for (const choice of generatedChoices) {
    const index = remaining.indexOf(choice);
    if (index < 0) {
      throw new InvalidQuizSlopGeneratedPackError("choice text departed from trusted evidence");
    }
    const matchedChoice = remaining[index];
    if (matchedChoice === undefined) {
      throw new InvalidQuizSlopGeneratedPackError("choice text departed from trusted evidence");
    }
    canonical.push(matchedChoice);
    remaining.splice(index, 1);
  }
  if (remaining.length > 0) {
    throw new InvalidQuizSlopGeneratedPackError("choice set is incomplete");
  }
  return canonical;
}

function materializeQuestion(
  evidence: QuizSlopSafeEvidenceFact,
  generated?: QuizSlopGeneratedQuestion,
) {
  const choices = generated
    ? requireExactChoicePermutation(generated.choices, evidence.choices)
    : evidence.choices;
  const trustedCorrectAnswer = evidence.choices[evidence.correctIndex];
  if (!trustedCorrectAnswer) {
    throw new InvalidQuizSlopGeneratedPackError("trusted answer index is invalid");
  }
  if (generated && generated.correctAnswer !== trustedCorrectAnswer) {
    throw new InvalidQuizSlopGeneratedPackError("generator changed the trusted answer key");
  }
  const correctIndex = choices.indexOf(trustedCorrectAnswer);
  if (correctIndex < 0) {
    throw new InvalidQuizSlopGeneratedPackError("trusted answer is missing from choices");
  }

  const question: QuizslopQuestionContent = {
    id: evidence.id,
    tier: evidence.tier,
    neutralQuestion: evidence.neutralQuestion,
    displayPrompt: generated?.displayPrompt ?? evidence.fallbackDisplayPrompt,
    choices,
    correctIndex,
    canonicalFact: evidence.canonicalFact,
    explanation: generated?.explanation ?? evidence.fallbackExplanation,
    comedyDevices: generated?.comedyDevices ?? evidence.fallbackComedyDevices,
    sources: evidence.sources,
  };
  structurallyValidateQuestion(question);
  return {
    evidenceFactId: evidence.id,
    tier: evidence.tier,
    neutralQuestion: question.neutralQuestion,
    displayPrompt: question.displayPrompt,
    choices: [...question.choices],
    correctIndex: question.correctIndex,
    canonicalFact: question.canonicalFact,
    explanation: question.explanation,
    comedyDevices: [...question.comedyDevices],
    sources: question.sources.map((source) => ({ ...source })),
  };
}

function structurallyValidateFrozenBank(
  questions: readonly ReturnType<typeof materializeQuestion>[],
): void {
  const content = questions.map((question) => ({
    id: question.evidenceFactId,
    tier: question.tier,
    neutralQuestion: question.neutralQuestion,
    displayPrompt: question.displayPrompt,
    choices: question.choices,
    correctIndex: question.correctIndex,
    canonicalFact: question.canonicalFact,
    explanation: question.explanation,
    comedyDevices: question.comedyDevices,
    sources: question.sources,
  }));
  if (validatePackStructure(content).length > 0) {
    throw new InvalidQuizSlopGeneratedPackError("a topic bank violated the pack contract");
  }
}

function fallbackBank(bank: QuizSlopFreshPackRequest["banks"][number]) {
  const questions = bank.evidence.map((evidence) => materializeQuestion(evidence));
  structurallyValidateFrozenBank(questions);
  return {
    bankId: bank.bankId,
    topic: bank.topic,
    questions,
  };
}

function materializeGeneratedBanks(
  requestedBanks: readonly QuizSlopFreshPackRequest["banks"][number][],
  generatedBanks: readonly QuizSlopGeneratedTopicBank[],
) {
  if (generatedBanks.length !== requestedBanks.length) {
    throw new InvalidQuizSlopGeneratedPackError("topic-bank count changed");
  }
  const generatedByBank = new Map(generatedBanks.map((bank) => [bank.bankId, bank]));
  if (generatedByBank.size !== generatedBanks.length) {
    throw new InvalidQuizSlopGeneratedPackError("generator repeated a bank ID");
  }

  return requestedBanks.map((bank) => {
    const generatedBank = generatedByBank.get(bank.bankId);
    if (!generatedBank) {
      throw new InvalidQuizSlopGeneratedPackError("generator omitted a topic bank");
    }
    if (generatedBank.topicId !== bank.topic.id) {
      throw new InvalidQuizSlopGeneratedPackError("generator changed a topic-bank identity");
    }
    const generatedByEvidence = new Map(
      generatedBank.questions.map((question) => [question.evidenceFactId, question]),
    );
    if (generatedByEvidence.size !== generatedBank.questions.length) {
      throw new InvalidQuizSlopGeneratedPackError("generator repeated an evidence fact");
    }
    const questions = bank.evidence.map((evidence) => {
      const question = generatedByEvidence.get(evidence.id);
      if (!question) {
        throw new InvalidQuizSlopGeneratedPackError("generator omitted an evidence fact");
      }
      return materializeQuestion(evidence, question);
    });
    structurallyValidateFrozenBank(questions);
    return { bankId: bank.bankId, topic: bank.topic, questions };
  });
}

function exactJsonMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Rebinds a frozen result to the exact retained request used for this room.
 * This is deliberately repeated at the persistence boundary so a stale
 * workflow result from a previous deployment cannot smuggle different facts,
 * sources, topic metadata, or answer keys into a scoreable pack.
 */
export function assertFrozenPackMatchesRequest(
  unsafeRequest: QuizSlopFreshPackRequest,
  unsafePack: QuizSlopFrozenPack,
): void {
  const request = requireValidRequest(unsafeRequest);
  const parsedPack = quizSlopFrozenPackSchema.safeParse(unsafePack);
  if (!parsedPack.success) {
    throw new InvalidQuizSlopGeneratedPackError("frozen pack failed validation");
  }
  const pack = parsedPack.data;
  if (
    pack.id !== request.packId ||
    pack.frozenAt !== request.requestedAt ||
    pack.promptVersion !== request.config.promptVersion ||
    pack.schemaVersion !== request.config.schemaVersion ||
    pack.banks.length !== request.banks.length
  ) {
    throw new InvalidQuizSlopGeneratedPackError("frozen pack header changed its request");
  }
  if (
    pack.source === "AI"
      ? pack.generatorModelId !== request.config.generatorModelId ||
        pack.verifierModelId !== request.config.verifierModelId ||
        pack.review.humanApproved ||
        !pack.review.automatedVerifierApproved
      : pack.generatorModelId !== null ||
        pack.verifierModelId !== null ||
        !pack.review.humanApproved ||
        pack.review.automatedVerifierApproved
  ) {
    throw new InvalidQuizSlopGeneratedPackError("frozen pack changed its review provenance");
  }

  const banksById = new Map(pack.banks.map((bank) => [bank.bankId, bank]));
  if (banksById.size !== pack.banks.length) {
    throw new InvalidQuizSlopGeneratedPackError("frozen pack repeated a bank ID");
  }
  for (const requestedBank of request.banks) {
    const frozenBank = banksById.get(requestedBank.bankId);
    if (!frozenBank || !exactJsonMatch(frozenBank.topic, requestedBank.topic)) {
      throw new InvalidQuizSlopGeneratedPackError("frozen pack changed a topic bank");
    }
    const questionsByEvidence = new Map(
      frozenBank.questions.map((question) => [question.evidenceFactId, question]),
    );
    if (questionsByEvidence.size !== frozenBank.questions.length) {
      throw new InvalidQuizSlopGeneratedPackError("frozen pack repeated an evidence fact");
    }
    const reboundQuestions = requestedBank.evidence.map((evidence) => {
      const frozenQuestion = questionsByEvidence.get(evidence.id);
      if (!frozenQuestion) {
        throw new InvalidQuizSlopGeneratedPackError("frozen pack omitted an evidence fact");
      }
      const selectedAnswer = frozenQuestion.choices[frozenQuestion.correctIndex];
      if (!selectedAnswer) {
        throw new InvalidQuizSlopGeneratedPackError("frozen pack answer index is invalid");
      }
      const rebound = materializeQuestion(
        evidence,
        pack.source === "AI"
          ? {
              evidenceFactId: frozenQuestion.evidenceFactId,
              displayPrompt: frozenQuestion.displayPrompt,
              choices: frozenQuestion.choices,
              correctAnswer: selectedAnswer,
              explanation: frozenQuestion.explanation,
              comedyDevices: frozenQuestion.comedyDevices,
            }
          : undefined,
      );
      if (!exactJsonMatch(rebound, frozenQuestion)) {
        throw new InvalidQuizSlopGeneratedPackError(
          "frozen question departed from its retained evidence",
        );
      }
      return rebound;
    });
    structurallyValidateFrozenBank(reboundQuestions);
  }
}

export function assertGeneratedBatchMatchesEvidence(
  unsafeBatch: QuizSlopFreshPackBatch,
  unsafeGenerated: QuizSlopGeneratedBatch,
): void {
  const parsedBatch = quizSlopFreshPackBatchSchema.safeParse(unsafeBatch);
  const parsedGenerated = quizSlopGeneratedBatchSchema.safeParse(unsafeGenerated);
  if (!parsedBatch.success || !parsedGenerated.success) {
    throw new InvalidQuizSlopGeneratedPackError("generated batch failed validation");
  }
  materializeGeneratedBanks(parsedBatch.data.banks, parsedGenerated.data.banks);
}

export function buildCatalogFallbackPack(
  unsafeRequest: QuizSlopFreshPackRequest,
  usage: readonly QuizSlopModelUsage[] = [],
): QuizSlopFrozenPack {
  const request = requireValidRequest(unsafeRequest);
  const pack: QuizSlopFrozenPack = {
    id: request.packId,
    source: "CATALOG",
    frozenAt: request.requestedAt,
    promptVersion: QUIZSLOP_AI_PROMPT_VERSION,
    schemaVersion: QUIZSLOP_AI_SCHEMA_VERSION,
    generatorModelId: null,
    verifierModelId: null,
    banks: request.banks.map(fallbackBank),
    review: { humanApproved: true, automatedVerifierApproved: false },
    usage: [...usage],
  };
  assertFrozenPackMatchesRequest(request, pack);
  return pack;
}

export function materializeGeneratedPack(
  unsafeRequest: QuizSlopFreshPackRequest,
  unsafeGenerated: QuizSlopGeneratedPack,
  usage: readonly QuizSlopModelUsage[],
): QuizSlopFrozenPack {
  const request = requireValidRequest(unsafeRequest);
  const parsedGenerated = quizSlopGeneratedPackSchema.safeParse(unsafeGenerated);
  if (!parsedGenerated.success) {
    throw new InvalidQuizSlopGeneratedPackError("structured output failed validation");
  }
  const generated = parsedGenerated.data;
  const banks = materializeGeneratedBanks(request.banks, generated.banks);

  const pack: QuizSlopFrozenPack = {
    id: request.packId,
    source: "AI",
    frozenAt: request.requestedAt,
    promptVersion: request.config.promptVersion,
    schemaVersion: request.config.schemaVersion,
    generatorModelId: request.config.generatorModelId,
    verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
    banks,
    review: { humanApproved: false, automatedVerifierApproved: true },
    usage: [...usage],
  };
  assertFrozenPackMatchesRequest(request, pack);
  return pack;
}
