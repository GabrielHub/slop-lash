export const MAX_PLAYERS = 8;
export const MAX_SPECTATORS = 20;
export const MIN_PLAYERS = 3;
export const WRITING_DURATION_SECONDS = 90;
export const VOTING_DURATION_SECONDS = 45;
export const VOTE_PER_PROMPT_SECONDS = 20;
export const REVEAL_SECONDS = 10;
export const HOST_STALE_MS = 15_000;

/** Cache tag used by unstable_cache / revalidateTag for the leaderboard data. */
export const LEADERBOARD_TAG = "leaderboard";

/** Spectator vote weight multiplier. */
export const SPECTATOR_VOTE_MULT = 0.5;

/** Humor Rating badge thresholds. */
export const HR_HOT_THRESHOLD = 1.3;
export const HR_COLD_THRESHOLD = 0.7;
