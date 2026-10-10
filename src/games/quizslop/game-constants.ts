import type { ReactionEmoji } from "../../lib/reactions";

/**
 * QuizSlop mode constants. Every value below is a locked default from
 * docs/quizslop-game-mode.md; timers and point values are tuning hypotheses
 * that stay authoritative until playtest evidence replaces them.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const QUIZ_CORRECT_POINTS = 100;
export const FINAL_QUIZ_CORRECT_POINTS = 200;
export const CALL_SLOP_POINTS = 150;
export const CALL_SLOP_TOKENS_PER_GAME = 2;

/** Phase timer defaults, in seconds. */
export const HOUSE_VOTE_SECONDS = 30;
/** Bets: the TV shows the round's topic while phones bet. */
export const SLOP_CALL_SECONDS = 30;
export const ANSWER_SECONDS = 30;
export const QUESTION_REVEAL_SECONDS_PER_GROUP = 15;
export const ROUND_RESULTS_SECONDS = 12;

/** The catalog checks require at least this many live topics. */
export const MAX_FROZEN_TOPICS = 25;
export const MIN_SOURCES_PER_QUESTION = 1;
export const MAX_SOURCES_PER_QUESTION = 3;
export const QUESTIONS_PER_PACK = 4;
export const FINAL_SLATE_SIZE = 3;

/** Reviewed catalog launch minimums. */
export const MIN_CATALOG_TOPICS = 12;
export const MIN_CATALOG_CATEGORIES = 6;

/** Unicode-character text bounds shared by Zod and Convex validators. */
export const MAX_TOPIC_LABEL_LENGTH = 56;
export const MAX_TOPIC_SCOPE_LENGTH = 180;
export const MAX_TOPIC_EXCLUSIONS = 3;
export const MAX_TOPIC_EXCLUSION_LENGTH = 80;
export const SHA256_HEX_LENGTH = 64;
export const CANONICAL_KEY_LENGTH = SHA256_HEX_LENGTH;
export const MAX_DISPLAY_PROMPT_LENGTH = 220;
export const MAX_CHOICE_LENGTH = 80;
export const CHOICES_PER_QUESTION = 4;
export const MAX_EXPLANATION_LENGTH = 320;
export const MAX_SOURCE_EXCERPT_LENGTH = 320;
export const MAX_SOURCE_URL_LENGTH = 2048;
export const MAX_SOURCE_TITLE_LENGTH = 200;
export const MAX_SOURCE_LOCATOR_LENGTH = 200;
export const MAX_CANONICAL_FACT_LENGTH = 240;
export const MAX_NEUTRAL_QUESTION_LENGTH = 220;

/** A valid four-question pack uses at least this many distinct primary devices. */
export const MIN_PRIMARY_COMEDY_DEVICES_PER_PACK = 3;
export const MAX_COMEDY_DEVICES_PER_QUESTION = 2;

/** The reactions anyone can send while a reveal step is on the TV. */
export const QUIZSLOP_REACTIONS = [
  "laugh",
  "skull",
  "clap",
  "target",
  "clown",
] as const satisfies readonly ReactionEmoji[];
