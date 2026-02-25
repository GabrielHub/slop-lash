export type GameStatus =
  | "LOBBY"
  | "WRITING"
  | "VOTING"
  | "ROUND_RESULTS"
  | "FINAL_RESULTS";

export type PlayerType = "HUMAN" | "AI" | "SPECTATOR";

export type TtsMode = "OFF" | "AI_VOICE" | "BROWSER_VOICE";

/** A Gemini voice name (e.g. "Puck", "Zephyr") or "RANDOM". */
export type TtsVoice = string;

export interface GamePlayer {
  id: string;
  name: string;
  type: PlayerType;
  modelId: string | null;
  idleRounds: number;
  score: number;
  humorRating: number;
  winStreak: number;
  lastSeen: string;
}

export interface GameReaction {
  id: string;
  responseId: string;
  playerId: string;
  emoji: string;
}

export interface GameResponse {
  id: string;
  promptId: string;
  playerId: string;
  text: string;
  pointsEarned: number;
  failReason: string | null;
  reactions: GameReaction[];
  player: Omit<GamePlayer, "score">;
}

export interface GameVote {
  id: string;
  promptId: string;
  voterId: string;
  responseId: string | null;
  failReason: string | null;
  voter: { id: string; type: PlayerType };
}

/** A vote with a non-null responseId (the voter picked a response). */
export type CastVote = GameVote & { responseId: string };

/** Filter out abstain votes (null responseId), returning only cast votes with narrowed type. */
export function filterCastVotes(votes: GameVote[]): CastVote[] {
  return votes.filter((v): v is CastVote => v.responseId != null);
}

/** Filter to only deliberate abstain votes (null responseId, no error). */
export function filterAbstainVotes(votes: GameVote[]): GameVote[] {
  return votes.filter((v) => v.responseId == null && v.failReason == null);
}

/** Filter to only error votes (AI crashed — has a failReason). */
export function filterErrorVotes(votes: GameVote[]): GameVote[] {
  return votes.filter((v) => v.failReason != null);
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
