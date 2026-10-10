export const MATCHSLOP_POINTS_PER_WEIGHTED_VOTE = 25;
export const MATCHSLOP_WINNER_BONUS = 50;

/** Round 1: players read the profile and write an opener. */
export const MATCHSLOP_OPENER_SECONDS = 75;
/** Round 2 on: players answer the persona's latest text. */
export const MATCHSLOP_REPLY_WRITING_SECONDS = 60;
export const MATCHSLOP_VOTING_SECONDS = 30;
/** How long the persona's reply stays on screen. */
export const MATCHSLOP_REPLY_SECONDS = 12;
/** SENT holds at least this long so the send animation can land. */
export const MATCHSLOP_SENT_MIN_MS = 5_000;

/** Player and bot lines, decoupled from the shared answer cap. */
export const MATCHSLOP_MAX_LINE_LENGTH = 80;
export const MATCHSLOP_MAX_REPLY_LENGTH = 160;
export const MATCHSLOP_MAX_THOUGHT_LENGTH = 80;
export const MATCHSLOP_MAX_PROMPT_ANSWER_LENGTH = 100;
export const MATCHSLOP_MAX_VERDICT_LENGTH = 70;
export const MATCHSLOP_MAX_PARTING_LENGTH = 120;

/** Profile prompts a persona keeps, and so the openers a player can pick from. */
export const MATCHSLOP_PROFILE_PROMPTS = 3;

export const MATCHSLOP_PHOTO_PROMPT_ID = "__photo__";
export const MATCHSLOP_PHOTO_PROMPT_TEXT = "Photo";
