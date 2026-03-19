import type { MatchSlopPersonaImageState } from "./config/persona-image";

export type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";
export type MatchSlopOutcome =
  | "IN_PROGRESS"
  | "DATE_SEALED"
  | "UNMATCHED"
  | "TURN_LIMIT";
export type MatchSlopDecision = "CONTINUE" | "DATE_SEALED" | "UNMATCHED";

export interface MatchSlopProfilePrompt {
  id: string;
  prompt: string;
  answer: string;
}

export interface MatchSlopProfile {
  displayName: string;
  age: number | null;
  location: string | null;
  bio: string;
  tagline: string | null;
  prompts: MatchSlopProfilePrompt[];
}

export interface MatchSlopTranscriptEntry {
  id: string;
  speaker: "PLAYERS" | "PERSONA";
  text: string;
  turn: number;
  outcome: MatchSlopDecision | "TURN_LIMIT" | null;
  authorName: string | null;
}

export interface MatchSlopRoundResult {
  promptId: string;
  winnerResponseId: string;
  winnerPlayerId: string;
  winnerText: string;
  authorName: string | null;
  weightedVotes: number;
  rawVotes: number;
  selectedPromptId: string | null;
  selectedPromptText: string | null;
}

export interface MatchSlopModeState {
  seekerIdentity: MatchSlopIdentity;
  personaIdentity: MatchSlopIdentity;
  outcome: MatchSlopOutcome;
  humanVoteWeight: number;
  aiVoteWeight: number;
  selectedPersonaExampleIds: string[];
  selectedPlayerExampleIds: string[];
  transcript: MatchSlopTranscriptEntry[];
  profile: MatchSlopProfile | null;
  personaImage: MatchSlopPersonaImageState;
  lastRoundResult: MatchSlopRoundResult | null;
}
