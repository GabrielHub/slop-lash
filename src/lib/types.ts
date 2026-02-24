export type GameStatus =
  | "LOBBY"
  | "WRITING"
  | "VOTING"
  | "ROUND_RESULTS"
  | "FINAL_RESULTS";

export type PlayerType = "HUMAN" | "AI";

export type TtsMode = "OFF" | "AI_VOICE" | "BROWSER_VOICE";

export type TtsVoice = "MALE" | "FEMALE";

export interface GamePlayer {
  id: string;
  name: string;
  type: PlayerType;
  modelId: string | null;
  score: number;
  lastSeen: string;
}

export interface GameResponse {
  id: string;
  promptId: string;
  playerId: string;
  text: string;
  player: Omit<GamePlayer, "score">;
}

export interface GameVote {
  id: string;
  promptId: string;
  voterId: string;
  responseId: string;
}

export interface PromptAssignmentInfo {
  promptId: string;
  playerId: string;
}

export interface GamePrompt {
  id: string;
  roundId: string;
  text: string;
  responses: GameResponse[];
  votes: GameVote[];
  assignments: PromptAssignmentInfo[];
}

export interface GameRound {
  id: string;
  gameId: string;
  roundNumber: number;
  prompts: GamePrompt[];
}

export interface GameModelUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface GameState {
  id: string;
  roomCode: string;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  hostPlayerId: string | null;
  phaseDeadline: string | null;
  timersDisabled: boolean;
  ttsMode: TtsMode;
  ttsVoice: TtsVoice;
  votingPromptIndex: number;
  votingRevealing: boolean;
  nextGameCode: string | null;
  version: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiCostUsd: number;
  modelUsages: GameModelUsage[];
  players: GamePlayer[];
  rounds: GameRound[];
}
