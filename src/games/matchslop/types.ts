export type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";

/** The game's ending; IN_PROGRESS until the code decides one. */
export type MatchSlopOutcome = "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED";

/**
 * What one persona message did. A last shot is a persona message with
 * UNMATCHED while the game stays IN_PROGRESS for one comeback round.
 */
export type MatchSlopDecision = "CONTINUE" | "DATE_SEALED" | "UNMATCHED";

export const MATCHSLOP_MOOD_THRESHOLD_UNMATCH = 20;
export const MATCHSLOP_INITIAL_MOOD = 50;
/** Reaching this mood after a reply seals the date at once. */
export const MATCHSLOP_DATE_LINE = 80;

/** The persona's judgement of the sent line, worst first. */
export const MATCHSLOP_LEVELS = ["dealbreaker", "cringe", "meh", "cute", "good", "great"] as const;
export type MatchSlopLevel = (typeof MATCHSLOP_LEVELS)[number];

/** Mood change per level; see docs/matchslop-persona-guide.md for the calibration. */
export const MATCHSLOP_LEVEL_DELTA: Readonly<Record<MatchSlopLevel, number>> = {
  dealbreaker: -20,
  cringe: -10,
  meh: 0,
  cute: 5,
  good: 10,
  great: 15,
};

/** Where the persona's reply came from. Only "model" replies move mood or points. */
export type MatchSlopReplySource = "model" | "fallback" | "declined";

/** How a finished date is described: a date, an unmatch, or a kind goodbye. */
export type MatchSlopVerdict = "DATE" | "UNMATCHED" | "NO_SECOND_DATE";

export function clampMatchSlopMood(mood: number): number {
  return Math.max(0, Math.min(100, Math.round(mood)));
}

export interface MatchSlopProfilePrompt {
  id: string;
  prompt: string;
  answer: string;
}

export interface MatchSlopPersonaDetails {
  job: string | null;
  school: string | null;
  height: string | null;
  languages: string[];
}

export interface MatchSlopProfile {
  displayName: string;
  backstory: string | null;
  appearance?: string | null;
  age: number | null;
  location: string | null;
  bio: string;
  tagline: string | null;
  prompts: MatchSlopProfilePrompt[];
  details: MatchSlopPersonaDetails | null;
}

/** The persona's parting words at FINAL: one verdict per player, then a goodbye text. */
export interface MatchSlopPostMortem {
  verdicts: { playerName: string; verdict: string }[];
  parting: string;
}
