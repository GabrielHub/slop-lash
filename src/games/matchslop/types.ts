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
  generationId: string | null;
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
  mood?: number | null;
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

export type MatchSlopPersonaReplyStatus =
  | "NOT_REQUESTED"
  | "GENERATING"
  | "READY"
  | "FAILED";

export interface MatchSlopPendingPersonaReply {
  status: MatchSlopPersonaReplyStatus;
  reply: string | null;
  outcome: MatchSlopDecision | null;
  moodDelta: number | null;
  generationId: string | null;
  signalCategory: string | null;
  sideComment: string | null;
  nextSignal: string | null;
}

export type MatchSlopPostMortemStatus =
  | "NOT_REQUESTED"
  | "STREAMING"
  | "READY"
  | "FAILED";

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

export interface MatchSlopPostMortemCalloutDraft {
  playerName?: string;
  verdict?: string;
  favoriteLine?: string | null;
}

export interface MatchSlopPostMortemDraft {
  opening?: string;
  playerCallouts?: MatchSlopPostMortemCalloutDraft[];
  favoriteMoment?: string;
  finalThought?: string;
}

export interface MatchSlopPostMortemGenerationState {
  status: MatchSlopPostMortemStatus;
  updatedAt: string;
  generationId: string | null;
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
  mood: number;
  pendingPersonaReply: MatchSlopPendingPersonaReply;
  latestSignalCategory: string | null;
  latestSideComment: string | null;
  latestNextSignal: string | null;
  latestMoodDelta: number | null;
  postMortemGeneration: MatchSlopPostMortemGenerationState;
  postMortemDraft: MatchSlopPostMortemDraft | null;
  postMortem: MatchSlopPostMortem | null;
}
