/** Game modes supported by the shared Convex room platform. */
export const GAME_TYPES = ["SLOPLASH", "MATCHSLOP", "QUIZSLOP", "SLOPFIGHT"] as const;
export type GameType = (typeof GAME_TYPES)[number];
