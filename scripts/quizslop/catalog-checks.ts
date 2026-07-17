/**
 * Shared structural + approval-gate checks for the reviewed QuizSlop catalog and
 * voice bank. Imported by both CLI tasks (scripts/quizslop/*) and the vitest
 * guard (src/games/quizslop/config/topic-catalog.test.ts) so every surface
 * enforces the same contract. Every function returns human-readable failure
 * strings and never throws on bad content.
 *
 * Relative (extensionless) imports keep these runnable under the Node type-strip
 * loader, tsc bundler resolution, and vitest alike.
 */
import {
  codePointLength,
  isWellFormedText,
  validatePackStructure,
  validateQuestionContent,
} from "../../src/games/quizslop/content-validation";
import {
  computeCanonicalTopicKey,
  isCanonicalTopicKey,
  sha256Hex,
} from "../../src/games/quizslop/canonical-key";
import {
  MAX_FROZEN_TOPICS,
  MAX_TOPIC_EXCLUSION_LENGTH,
  MAX_TOPIC_EXCLUSIONS,
  MAX_TOPIC_LABEL_LENGTH,
  MAX_TOPIC_SCOPE_LENGTH,
  MIN_CATALOG_CATEGORIES,
  MIN_CATALOG_TOPICS,
} from "../../src/games/quizslop/game-constants";
import type {
  QuizslopCatalogTopic,
  QuizslopVoiceEventTag,
  QuizslopVoiceLine,
} from "../../src/games/quizslop/types";
import { SHIPPABLE_COMEDY_RATINGS } from "../../src/games/quizslop/types";
import { QUIZSLOP_VOICE_EVENT_TAGS } from "../../src/games/quizslop/config/voice-lines";

/** Every event tag must carry at least this many deterministic lines. */
export const MIN_VOICE_LINES_PER_TAG = 2;

function checkBoundedTopicText(
  failures: string[],
  topicId: string,
  field: string,
  text: string,
  maxLength: number,
): void {
  if (text.trim().length === 0) {
    failures.push(`topic ${topicId}: ${field} must not be empty`);
    return;
  }
  if (text !== text.trim()) {
    failures.push(`topic ${topicId}: ${field} must be trimmed`);
  }
  if (codePointLength(text) > maxLength) {
    failures.push(`topic ${topicId}: ${field} exceeds ${maxLength} characters`);
  }
  if (!isWellFormedText(text)) {
    failures.push(`topic ${topicId}: ${field} contains control characters or invalid Unicode`);
  }
}

/**
 * Deterministic structural validation of the whole catalog. Async because
 * canonical keys and content hashes are re-derived with the trusted helpers.
 */
export async function collectStructuralFailures(
  catalog: readonly QuizslopCatalogTopic[],
): Promise<string[]> {
  const failures: string[] = [];

  if (catalog.length < MIN_CATALOG_TOPICS) {
    failures.push(`catalog has ${catalog.length} topics; at least ${MIN_CATALOG_TOPICS} required`);
  }

  const nonRetired = catalog.filter((topic) => !topic.retired);
  if (nonRetired.length < MAX_FROZEN_TOPICS) {
    failures.push(
      `capacity invariant: ${nonRetired.length} non-retired topics; an eight-player game needs at least ${MAX_FROZEN_TOPICS} (8 Home + 1 warm-up + 3 finalists)`,
    );
  }

  const nonOtherCategories = new Set(
    nonRetired.map((topic) => topic.category).filter((category) => category !== "OTHER"),
  );
  if (nonOtherCategories.size < MIN_CATALOG_CATEGORIES) {
    failures.push(
      `catalog spans ${nonOtherCategories.size} non-OTHER categories among non-retired topics; at least ${MIN_CATALOG_CATEGORIES} required`,
    );
  }

  const topicIds = new Set<string>();
  const canonicalKeys = new Set<string>();
  const questionIds = new Set<string>();

  for (const topic of catalog) {
    if (topicIds.has(topic.id)) {
      failures.push(`duplicate topic id ${topic.id}`);
    }
    topicIds.add(topic.id);

    checkBoundedTopicText(failures, topic.id, "label", topic.label, MAX_TOPIC_LABEL_LENGTH);
    checkBoundedTopicText(failures, topic.id, "scope", topic.scope, MAX_TOPIC_SCOPE_LENGTH);

    if (topic.exclusions.length > MAX_TOPIC_EXCLUSIONS) {
      failures.push(`topic ${topic.id}: at most ${MAX_TOPIC_EXCLUSIONS} exclusions allowed`);
    }
    for (const [index, exclusion] of topic.exclusions.entries()) {
      checkBoundedTopicText(
        failures,
        topic.id,
        `exclusions[${index}]`,
        exclusion,
        MAX_TOPIC_EXCLUSION_LENGTH,
      );
    }

    if (!isCanonicalTopicKey(topic.canonicalKey)) {
      failures.push(`topic ${topic.id}: canonicalKey must be 64 lowercase hex characters`);
    } else {
      if (canonicalKeys.has(topic.canonicalKey)) {
        failures.push(`topic ${topic.id}: duplicate canonicalKey ${topic.canonicalKey}`);
      }
      canonicalKeys.add(topic.canonicalKey);
      const recomputed = await computeCanonicalTopicKey({
        label: topic.label,
        scope: topic.scope,
        exclusions: topic.exclusions,
      });
      if (recomputed !== topic.canonicalKey) {
        failures.push(
          `topic ${topic.id}: canonicalKey mismatch (stored ${topic.canonicalKey}, recomputed ${recomputed})`,
        );
      }
    }

    if (topic.packVersion < 1 || !Number.isInteger(topic.packVersion)) {
      failures.push(`topic ${topic.id}: packVersion must be a positive integer`);
    }

    for (const question of topic.questions) {
      if (questionIds.has(question.id)) {
        failures.push(`duplicate question id ${question.id}`);
      }
      questionIds.add(question.id);

      for (const issue of validateQuestionContent(question)) {
        failures.push(`topic ${topic.id} / ${issue.questionId}: ${issue.field} ${issue.message}`);
      }

      for (const [index, source] of question.sources.entries()) {
        const expected = await sha256Hex(source.supportExcerpt);
        if (expected !== source.contentHash) {
          failures.push(
            `topic ${topic.id} / ${question.id}: sources[${index}].contentHash mismatch (stored ${source.contentHash}, expected ${expected})`,
          );
        }
      }
    }

    for (const issue of validatePackStructure(topic.questions)) {
      failures.push(`topic ${topic.id} pack: ${issue.field} ${issue.message}`);
    }
  }

  return failures;
}

