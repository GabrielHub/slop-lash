import { describe, expect, it } from "vite-plus/test";
import { listReviewedCatalogEvidence } from "./catalog-evidence";
import { resolveQuizSlopContentConfig } from "./content-config";
import {
  QUIZSLOP_AI_BANKS_PER_BATCH,
  quizSlopFreshPackBatchSchema,
  quizSlopFreshPackRequestSchema,
  type QuizSlopFreshPackRequest,
  type QuizSlopGeneratedPack,
} from "./contracts";
import {
  assertFrozenPackMatchesRequest,
  buildCatalogFallbackPack,
  InvalidQuizSlopGeneratedPackError,
  materializeGeneratedPack,
} from "./pack-materialization";

function request(): QuizSlopFreshPackRequest {
  const config = resolveQuizSlopContentConfig({
    mode: "AI",
    generatorModelId: "google/gemini-3.1-flash-lite",
  });
  if (config.mode !== "AI") throw new Error("expected AI config");
  return quizSlopFreshPackRequestSchema.parse({
    purpose: "LOBBY_PREFLIGHT",
    packId: "pack-test-1",
    requestedAt: 123_456,
    config,
    banks: listReviewedCatalogEvidence()
      .slice(0, 24)
      .map((bundle, index) => ({
        bankId: `bank-${index + 1}`,
        topic: bundle.topic,
        evidence: bundle.facts,
      })),
  });
}

function generatedPack(source: QuizSlopFreshPackRequest): QuizSlopGeneratedPack {
  return {
    banks: source.banks.map((bank) => ({
      bankId: bank.bankId,
      topicId: bank.topic.id,
      questions: bank.evidence.map((fact) => ({
        evidenceFactId: fact.id,
        displayPrompt: fact.fallbackDisplayPrompt,
        choices: [...fact.choices].reverse(),
        correctAnswer: fact.choices[fact.correctIndex] as string,
        explanation: fact.fallbackExplanation,
        comedyDevices: [...fact.fallbackComedyDevices],
      })),
    })),
  };
}

describe("QuizSlop frozen pack materialization", () => {
  it("requires enough distinct four-tier banks for every possible official assignment", () => {
    const valid = request();
    expect(valid.banks).toHaveLength(24);
    expect(
      quizSlopFreshPackRequestSchema.safeParse({ ...valid, banks: valid.banks.slice(0, 23) })
        .success,
    ).toBe(false);
    expect(
      quizSlopFreshPackRequestSchema.safeParse({
        ...valid,
        banks: [...valid.banks.slice(0, 23), valid.banks[0]],
      }).success,
    ).toBe(false);
  });

  it("limits each generation/verifier action to a small bank batch", () => {
    const valid = request();
    const batch = { ...valid, banks: valid.banks.slice(0, QUIZSLOP_AI_BANKS_PER_BATCH) };
    expect(quizSlopFreshPackBatchSchema.safeParse(batch).success).toBe(true);
    expect(
      quizSlopFreshPackBatchSchema.safeParse({
        ...batch,
        banks: valid.banks.slice(0, QUIZSLOP_AI_BANKS_PER_BATCH + 1),
      }).success,
    ).toBe(false);
  });

  it("builds a complete reviewed fallback with no partial AI content", () => {
    const pack = buildCatalogFallbackPack(request());
    expect(pack.source).toBe("CATALOG");
    expect(pack.review).toEqual({ humanApproved: true, automatedVerifierApproved: false });
    expect(pack.banks).toHaveLength(24);
    expect(pack.banks.every((bank) => bank.questions.length === 4)).toBe(true);
  });

  it("freezes verified AI copy while retaining evidence facts and hidden tiers", () => {
    const source = request();
    const pack = materializeGeneratedPack(source, generatedPack(source), []);
    expect(pack.source).toBe("AI");
    expect(pack.review).toEqual({ humanApproved: false, automatedVerifierApproved: true });
    expect(pack.banks).toHaveLength(24);
    expect(pack.banks.flatMap((bank) => bank.questions)).toHaveLength(96);
    expect(pack.banks[0]?.questions.map((question) => question.tier).toSorted()).toEqual([
      "EASY",
      "HARD",
      "INSANE",
      "MEDIUM",
    ]);
  });

  it("rejects a model that changes the reviewed answer key", () => {
    const source = request();
    const generated = generatedPack(source);
    const first = generated.banks[0]?.questions[0];
    if (!first) throw new Error("fixture question missing");
    first.correctAnswer = "Definitely not the reviewed answer";
    expect(() => materializeGeneratedPack(source, generated, [])).toThrow(
      InvalidQuizSlopGeneratedPackError,
    );
  });

  it("rebinds frozen facts and source snapshots to the exact room request", () => {
    const source = request();
    const pack = buildCatalogFallbackPack(source);
    expect(() => assertFrozenPackMatchesRequest(source, pack)).not.toThrow();

    const first = pack.banks[0]?.questions[0];
    if (!first) throw new Error("fixture question missing");
    first.sources[0] = {
      ...(first.sources[0] as (typeof first.sources)[number]),
      supportExcerpt: "A replacement excerpt that was never reviewed.",
    };
    expect(() => assertFrozenPackMatchesRequest(source, pack)).toThrow(
      InvalidQuizSlopGeneratedPackError,
    );
  });
});
