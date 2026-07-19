// @vitest-environment node

import { describe, expect, test } from "vite-plus/test";
import { calculateCostUsd } from "../src/lib/models";
import { buildReviewedFreshPackRequest } from "../src/games/quizslop/content-source/catalog-evidence";
import { resolveQuizSlopContentConfig } from "../src/games/quizslop/content-source/content-config";
import { quizSlopFreshPackBatchSchema } from "../src/games/quizslop/content-source/contracts";
import { generationPayload, usageFor } from "./quizslopPackAiBoundary";

const GENERATOR_MODEL_ID = "anthropic/claude-haiku-4.5";

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
      "anthropic/claude-haiku-4.5-20260718-provider-revision",
      { inputTokens: 1_000, outputTokens: 500 },
    );
    expect(usage.actualModelId).toBe("anthropic/claude-haiku-4.5-20260718-provider-revision");
    expect(usage.costUsd).toBe(calculateCostUsd(GENERATOR_MODEL_ID, 1_000, 500));
    expect(usage.costUsd).toBeGreaterThan(0);
  });
});
