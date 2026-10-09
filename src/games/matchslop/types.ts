export type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";
export type MatchSlopOutcome =
  | "IN_PROGRESS"
  | "DATE_SEALED"
  | "UNMATCHED"
  | "TURN_LIMIT"
  | "COMEBACK";
export type MatchSlopDecision = "CONTINUE" | "DATE_SEALED" | "UNMATCHED";

export type MatchSlopMoodLabel = "done" | "skeptical" | "amused" | "intrigued" | "obsessed";

export const MATCHSLOP_MOOD_THRESHOLD_UNMATCH = 20;
export const MATCHSLOP_INITIAL_MOOD = 50;

export function clampMatchSlopMood(mood: number): number {
  return Math.max(0, Math.min(100, Math.round(mood)));
}

export function getMoodLabel(mood: number): MatchSlopMoodLabel {
  const normalizedMood = clampMatchSlopMood(mood);
  if (normalizedMood <= 20) return "done";
  if (normalizedMood <= 40) return "skeptical";
  if (normalizedMood <= 60) return "amused";
  if (normalizedMood <= 80) return "intrigued";
  return "obsessed";
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

export interface MatchSlopPostMortemCallout {
  playerName: string;
  verdict: string;
  favoriteLine: string | null;
}

export interface MatchSlopPostMortem {
  opening: string;
  playerCallouts: MatchSlopPostMortemCallout[];
  favoriteMoment: string;
  finalThought: string;
}
