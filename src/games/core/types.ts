/** Game modes supported by the shared Convex room platform. */
export const GAME_TYPES = ["SLOPLASH", "AI_CHAT_SHOWDOWN", "MATCHSLOP", "QUIZSLOP"] as const;
export type GameType = (typeof GAME_TYPES)[number];
