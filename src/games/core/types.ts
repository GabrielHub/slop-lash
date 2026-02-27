/** Core game contracts for multi-game support. */

export type GameType = "SLOPLASH" | "AI_CHAT_SHOWDOWN";

export interface GameCapabilities {
  /** Whether the game supports a live TTS narrator (e.g. Slop-Lash). */
  supportsNarrator: boolean;
  /** Whether the game supports sound effects. */
  supportsSfx: boolean;
  /** Whether the game has an always-visible chat feed (e.g. AI Chat Showdown). */
  supportsChatFeed: boolean;
  /** Whether spectators can join and watch. */
  supportsSpectators: boolean;
  /** Whether completed game data is retained long-term (leaderboard, replay). If false, data is deleted post-game. */
  retainsCompletedData: boolean;
}

/** The phase that was advanced to, or null if no transition occurred. */
export type PhaseAdvanceResult =
  | "WRITING"
  | "VOTING"
  | "VOTING_SUBPHASE"
  | "ROUND_RESULTS"
  | "FINAL_RESULTS"
  | null;

/** Concrete operations that API routes dispatch through per game type. */
export interface GameHandlers {
  /** Start a new round (e.g., assign prompts, set deadlines). */
  startGame(gameId: string, roundNumber: number): Promise<void>;

  /** End the game early (host ends during active play). */
  endGameEarly(gameId: string): Promise<void>;

  /** Advance from round results to next round. Returns true if a new round started. */
  advanceGame(gameId: string): Promise<boolean>;

  /** Force advance past current timed phase (host skip). Returns the phase advanced to. */
  forceAdvancePhase(gameId: string): Promise<PhaseAdvanceResult>;

  /** Check and enforce a phase deadline. Returns the phase advanced to. */
  checkAndEnforceDeadline(gameId: string): Promise<PhaseAdvanceResult>;

  /** Check if all responses are submitted for the current writing phase. */
  checkAllResponsesIn(gameId: string): Promise<boolean>;

  /** Transition from writing to voting phase. Returns true if this call claimed the transition. */
  startVoting(gameId: string): Promise<boolean>;

  /** Get prompts eligible for voting in the current round. */
  getVotablePrompts(gameId: string): Promise<Array<{ id: string }>>;

  /** Check if all votes are in for the current voting prompt. */
  checkAllVotesForCurrentPrompt(gameId: string): Promise<boolean>;

  /** Reveal vote results for the current prompt. Returns true if revealed. */
  revealCurrentPrompt(gameId: string): Promise<boolean>;

  /** Generate AI responses for the current round (background task). */
  generateAiResponses(gameId: string): Promise<void>;

  /** Generate AI votes for the current round (background task). */
  generateAiVotes(gameId: string): Promise<void>;

  /** Promote a new host when the current one is stale. */
  promoteHost(gameId: string): Promise<void>;
}

export interface GameConstants {
  minPlayers: number;
  maxPlayers: number;
  maxSpectators: number;
  /** Duration in ms after which a host is considered stale. */
  hostStaleMs: number;
}

/** The main contract every game module must satisfy. */
export interface GameDefinition {
  /** Unique game type identifier — must match the Prisma GameType enum value. */
  id: GameType;
  /** Human-readable name shown in the UI. */
  displayName: string;
  /** Feature flags for this game mode. */
  capabilities: GameCapabilities;
  /** Game-specific handler implementations for API route dispatch. */
  handlers: GameHandlers;
  /** Game-specific constants (player limits, timeouts, etc.). */
  constants: GameConstants;
}
