/**
 * QuizSlop mode constants. Every value below is a locked default from
 * docs/quizslop-game-mode.md; timers and point values are tuning hypotheses
 * that stay authoritative until playtest evidence replaces them.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** Section counts keep every exam between 18 and 24 official answers. */
const SECTIONS_BY_PLAYER_COUNT: Readonly<Record<number, number>> = {
  3: 6,
  4: 5,
  5: 4,
  6: 4,
  7: 3,
  8: 3,
};

export const PASS_PERCENT = 70;
export const SABOTAGE_WRONG_ANSWER_POINTS = 1;
export const SABOTAGE_OVERRIDE_BONUS = 1;

export function sectionsForPlayerCount(playerCount: number): number {
  const sections = SECTIONS_BY_PLAYER_COUNT[playerCount];
  if (sections === undefined) {
    throw new Error(`QuizSlop needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  return sections;
}

/** The review follows the last section in the first half of the exam. */
export function proctorReviewAfterSection(sectionCount: number): number {
  return Math.ceil(sectionCount / 2);
}

/** Cooperative exam phase timers. Passive phases remain host-skippable. */
export const SECTION_INTRO_SECONDS = 6;
export const SCRATCH_SECONDS = 30;
export const PROXY_ANSWER_SECONDS = 35;
export const ORAL_DEFENSE_SECONDS = 30;
export const SECTION_RESULTS_SECONDS = 10;
export const PROCTOR_REVIEW_VOTE_SECONDS = 20;
export const PROCTOR_REVIEW_RESULT_SECONDS = 8;
export const FINAL_ACCUSATION_SECONDS = 25;

/** Largest full exam: eight candidates times three sections. */
export const MAX_TOTAL_EXAM_QUESTIONS = 24;
export const MIN_SOURCES_PER_QUESTION = 1;
export const MAX_SOURCES_PER_QUESTION = 3;
export const QUESTIONS_PER_PACK = 4;

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
