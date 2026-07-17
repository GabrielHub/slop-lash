import {
  CHOICES_PER_QUESTION,
  MAX_CANONICAL_FACT_LENGTH,
  MAX_CHOICE_LENGTH,
  MAX_COMEDY_DEVICES_PER_QUESTION,
  MAX_DISPLAY_PROMPT_LENGTH,
  MAX_EXPLANATION_LENGTH,
  MAX_NEUTRAL_QUESTION_LENGTH,
  MAX_SOURCE_EXCERPT_LENGTH,
  MAX_SOURCE_LOCATOR_LENGTH,
  MAX_SOURCE_TITLE_LENGTH,
  MAX_SOURCE_URL_LENGTH,
  MAX_SOURCES_PER_QUESTION,
  MIN_PRIMARY_COMEDY_DEVICES_PER_PACK,
  MIN_SOURCES_PER_QUESTION,
  QUESTIONS_PER_PACK,
  SHA256_HEX_LENGTH,
} from "./game-constants";
import type { QuizslopQuestionContent, QuizslopTier } from "./types";
import { QUIZSLOP_TIERS } from "./types";
import { canonicalizeTopicText } from "./canonical-key";

/**
 * Deterministic structural validation shared by the catalog tasks, the pack
 * freeze gate, and tests. Everything here is exact after Unicode
 * normalization; semantic duplicate and ambiguity checks belong to the
 * bounded verifier and are never described as deterministic.
 */

export function hasControlCharacters(text: string): boolean {
  return Array.from(text).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    );
  });
}

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