/** Structural validation of the deterministic voice bank. */
export function collectVoiceBankFailures(voiceLines: readonly QuizslopVoiceLine[]): string[] {
  const failures: string[] = [];

  const ids = new Set<string>();
  const countByTag = new Map<QuizslopVoiceEventTag, number>();

  for (const line of voiceLines) {
    if (ids.has(line.id)) {
      failures.push(`duplicate voice line id ${line.id}`);
    }
    ids.add(line.id);

    if (!QUIZSLOP_VOICE_EVENT_TAGS.includes(line.tag)) {
      failures.push(`voice line ${line.id}: unknown tag ${line.tag}`);
    }
    countByTag.set(line.tag, (countByTag.get(line.tag) ?? 0) + 1);

    if (line.text.trim().length === 0) {
      failures.push(`voice line ${line.id}: text must not be empty`);
    }
    if (!isWellFormedText(line.text)) {
      failures.push(`voice line ${line.id}: text contains control characters or invalid Unicode`);
    }
    if (line.accessibleLabel.trim().length === 0) {
      failures.push(`voice line ${line.id}: accessibleLabel must not be empty`);
    }
    if (!isWellFormedText(line.accessibleLabel)) {
      failures.push(`voice line ${line.id}: accessibleLabel contains invalid characters`);
    }
  }

  for (const tag of QUIZSLOP_VOICE_EVENT_TAGS) {
    const count = countByTag.get(tag) ?? 0;
    if (count < MIN_VOICE_LINES_PER_TAG) {
      failures.push(
        `voice tag ${tag} has ${count} lines; at least ${MIN_VOICE_LINES_PER_TAG} required`,
      );
    }
  }

  return failures;
}

function collectReviewAttributionFailures(
  label: string,
  review: { reviewer: string | null; reviewedAt: string | null },
): string[] {
  const failures: string[] = [];
  if (review.reviewer === null || review.reviewer.trim().length === 0) {
    failures.push(`${label}: reviewer must name the approving human`);
  }
  const reviewedAt = review.reviewedAt === null ? Number.NaN : Date.parse(review.reviewedAt);
  if (
    !Number.isFinite(reviewedAt) ||
    review.reviewedAt === null ||
    new Date(reviewedAt).toISOString() !== review.reviewedAt
  ) {
    failures.push(`${label}: reviewedAt must be a canonical ISO timestamp`);
  }
  return failures;
}

/**
 * Production approval gate. Fails while any selectable pack or voice line is
 * still draft. This is the human product gate and is EXPECTED to fail until a
 * named reviewer approves the content.
 */
export function collectApprovalFailures(
  catalog: readonly QuizslopCatalogTopic[],
  voiceLines: readonly QuizslopVoiceLine[],
): string[] {
  const failures: string[] = [];

  for (const topic of catalog) {
    if (topic.retired) {
      continue;
    }
    const review = topic.review;
    if (review.approved !== true) {
      failures.push(`topic ${topic.id}: review.approved is not true (still draft)`);
    }
    if (review.factualState !== "APPROVED") {
      failures.push(`topic ${topic.id}: factualState is ${review.factualState}, expected APPROVED`);
    }
    if (review.comedyState !== "APPROVED") {
      failures.push(`topic ${topic.id}: comedyState is ${review.comedyState}, expected APPROVED`);
    }
    if (review.comedyRating === null || !SHIPPABLE_COMEDY_RATINGS.includes(review.comedyRating)) {
      failures.push(
        `topic ${topic.id}: comedyRating is ${String(review.comedyRating)}, expected one of ${SHIPPABLE_COMEDY_RATINGS.join(", ")}`,
      );
    }
    failures.push(...collectReviewAttributionFailures(`topic ${topic.id}`, review));
  }

  for (const line of voiceLines) {
    if (line.review.approved !== true) {
      failures.push(`voice line ${line.id}: review.approved is not true (still draft)`);
    }
    failures.push(...collectReviewAttributionFailures(`voice line ${line.id}`, line.review));
  }

  return failures;
}

export interface CatalogCheckOptions {
  requireApproved: boolean;
}

/**
 * Full check run used by the CLI validator and the vitest guard. Structural
 * failures always apply; approval failures apply only in --require-approved mode.
 */
export async function collectAllFailures(
  catalog: readonly QuizslopCatalogTopic[],
  voiceLines: readonly QuizslopVoiceLine[],
  options: CatalogCheckOptions,
): Promise<string[]> {
  const failures = [
    ...(await collectStructuralFailures(catalog)),
    ...collectVoiceBankFailures(voiceLines),
  ];
  if (options.requireApproved) {
    failures.push(...collectApprovalFailures(catalog, voiceLines));
  }
  return failures;
}
