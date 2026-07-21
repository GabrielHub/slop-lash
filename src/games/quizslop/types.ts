/**
 * QuizSlop mode-local domain types. This file is the closed-world contract for
 * the mode: the Convex validators, catalog content, fixtures, and UI shells
 * must all derive from these unions rather than re-declaring literals.
 */

/** Internal difficulty tiers. Server-only; never sent to a player-facing view. */
export type QuizslopTier = "EASY" | "MEDIUM" | "HARD" | "INSANE";
export const QUIZSLOP_TIERS: readonly QuizslopTier[] = ["EASY", "MEDIUM", "HARD", "INSANE"];

/** Bounded parent categories for topic normalization and the reviewed catalog. */
export type QuizslopCategory =
  | "SPORTS"
  | "MUSIC"
  | "FILM_TV"
  | "GAMES"
  | "SCIENCE_NATURE"
  | "HISTORY"
  | "GEOGRAPHY"
  | "FOOD_DRINK"
  | "BOOKS_LANGUAGE"
  | "INTERNET_TECH"
  | "ARTS_CULTURE"
  | "OTHER";
export const QUIZSLOP_CATEGORIES: readonly QuizslopCategory[] = [
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
];

/** Bounded, ordered comedy device tags; the primary device is listed first. */
export type QuizslopComedyDevice =
  | "UNEXPECTED_SPECIFICITY"
  | "DRY_ASIDE"
  | "INCONGRUITY"
  | "ANTHROPOMORPHISM"
  | "AFFECTIONATE_ROAST"
  | "UNDERSTATEMENT"
  | "WORDPLAY";
export const QUIZSLOP_COMEDY_DEVICES: readonly QuizslopComedyDevice[] = [
  "UNEXPECTED_SPECIFICITY",
  "DRY_ASIDE",
  "INCONGRUITY",
  "ANTHROPOMORPHISM",
  "AFFECTIONATE_ROAST",
  "UNDERSTATEMENT",
  "WORDPLAY",
];

/** Bounded comedy ratings. Only WITTY and BIG_LAUGH can ship. */
export type QuizslopComedyRating =
  | "BIG_LAUGH"
  | "WITTY"
  | "FLAT"
  | "TRY_HARD"
  | "MEAN"
  | "ANSWER_LEAK";
export const SHIPPABLE_COMEDY_RATINGS: readonly QuizslopComedyRating[] = ["BIG_LAUGH", "WITTY"];

/** Exact mode-local phase. The shells render from this, never the coarse shared status. */
export type QuizslopPhase =
  | "LOBBY_SETUP"
  | "HOUSE_VOTE"
  | "HOUSE_VOTE_REVEAL"
  | "TOPIC_REVEAL"
  | "SLOP_CALL"
  | "SLOP_CALL_REVEAL"
  | "ANSWER"
  | "QUESTION_REVEAL"
  | "DISPUTE_VOTE"
  | "ROUND_RESULTS"
  | "CONTINUITY_GRACE"
  | "FINAL_RESULTS"
  | "ABANDONED";
export const QUIZSLOP_PHASES: readonly QuizslopPhase[] = [
  "LOBBY_SETUP",
  "HOUSE_VOTE",
  "HOUSE_VOTE_REVEAL",
  "TOPIC_REVEAL",
  "SLOP_CALL",
  "SLOP_CALL_REVEAL",
  "ANSWER",
  "QUESTION_REVEAL",
  "DISPUTE_VOTE",
  "ROUND_RESULTS",
  "CONTINUITY_GRACE",
  "FINAL_RESULTS",
  "ABANDONED",
];

/** Coarse shared `games.status` mirrored at phase boundaries. */
export type QuizslopSharedStatus =
  | "LOBBY"
  | "WRITING"
  | "VOTING"
  | "ROUND_RESULTS"
  | "FINAL_RESULTS";

