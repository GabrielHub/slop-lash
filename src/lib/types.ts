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
  humorRating: number;
  winStreak: number;
  lastSeen: string;
}

export interface GameResponse {
  id: string;
  promptId: string;
  playerId: string;
  text: string;
  pointsEarned: number;
  player: Omit<GamePlayer, "score">;
}

export interface GameVote {
  id: string;
  promptId: string;
  voterId: string;
  responseId: string | null;
  voter: { id: string; type: PlayerType };
}

/** A vote with a non-null responseId (the voter picked a response). */
export type CastVote = GameVote & { responseId: string };

/** Filter out abstain votes (null responseId), returning only cast votes with narrowed type. */
export function filterCastVotes(votes: GameVote[]): CastVote[] {
  return votes.filter((v): v is CastVote => v.responseId != null);
}

/** Filter to only abstain votes (null responseId). */
export function filterAbstainVotes(votes: GameVote[]): GameVote[] {
  return votes.filter((v) => v.responseId == null);
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
