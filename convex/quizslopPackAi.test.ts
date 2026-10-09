// @vitest-environment node

import { describe, expect, test } from "vite-plus/test";
import { calculateCostUsd } from "../src/lib/models";
import { buildReviewedFreshPackRequest } from "../src/games/quizslop/content-source/catalog-evidence";
import { resolveQuizSlopContentConfig } from "../src/games/quizslop/content-source/content-config";
import {
  quizSlopFreshPackBatchSchema,
  quizSlopGeneratedBatchSchema,
  type QuizSlopFreshPackBatch,
} from "../src/games/quizslop/content-source/contracts";
import { generationPayload, judgeDecision, judgePayload, usageFor } from "./quizslopPackAiBoundary";

const GENERATOR_MODEL_ID = "anthropic/claude-haiku-5.5";

function reviewedBatch() {
  const config = resolveQuizSlopContentConfig({
    mode: "AI",
    generatorModelId: GENERATOR_MODEL_ID,
  });
  if (config.mode !== "AI") throw new Error("Expected an AI content config");
  const resolution = buildReviewedFreshPackRequest({
    packId: "pack:prompt-boundary",
    requestedAt: 123,
    config,
  });
  if (resolution.kind !== "READY") throw new Error("Expected retained catalog evidence");
  return quizSlopFreshPackBatchSchema.parse({
    ...resolution.request,
    banks: resolution.request.banks.slice(0, 4),
  });
}

function generatedFor(batch: QuizSlopFreshPackBatch) {
  return quizSlopGeneratedBatchSchema.parse({
    banks: batch.banks.map((bank) => ({
      bankId: bank.bankId,
      topicId: bank.topic.id,
      questions: bank.evidence.map((fact) => ({
        evidenceFactId: fact.id,
        displayPrompt: fact.fallbackDisplayPrompt,
        choices: [...fact.choices],
        correctAnswer: fact.choices[fact.correctIndex],
        explanation: fact.fallbackExplanation,
        comedyDevices: [...fact.fallbackComedyDevices],
      })),
    })),
  });
}

describe("QuizSlop AI pack action boundaries", () => {
  test("sends only retained support snapshots and never source URLs to the generator", () => {
    const payload = generationPayload(reviewedBatch());
    for (const bank of payload) {
      for (const fact of bank.evidence) {
        for (const support of fact.retainedSupport) {
          expect(support).toEqual({
            title: expect.any(String),
            locator: expect.any(String),
            supportExcerpt: expect.any(String),
            contentHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
          });
          expect(support).not.toHaveProperty("url");
        }
      }
    }
  });

  test("prices an unknown provider revision through its requested catalog alias", () => {
    const usage = usageFor(
      GENERATOR_MODEL_ID,
      "anthropic/claude-haiku-5.5-20260718-provider-revision",
      { inputTokens: 1_000, outputTokens: 500 },
    );
    expect(usage.actualModelId).toBe("anthropic/claude-haiku-5.5-20260718-provider-revision");
    expect(usage.costUsd).toBe(calculateCostUsd(GENERATOR_MODEL_ID, 1_000, 500));
    expect(usage.costUsd).toBeGreaterThan(0);
  });

  test("asks the decision judge about each question beside its own trusted fact", () => {
    const batch = reviewedBatch();
    const { topics, items } = judgePayload(batch, generatedFor(batch));
    expect(Object.keys(topics)).toEqual(batch.banks.map((bank) => bank.bankId));
    expect(items).toHaveLength(batch.banks.length * 4);
    expect(items.map((item) => item.key).slice(0, 3)).toEqual(["q0", "q1", "q2"]);
    for (const item of items) {
      expect(item.trusted?.evidenceFactId).toBe(item.evidenceFactId);
      expect(item.generated.evidenceFactId).toBe(item.evidenceFactId);
      for (const support of item.trusted?.retainedSupport ?? []) {
        expect(Object.keys(support).toSorted()).toEqual(["locator", "supportExcerpt", "title"]);
      }
    }
  });

  test("approves a Free Play batch only when the judge confidently passes every question", () => {
    const items = [
      { key: "q0", bankId: "bank-1", evidenceFactId: "fact-1" },
      { key: "q1", bankId: "bank-1", evidenceFactId: "fact-2" },
    ];
    expect(
      judgeDecision(
        items,
        {
          q0: { choice: "PASS", probabilities: { PASS: 0.9, AMBIGUOUS: 0.1 } },
          q1: { choice: "PASS" },
        },
        "Jev",
      ),
    ).toEqual({ approved: true, issues: [] });

    const rejected = judgeDecision(
      [...items, { key: "q2", bankId: "bank-2", evidenceFactId: "fact-3" }],
      {
        q0: { choice: "ANSWER_LEAK", probabilities: { ANSWER_LEAK: 0.8, PASS: 0.2 } },
        q1: {
          choice: "PASS",
          probabilities: { PASS: 0.4, AMBIGUOUS: 0.35, FLAT_OR_TRY_HARD: 0.25 },
        },
      },
      "Jev",
    );
    expect(rejected.approved).toBe(false);
    expect(rejected.issues).toEqual([
      {
        bankId: "bank-1",
        evidenceFactId: "fact-1",
        code: "ANSWER_LEAK",
        detail: "Jev ruled ANSWER_LEAK (PASS 20%)",
      },
      {
        bankId: "bank-1",
        evidenceFactId: "fact-2",
        code: "AMBIGUOUS",
        detail: "Jev ruled AMBIGUOUS (PASS 40%)",
      },
      {
        bankId: "bank-2",
        evidenceFactId: "fact-3",
        code: "OTHER",
        detail: "Jev ruled nothing (PASS 0%)",
      },
    ]);
  });
});
