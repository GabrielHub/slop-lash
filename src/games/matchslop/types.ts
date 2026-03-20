export type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";
export type MatchSlopOutcome =
  | "IN_PROGRESS"
  | "DATE_SEALED"
  | "UNMATCHED"
  | "TURN_LIMIT"
  | "COMEBACK";
export type MatchSlopDecision = "CONTINUE" | "DATE_SEALED" | "UNMATCHED";
export type MatchSlopTranscriptOutcome = MatchSlopDecision | "TURN_LIMIT" | "COMEBACK";

export type MatchSlopPersonaImageStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export type MatchSlopProfileGenerationStatus =
  | "NOT_REQUESTED"
  | "STREAMING"
  | "READY"
  | "FAILED";

export interface MatchSlopPersonaImageState {
  status: MatchSlopPersonaImageStatus;
  imageUrl: string | null;
  updatedAt: string;
}

export interface MatchSlopProfilePrompt {
  id: string;
  prompt: string;
  answer: string;
}

export interface MatchSlopProfilePromptDraft {
  id?: string;
  prompt?: string;
  answer?: string;
}

export interface MatchSlopPersonaDetails {
  job: string | null;
  school: string | null;
  height: string | null;
  languages: string[];
}

export interface MatchSlopPersonaDetailsDraft {
  job?: string | null;
  school?: string | null;
  height?: string | null;
  languages?: string[];
}

export interface MatchSlopProfile {
  displayName: string;
  backstory: string | null;
  age: number | null;
  location: string | null;
  bio: string;
  tagline: string | null;
  prompts: MatchSlopProfilePrompt[];
  details: MatchSlopPersonaDetails | null;
}

export interface MatchSlopProfileDraft {
  displayName?: string;
  backstory?: string | null;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  tagline?: string | null;
  prompts?: MatchSlopProfilePromptDraft[];
  details?: MatchSlopPersonaDetailsDraft | null;
}

export interface MatchSlopProfileGenerationState {
  status: MatchSlopProfileGenerationStatus;
  updatedAt: string;
}

export interface MatchSlopTranscriptEntry {
  id: string;
  speaker: "PLAYERS" | "PERSONA";
  text: string;
  turn: number;
  outcome: MatchSlopTranscriptOutcome | null;
  authorName: string | null;
  selectedPromptText?: string | null;
  selectedPromptId?: string | null;
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
  selectedPlayerExamples: string[];
  comebackRound: number | null;
  transcript: MatchSlopTranscriptEntry[];
  profileDraft: MatchSlopProfileDraft | null;
  profileGeneration: MatchSlopProfileGenerationState;
  profile: MatchSlopProfile | null;
  personaImage: MatchSlopPersonaImageState;
  lastRoundResult: MatchSlopRoundResult | null;
}
