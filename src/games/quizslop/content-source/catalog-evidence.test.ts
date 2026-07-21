import { describe, expect, it } from "vite-plus/test";
import { QUIZSLOP_TIERS } from "../types";
import {
  buildReviewedFreshPackRequest,
  listReviewedCatalogEvidence,
  resolveReviewedCatalogEvidence,
} from "./catalog-evidence";
import { resolveQuizSlopContentConfig } from "./content-config";

describe("QuizSlop trusted evidence adapter", () => {
  it("adapts all approved catalog topics without fetching URLs", () => {
    const bundles = listReviewedCatalogEvidence();
    expect(bundles).toHaveLength(25);
    for (const bundle of bundles) {
      expect(bundle.provenance).toBe("REVIEWED_CATALOG_SNAPSHOT");
      expect(bundle.facts).toHaveLength(4);
      expect(bundle.facts.map((fact) => fact.tier).toSorted()).toEqual(
        [...QUIZSLOP_TIERS].toSorted(),
      );
      expect(bundle.facts.every((fact) => fact.catalogReview.approved)).toBe(true);
    }
  });

  it("fails closed for missing catalog evidence", () => {
    expect(resolveReviewedCatalogEvidence("not-a-catalog-topic")).toEqual({
      kind: "UNAVAILABLE",
      reason: "NOT_FOUND",
    });
  });

  it("builds a complete preflight request with all 25 distinct four-tier banks", () => {
    const config = resolveQuizSlopContentConfig({
      mode: "AI",
      generatorModelId: "google/gemini-3.5-flash-lite",
    });
    if (config.mode !== "AI") throw new Error("expected AI config");
    const result = buildReviewedFreshPackRequest({
      packId: "pack:test",
      requestedAt: 123,
      config,
    });
    expect(result.kind).toBe("READY");
    if (result.kind !== "READY") return;
    expect(result.request.banks).toHaveLength(25);
    expect(new Set(result.request.banks.map((bank) => bank.topic.id)).size).toBe(25);
    expect(result.request.banks.every((bank) => bank.evidence.length === 4)).toBe(true);
  });
});
