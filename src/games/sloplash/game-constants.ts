import type { ReactionEmoji } from "@/lib/reactions";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 3;
export const WRITING_DURATION_SECONDS = 90;
export const VOTE_PER_PROMPT_SECONDS = 30;
export const REVEAL_SECONDS = 8;
/** A one-sided matchup is shown briefly: there is nothing to vote on. */
export const WALKOVER_REVEAL_SECONDS = 5;
export const ROUND_RESULTS_SECONDS = 12;

/** The longest SlopLash answer, for humans and AI alike (enforced on the server). */
export const SLOPLASH_MAX_ANSWER = 80;
/** The longest AI victory tagline. */
export const TAGLINE_MAX = 100;
/** A failed AI joke call is retried only when more than this much WRITING is left. */
export const AI_RETRY_MIN_REMAINING_MS = 30_000;

/** The reactions a voter can send during VOTING (and the AI ballot may attach). */
export const REACTION_STRIP = [
  "laugh",
  "skull",
  "fire",
  "hundred",
  "clap",
] as const satisfies readonly ReactionEmoji[];
