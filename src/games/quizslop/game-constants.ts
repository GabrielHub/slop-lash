/**
 * QuizSlop mode constants. Every value below is a locked default from
 * docs/quizslop-game-mode.md; timers and point values are tuning hypotheses
 * that stay authoritative until playtest evidence replaces them.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_SPECTATORS = 0;

/** Standard length: one warm-up + one Home Turf per frozen player + one finale. */
export const EXTRA_ROUNDS_BEYOND_HOME_TURF = 2;
export const MIN_TOTAL_ROUNDS = MIN_PLAYERS + EXTRA_ROUNDS_BEYOND_HOME_TURF;
export const MAX_TOTAL_ROUNDS = MAX_PLAYERS + EXTRA_ROUNDS_BEYOND_HOME_TURF;

/** `games.totalRounds` sentinel while a QuizSlop game is still in the lobby. */
export const TOTAL_ROUNDS_UNSET = 0;

export const QUIZ_CORRECT_POINTS = 100;
export const FINAL_QUIZ_CORRECT_POINTS = 200;
export const CALL_SLOP_POINTS = 150;
export const CALL_SLOP_TOKENS_PER_GAME = 2;
export const DISPUTES_PER_PLAYER_PER_GAME = 1;

/** Phase timer defaults, in seconds. */
export const HOUSE_VOTE_SECONDS = 12;
export const HOUSE_VOTE_REVEAL_SECONDS = 3;
export const TOPIC_REVEAL_SECONDS = 8;
export const SLOP_CALL_SECONDS = 10;
export const SLOP_CALL_REVEAL_SECONDS = 3;
export const ANSWER_SECONDS = 25;
export const QUESTION_REVEAL_SECONDS_PER_GROUP = 6;
export const DISPUTE_WINDOW_SECONDS = 8;
export const DISPUTE_VOTE_SECONDS = 12;
export const ROUND_RESULTS_SECONDS = 8;
/** Continuity grace applies even when gameplay timers are disabled. */
export const CONTINUITY_GRACE_SECONDS = 15;

/** Custom-topic setup bounds (Milestone 3; enforced from the first schema). */
export const MAX_CUSTOM_REVISIONS_PER_PLAYER = 3;
export const MAX_CUSTOM_REVISIONS_PER_ROOM = 24;
export const NORMALIZATION_DEADLINE_SECONDS = 15;
export const PACK_BUILD_DEADLINE_SECONDS = 60;

/** Structural query caps for an eight-player game. Read cap + 1 and fail closed. */
export const MAX_FROZEN_PLAYERS = MAX_PLAYERS;
export const MAX_ROUNDS_CAP = MAX_TOTAL_ROUNDS;
/** 8 Home Topics + 1 warm-up + 3 finalists. */
export const MAX_FROZEN_TOPICS = 12;
export const MAX_QUESTION_GROUPS_PER_ROUND = 4;
export const MAX_ASSIGNMENTS_PER_ROUND = MAX_PLAYERS;
export const MAX_CALLS_PER_ROUND = MAX_PLAYERS;
export const MAX_BALLOTS_PER_ROUND = 4;
export const MAX_DISPUTE_VOTES_PER_ROUND = 32;
export const MIN_SOURCES_PER_QUESTION = 1;
export const MAX_SOURCES_PER_QUESTION = 3;
export const QUESTIONS_PER_PACK = 4;
export const FINAL_SLATE_SIZE = 3;
export const CATALOG_FALLBACK_OFFER_SIZE = 3;

/** Reviewed catalog launch minimums. */
export const MIN_CATALOG_TOPICS = 12;
export const MIN_CATALOG_CATEGORIES = 6;

/** Unicode-character text bounds shared by Zod and Convex validators. */
export const MAX_RAW_TOPIC_LENGTH = 120;
export const MAX_TOPIC_LABEL_LENGTH = 56;
export const MAX_TOPIC_SCOPE_LENGTH = 180;
export const MAX_TOPIC_EXCLUSIONS = 3;
export const MAX_TOPIC_EXCLUSION_LENGTH = 80;
export const MAX_TOPIC_ALTERNATIVES = 3;
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
