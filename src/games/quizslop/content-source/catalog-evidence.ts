import { QUIZSLOP_TOPIC_CATALOG } from "../config/topic-catalog";
import { isShippableCatalogTopic } from "../catalog";
import type { QuizslopCatalogTopic } from "../types";
import type { QuizSlopContentConfig } from "./content-config";
import {
  quizSlopFreshPackRequestSchema,
  type QuizSlopFreshPackRequest,
  quizSlopSafeEvidenceFactSchema,
  type QuizSlopSafeEvidenceFact,
} from "./contracts";

interface QuizSlopTrustedEvidenceBundle {
  topic: {
    id: string;
    label: string;
    category: QuizslopCatalogTopic["category"];
    scope: string;
    exclusions: readonly string[];
    canonicalKey: string;
    packVersion: number;
    safetyNotes: readonly string[];
  };
  provenance: "REVIEWED_CATALOG_SNAPSHOT";
  facts: readonly QuizSlopSafeEvidenceFact[];
}

type QuizSlopEvidenceResolution =
  | { kind: "READY"; bundle: QuizSlopTrustedEvidenceBundle }
  | {
      kind: "UNAVAILABLE";
      reason: "NOT_FOUND" | "RETIRED" | "NOT_HUMAN_APPROVED" | "INVALID_SNAPSHOT";
    };

function adaptQuestion(
  topic: QuizslopCatalogTopic,
  question: QuizslopCatalogTopic["questions"][number],
): QuizSlopSafeEvidenceFact | null {
  const candidate = {
    id: `${topic.id}@${topic.packVersion}:${question.id}`,
    provenance: "REVIEWED_CATALOG_SNAPSHOT" as const,
    topicId: topic.id,
    tier: question.tier,
    neutralQuestion: question.neutralQuestion,
    fallbackDisplayPrompt: question.displayPrompt,
    choices: [...question.choices],
    correctIndex: question.correctIndex,
    canonicalFact: question.canonicalFact,
    fallbackExplanation: question.explanation,
    fallbackComedyDevices: [...question.comedyDevices],
    sources: question.sources.map((source) => ({ ...source })),
    catalogReview: {
      approved: true as const,
      reviewer: topic.review.reviewer ?? "",
      reviewedAt: topic.review.reviewedAt ?? "",
    },
  };
  const parsed = quizSlopSafeEvidenceFactSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Converts only retained, human-approved catalog snapshots into AI-readable
 * evidence. It never performs a network request and never accepts caller URLs.
 */
export function resolveReviewedCatalogEvidence(catalogTopicId: string): QuizSlopEvidenceResolution {
  const topic = QUIZSLOP_TOPIC_CATALOG.find((candidate) => candidate.id === catalogTopicId);
  if (!topic) return { kind: "UNAVAILABLE", reason: "NOT_FOUND" };
  if (topic.retired) return { kind: "UNAVAILABLE", reason: "RETIRED" };
  if (!isShippableCatalogTopic(topic)) {
    return { kind: "UNAVAILABLE", reason: "NOT_HUMAN_APPROVED" };
  }

  const facts = topic.questions.map((question) => adaptQuestion(topic, question));
  if (facts.some((fact) => fact === null)) {
    return { kind: "UNAVAILABLE", reason: "INVALID_SNAPSHOT" };
  }

  return {
    kind: "READY",
    bundle: {
      topic: {
        id: topic.id,
        label: topic.label,
        category: topic.category,
        scope: topic.scope,
        exclusions: topic.exclusions,
        canonicalKey: topic.canonicalKey,
        packVersion: topic.packVersion,
        safetyNotes: [],
      },
      provenance: "REVIEWED_CATALOG_SNAPSHOT",
      facts: facts.filter((fact): fact is QuizSlopSafeEvidenceFact => fact !== null),
    },
  };
}

export function listReviewedCatalogEvidence(): readonly QuizSlopTrustedEvidenceBundle[] {
  return QUIZSLOP_TOPIC_CATALOG.flatMap((topic) => {
    const resolution = resolveReviewedCatalogEvidence(topic.id);
    return resolution.kind === "READY" ? [resolution.bundle] : [];
  });
}

export type QuizSlopFreshPackRequestResolution =
  | { kind: "READY"; request: QuizSlopFreshPackRequest }
  | { kind: "FALLBACK_REQUIRED"; reason: "NO_TRUSTED_EVIDENCE" };

/** Builds the complete 25-bank lobby request from retained snapshots only. */
export function buildReviewedFreshPackRequest(args: {
  packId: string;
  requestedAt: number;
  config: Extract<QuizSlopContentConfig, { mode: "AI" }>;
}): QuizSlopFreshPackRequestResolution {
  const bundles = listReviewedCatalogEvidence();
  const parsed = quizSlopFreshPackRequestSchema.safeParse({
    purpose: "LOBBY_PREFLIGHT",
    packId: args.packId,
    requestedAt: args.requestedAt,
    config: args.config,
    banks: bundles.slice(0, 25).map((bundle) => ({
      bankId: `${bundle.topic.id}@${bundle.topic.packVersion}`,
      topic: bundle.topic,
      evidence: bundle.facts,
    })),
  });
  return parsed.success
    ? { kind: "READY", request: parsed.data }
    : { kind: "FALLBACK_REQUIRED", reason: "NO_TRUSTED_EVIDENCE" };
}
