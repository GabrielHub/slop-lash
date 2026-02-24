export type GameStatus =
  | "LOBBY"
  | "WRITING"
  | "VOTING"
  | "ROUND_RESULTS"
  | "FINAL_RESULTS";

export type PlayerType = "HUMAN" | "AI";

export interface GamePlayer {
  id: string;
  name: string;
  type: PlayerType;
  modelId: string | null;
  score: number;
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

export interface GamePrompt {
  id: string;
  roundId: string;
  text: string;
  responses: GameResponse[];
  votes: GameVote[];
}

export interface GameRound {
  id: string;
  gameId: string;
  roundNumber: number;
  prompts: GamePrompt[];
}

export interface GameState {
  id: string;
  roomCode: string;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  hostPlayerId: string | null;
  players: GamePlayer[];
  rounds: GameRound[];
}
