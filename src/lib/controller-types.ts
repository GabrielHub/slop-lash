import type { GameStatus, GameType, ParticipationStatus, PlayerType } from "./types";

export interface ControllerPlayerSummary {
  id: string;
  name: string;
  type: PlayerType;
  participationStatus: ParticipationStatus;
}

export interface ControllerWritingPrompt {
  id: string;
  text: string;
  submitted: boolean;
}

export interface MatchSlopProfilePromptOption {
  id: string;
  prompt: string;
  answer: string;
}

export interface MatchSlopPersonaImageState {
  status: "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED";
  imageUrl: string | null;
}

export interface MatchSlopPersonaDetailsState {
  job: string | null;
  school: string | null;
  height: string | null;
  languages: string[];
}

export interface MatchSlopProfileState {
  displayName: string;
  age: number | null;
  location: string | null;
  bio: string | null;
  tagline: string | null;
  prompts: MatchSlopProfilePromptOption[];
  details: MatchSlopPersonaDetailsState | null;
  image: MatchSlopPersonaImageState;
}

export interface MatchSlopTranscriptEntry {
  id: string;
  speaker: "PLAYERS" | "PERSONA";
  text: string;
  turn: number;
  outcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | null;
  authorName: string | null;
}

export interface MatchSlopWritingState {
  promptId: string;
  text: string;
  submitted: boolean;
  openerOptions: MatchSlopProfilePromptOption[];
}

export interface ControllerVoteOption {
  id: string;
  text: string;
  openerPromptId?: string | null;
}

export interface ControllerVotingPrompt {
  id: string;
  text: string;
  responses: ControllerVoteOption[];
  isRespondent: boolean;
  hasVoted: boolean;
  hasAbstained: boolean;
}

export interface ControllerVotingState {
  totalPrompts: number;
  currentPrompt: ControllerVotingPrompt | null;
}

export interface ControllerWritingState {
  prompts: ControllerWritingPrompt[];
}

export interface ControllerGameState {
  id: string;
  roomCode: string;
  gameType: GameType;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  hostPlayerId: string | null;
  phaseDeadline: string | null;
  timersDisabled: boolean;
  votingPromptIndex: number;
  votingRevealing: boolean;
  nextGameCode: string | null;
  version: number;
  players: ControllerPlayerSummary[];
  me: ControllerPlayerSummary | null;
  writing: ControllerWritingState | null;
  voting: ControllerVotingState | null;
  matchslop: {
    seekerIdentity: string | null;
    personaIdentity: string | null;
    outcome: "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT";
    humanVoteWeight: number;
    aiVoteWeight: number;
    profile: MatchSlopProfileState | null;
    transcript: MatchSlopTranscriptEntry[];
    writing: MatchSlopWritingState | null;
  } | null;
}
