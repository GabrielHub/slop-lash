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

export interface ControllerVoteOption {
  id: string;
  text: string;
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
}