export const SHARED_STATUS_BY_PHASE: Record<QuizslopPhase, QuizslopSharedStatus> = {
  LOBBY_SETUP: "LOBBY",
  HOUSE_VOTE: "VOTING",
  HOUSE_VOTE_REVEAL: "VOTING",
  TOPIC_REVEAL: "WRITING",
  SLOP_CALL: "WRITING",
  SLOP_CALL_REVEAL: "WRITING",
  ANSWER: "WRITING",
  QUESTION_REVEAL: "ROUND_RESULTS",
  DISPUTE_VOTE: "ROUND_RESULTS",
  ROUND_RESULTS: "ROUND_RESULTS",
  CONTINUITY_GRACE: "ROUND_RESULTS",
  FINAL_RESULTS: "FINAL_RESULTS",
  ABANDONED: "FINAL_RESULTS",
};

/** Deck slot kinds in play order. */
export type QuizslopRoundKind = "WARM_UP" | "HOME_TURF" | "HOUSE_CHOICE";

/** Per-player topic setup states shown (redacted) in the shared lobby. */
export type QuizslopTopicSetupState =
  | "NEEDS_TOPIC"
  | "NORMALIZING"
  | "AWAITING_CONFIRMATION"
  | "BUILDING"
  | "READY"
  | "NEEDS_REVISION"
  | "NEEDS_FALLBACK";

export type QuizslopTopicSourceType = "CUSTOM" | "CATALOG";

/** Content lifecycle for questions and packs. */
export type QuizslopContentLifecycle =
  | "DRAFT"
  | "CANDIDATE"
  | "ACCEPTED"
  | "REJECTED"
  | "FROZEN"
  | "RETIRED";

/** Round ruling persisted per revealed question after disputes close. */
export type QuizslopQuestionRuling =
  | "UNCHALLENGED_VALID"
  | "UPHELD"
  | "PLAYER_VOIDED"
  | "SYSTEM_VOID";

export type QuizslopDisputeReason =
  | "WRONG_ANSWER_KEY"
  | "MULTIPLE_DEFENSIBLE_ANSWERS"
  | "SOURCE_DOES_NOT_SUPPORT";
export const QUIZSLOP_DISPUTE_REASONS: readonly QuizslopDisputeReason[] = [
  "WRONG_ANSWER_KEY",
  "MULTIPLE_DEFENSIBLE_ANSWERS",
  "SOURCE_DOES_NOT_SUPPORT",
];

export type QuizslopDisputeVoteChoice = "UPHOLD" | "VOID";

/** Non-scoring deterministic final awards based only on visible facts. */
export type QuizslopAwardKind = "CALLED_IT" | "FALSE_ALARM_DEPARTMENT" | "SUSPICIOUSLY_WELL_READ";

/** Terminal outcome for the mode-state record. */
export type QuizslopOutcome = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

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
export interface QuizslopHumanReview {
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

/** Deterministic stage/controller microcopy with review metadata. */
export interface QuizslopVoiceLine {
  /** Stable ID persisted with the phase that selected it. */
  id: string;
  /** Phase or event this line may decorate. */
  tag: QuizslopVoiceEventTag;
  text: string;
  /** Unembellished label for screen readers. */
  accessibleLabel: string;
  review: { approved: boolean; reviewer: string | null; reviewedAt: string | null };
}

export type QuizslopVoiceEventTag =
  | "LOBBY_SETUP"
  | "HOUSE_VOTE"
  | "HOUSE_VOTE_REVEAL"
  | "TOPIC_REVEAL_WARM_UP"
  | "TOPIC_REVEAL_HOME_TURF"
  | "TOPIC_REVEAL_HOUSE_CHOICE"
  | "SLOP_CALL"
  | "SLOP_CALL_REVEAL"
  | "ANSWER"
  | "QUESTION_REVEAL"
  | "DISPUTE_VOTE"
  | "ROUND_RESULTS"
  | "CONTINUITY_GRACE"
  | "FINAL_RESULTS";
