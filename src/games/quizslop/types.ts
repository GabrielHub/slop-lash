/**
 * QuizSlop mode-local domain types. This file is the closed-world contract for
 * the mode: the Convex validators, catalog content, fixtures, and UI shells
 * must all derive from these unions rather than re-declaring literals.
 */

/** Internal difficulty tiers. Server-only; never sent to a player-facing view. */
export const QUIZSLOP_TIERS = ["EASY", "MEDIUM", "HARD", "INSANE"] as const;
export type QuizslopTier = (typeof QUIZSLOP_TIERS)[number];

/** Bounded parent categories for topic normalization and the reviewed catalog. */
export const QUIZSLOP_CATEGORIES = [
  "SPORTS",
  "MUSIC",
  "FILM_TV",
  "GAMES",
  "SCIENCE_NATURE",
  "HISTORY",
  "GEOGRAPHY",
  "FOOD_DRINK",
  "BOOKS_LANGUAGE",
  "INTERNET_TECH",
  "ARTS_CULTURE",
  "OTHER",
] as const;
export type QuizslopCategory = (typeof QUIZSLOP_CATEGORIES)[number];

/** Bounded, ordered comedy device tags; the primary device is listed first. */
export const QUIZSLOP_COMEDY_DEVICES = [
  "UNEXPECTED_SPECIFICITY",
  "DRY_ASIDE",
  "INCONGRUITY",
  "ANTHROPOMORPHISM",
  "AFFECTIONATE_ROAST",
  "UNDERSTATEMENT",
  "WORDPLAY",
] as const;
export type QuizslopComedyDevice = (typeof QUIZSLOP_COMEDY_DEVICES)[number];

/** Bounded comedy ratings. Only WITTY and BIG_LAUGH can ship. */
type QuizslopComedyRating = "BIG_LAUGH" | "WITTY" | "FLAT" | "TRY_HARD" | "MEAN" | "ANSWER_LEAK";
export const SHIPPABLE_COMEDY_RATINGS: readonly QuizslopComedyRating[] = ["BIG_LAUGH", "WITTY"];

/** Exact mode-local phase. The shells render from this, never the coarse shared status. */
export const QUIZSLOP_PHASES = [
  "LOBBY_SETUP",
  "SECTION_INTRO",
  "SCRATCH",
  "PROXY_ANSWER",
  "ORAL_DEFENSE",
  "SECTION_RESULTS",
  "PROCTOR_REVIEW_VOTE",
  "PROCTOR_REVIEW_RESULT",
  "FINAL_ACCUSATION",
  "FINAL_RESULTS",
] as const;
export type QuizslopPhase = (typeof QUIZSLOP_PHASES)[number];

/** Coarse shared `games.status` mirrored at phase boundaries. */
type QuizslopSharedStatus = "LOBBY" | "WRITING" | "VOTING" | "ROUND_RESULTS" | "FINAL_RESULTS";

export const SHARED_STATUS_BY_PHASE: Record<QuizslopPhase, QuizslopSharedStatus> = {
  LOBBY_SETUP: "LOBBY",
  SECTION_INTRO: "WRITING",
  SCRATCH: "WRITING",
  PROXY_ANSWER: "VOTING",
  ORAL_DEFENSE: "ROUND_RESULTS",
  SECTION_RESULTS: "ROUND_RESULTS",
  PROCTOR_REVIEW_VOTE: "VOTING",
  PROCTOR_REVIEW_RESULT: "ROUND_RESULTS",
  FINAL_ACCUSATION: "VOTING",
  FINAL_RESULTS: "FINAL_RESULTS",
};

/** Result of one settled question for the hidden difficulty ladder. */
export type QuizslopLadderResult = "CORRECT" | "INCORRECT" | "NEUTRAL";

/** One retained evidence record. Support excerpts never reach a player view. */
export interface QuizslopSourceRecord {
  url: string;
  title: string;
  /** Section heading, anchor, or other locator inside the source. */
  locator: string;
  /** ISO timestamp of retrieval (or editorial verification for catalog content). */
  retrievedAt: string;
  /** SHA-256 hex of the retained excerpt. */
  contentHash: string;
  /** Bounded support excerpt; server-side audit only. */
  supportExcerpt: string;
  /** Exactly one source per question directly supports the keyed fact. */
  primary: boolean;
}

/** Human review metadata for reviewed catalog content. */
interface QuizslopHumanReview {
  /** True only after a named human explicitly approves; agents must not set it. */
  approved: boolean;
  reviewer: string | null;
  reviewedAt: string | null;
  factualState: "DRAFT" | "APPROVED";
  comedyState: "DRAFT" | "APPROVED";
  comedyRating: QuizslopComedyRating | null;
}

/** A playable question: immutable factual shell plus frozen comedy copy. */
export interface QuizslopQuestionContent {
  /** Stable ID, unique across the catalog / pack. */
  id: string;
  tier: QuizslopTier;
  /** Plain factual form used for evidence and equivalence checks. */
  neutralQuestion: string;
  /** Witty player-facing form; must stay factually equivalent to the neutral form. */
  displayPrompt: string;
  /** Exactly four distinct, semantically parallel choices in frozen order. */
  choices: readonly string[];
  /** Index into `choices`; server-only until reveal. */
  correctIndex: number;
  /** Compact statement of the fact being tested. */
  canonicalFact: string;
  /** Fact-first reveal text with at most one comedic button. */
  explanation: string;
  /** Ordered bounded device tags; primary device first. */
  comedyDevices: readonly QuizslopComedyDevice[];
  sources: readonly QuizslopSourceRecord[];
}

/** One reviewed catalog topic with its versioned four-question pack. */
export interface QuizslopCatalogTopic {
  /** Stable ID; never reused after retirement. */
  id: string;
  label: string;
  category: QuizslopCategory;
  scope: string;
  exclusions: readonly string[];
  /** SHA-256 hex of the trusted canonical basis; validated by catalog tasks. */
  canonicalKey: string;
  packVersion: number;
  retired: boolean;
  questions: readonly QuizslopQuestionContent[];
  review: QuizslopHumanReview;
}

/** Rejected boundary examples kept as prompt and regression guidance. */
export interface QuizslopRejectedExample {
  id: string;
  tier: QuizslopTier | null;
  reason:
    | "TOO_EASY"
    | "TOO_HARD"
    | "AMBIGUOUS"
    | "FLAT"
    | "TRY_HARD"
    | "REPETITIVE"
    | "ANSWER_LEAK"
    | "MEAN";
  text: string;
  whyItFails: string;
}