function hasOnlyPairedSurrogates(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function isWellFormedText(text: string): boolean {
  return hasOnlyPairedSurrogates(text) && !hasControlCharacters(text);
}

/**
 * Exact-duplicate normalization: NFKC, casefold, punctuation and space collapse.
 * Shares the single canonicalization pass with topic keys so the two never drift.
 */
export function normalizeForDuplicateCheck(text: string): string {
  return canonicalizeTopicText(text);
}

export interface QuestionValidationIssue {
  questionId: string;
  field: string;
  message: string;
}

function issue(questionId: string, field: string, message: string): QuestionValidationIssue {
  return { questionId, field, message };
}

function checkBoundedText(
  issues: QuestionValidationIssue[],
  questionId: string,
  field: string,
  text: string,
  maxLength: number,
): void {
  if (text.trim().length === 0) {
    issues.push(issue(questionId, field, "must not be empty"));
    return;
  }
  if (text !== text.trim()) {
    issues.push(issue(questionId, field, "must be trimmed"));
  }
  if (codePointLength(text) > maxLength) {
    issues.push(issue(questionId, field, `exceeds ${maxLength} characters`));
  }
  if (!isWellFormedText(text)) {
    issues.push(issue(questionId, field, "contains control characters or invalid Unicode"));
  }
}

const BANNED_CHOICE_PATTERNS = [/^all of the above$/iu, /^none of the above$/iu];
const NEGATIVE_STEM_PATTERN = /\b(?:not|never|except)\b/iu;

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

/** Structural checks for one playable question. */
export function validateQuestionContent(
  question: QuizslopQuestionContent,
): readonly QuestionValidationIssue[] {
  const issues: QuestionValidationIssue[] = [];
  const id = question.id;

  checkBoundedText(
    issues,
    id,
    "neutralQuestion",
    question.neutralQuestion,
    MAX_NEUTRAL_QUESTION_LENGTH,
  );
  checkBoundedText(issues, id, "displayPrompt", question.displayPrompt, MAX_DISPLAY_PROMPT_LENGTH);
  checkBoundedText(issues, id, "canonicalFact", question.canonicalFact, MAX_CANONICAL_FACT_LENGTH);
  checkBoundedText(issues, id, "explanation", question.explanation, MAX_EXPLANATION_LENGTH);

  if (!QUIZSLOP_TIERS.includes(question.tier)) {
    issues.push(issue(id, "tier", "must be one of the four internal tiers"));
  }

  if (question.choices.length !== CHOICES_PER_QUESTION) {
    issues.push(issue(id, "choices", `must have exactly ${CHOICES_PER_QUESTION} choices`));
  }
  const normalizedChoices = question.choices.map(normalizeForDuplicateCheck);
  if (new Set(normalizedChoices).size !== question.choices.length) {
    issues.push(issue(id, "choices", "must be distinct after normalization"));
  }
  for (const [index, choice] of question.choices.entries()) {
    checkBoundedText(issues, id, `choices[${index}]`, choice, MAX_CHOICE_LENGTH);
    // Match against the normalized form so trailing punctuation ("All of the
    // above.") or hyphenation cannot slip a banned meta-choice past the anchor.
    if (BANNED_CHOICE_PATTERNS.some((pattern) => pattern.test(normalizeForDuplicateCheck(choice)))) {
      issues.push(issue(id, `choices[${index}]`, "all/none of the above is not allowed"));
    }
  }

  if (
    !Number.isInteger(question.correctIndex) ||
    question.correctIndex < 0 ||
    question.correctIndex >= question.choices.length
  ) {
    issues.push(issue(id, "correctIndex", "must index one of the four choices"));
  }

  if (NEGATIVE_STEM_PATTERN.test(question.neutralQuestion)) {
    issues.push(issue(id, "neutralQuestion", "must not depend on a negative stem"));
  }

  if (
    question.comedyDevices.length < 1 ||
    question.comedyDevices.length > MAX_COMEDY_DEVICES_PER_QUESTION
  ) {
    issues.push(
      issue(id, "comedyDevices", `must list 1-${MAX_COMEDY_DEVICES_PER_QUESTION} ordered devices`),
    );
  }
  if (new Set(question.comedyDevices).size !== question.comedyDevices.length) {
    issues.push(issue(id, "comedyDevices", "must not repeat a device"));
  }

  if (
    question.sources.length < MIN_SOURCES_PER_QUESTION ||
    question.sources.length > MAX_SOURCES_PER_QUESTION
  ) {
    issues.push(
      issue(
        id,
        "sources",
        `must retain ${MIN_SOURCES_PER_QUESTION}-${MAX_SOURCES_PER_QUESTION} sources`,
      ),
    );
  }
  const primaryCount = question.sources.filter((source) => source.primary).length;
  if (primaryCount !== 1) {
    issues.push(issue(id, "sources", "must flag exactly one primary source"));
  }
  for (const [index, source] of question.sources.entries()) {
    checkBoundedText(issues, id, `sources[${index}].url`, source.url, MAX_SOURCE_URL_LENGTH);
    if (!isPublicHttpUrl(source.url)) {
      issues.push(issue(id, `sources[${index}].url`, "must be a public HTTP(S) URL"));
    }
    checkBoundedText(issues, id, `sources[${index}].title`, source.title, MAX_SOURCE_TITLE_LENGTH);
    checkBoundedText(
      issues,
      id,
      `sources[${index}].locator`,
      source.locator,
      MAX_SOURCE_LOCATOR_LENGTH,
    );
    const retrievedAt = Date.parse(source.retrievedAt);
    if (
      !Number.isFinite(retrievedAt) ||
      new Date(retrievedAt).toISOString() !== source.retrievedAt
    ) {
      issues.push(issue(id, `sources[${index}].retrievedAt`, "must be a canonical ISO timestamp"));
    }
    if (
      source.contentHash.length !== SHA256_HEX_LENGTH ||
      !/^[0-9a-f]+$/u.test(source.contentHash)
    ) {
      issues.push(
        issue(
          id,
          `sources[${index}].contentHash`,
          `must be ${SHA256_HEX_LENGTH} lowercase hexadecimal characters`,
        ),
      );
    }
    checkBoundedText(
      issues,
      id,
      `sources[${index}].supportExcerpt`,
      source.supportExcerpt,
      MAX_SOURCE_EXCERPT_LENGTH,
    );
  }

  return issues;
}

export interface PackValidationIssue {
  field: string;
  message: string;
}

/**
 * Structural checks across one four-question pack: exactly one question per
 * internal tier, no exact duplicate facts/prompts/choice sets, and at least
 * three distinct primary comedy devices without repeating a device pairing.
 */
export function validatePackStructure(
  questions: readonly QuizslopQuestionContent[],
): readonly PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];
  if (questions.length !== QUESTIONS_PER_PACK) {
    issues.push({
      field: "questions",
      message: `pack must contain exactly ${QUESTIONS_PER_PACK} questions`,
    });
  }

  const tiersSeen = new Map<QuizslopTier, number>();
  for (const question of questions) {
    tiersSeen.set(question.tier, (tiersSeen.get(question.tier) ?? 0) + 1);
  }
  for (const tier of QUIZSLOP_TIERS) {
    if ((tiersSeen.get(tier) ?? 0) !== 1) {
      issues.push({ field: "questions", message: `pack must have exactly one ${tier} question` });
    }
  }

  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) {
    issues.push({ field: "questions", message: "question IDs must be unique" });
  }

  const facts = questions.map((question) => normalizeForDuplicateCheck(question.canonicalFact));
  if (new Set(facts).size !== questions.length) {
    issues.push({ field: "questions", message: "canonical facts must not repeat" });
  }
  const prompts = questions.map((question) => normalizeForDuplicateCheck(question.neutralQuestion));
  if (new Set(prompts).size !== questions.length) {
    issues.push({ field: "questions", message: "neutral questions must not repeat" });
  }
  const choiceSets = questions.map((question) =>
    question.choices.map(normalizeForDuplicateCheck).toSorted().join("|"),
  );
  if (new Set(choiceSets).size !== questions.length) {
    issues.push({ field: "questions", message: "normalized choice sets must not repeat" });
  }

  const primaryDevices = new Set(questions.map((question) => question.comedyDevices[0]));
  if (primaryDevices.size < MIN_PRIMARY_COMEDY_DEVICES_PER_PACK) {
    issues.push({
      field: "comedyDevices",
      message: `pack must use at least ${MIN_PRIMARY_COMEDY_DEVICES_PER_PACK} distinct primary comedy devices`,
    });
  }
  const devicePairs = questions.map((question) => question.comedyDevices.join(">"));
  if (new Set(devicePairs).size !== questions.length) {
    issues.push({ field: "comedyDevices", message: "device pairings must not repeat exactly" });
  }

  return issues;
}
