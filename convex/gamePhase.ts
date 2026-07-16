import { ConvexError } from "convex/values";
import { MIN_CONTINUING_PLAYERS } from "../src/games/core/game-rules";

export function requireExpectedPhaseGeneration(
  currentPhaseGeneration: number,
  expectedPhaseGeneration: number,
): void {
  if (expectedPhaseGeneration !== currentPhaseGeneration) {
    throw new ConvexError("Game phase already advanced");
  }
}

/**
 * Guards the roster invariant every game mode shares: a game in progress needs
 * enough active competitors to be worth continuing. Keep the rule and its
 * message here so the modes cannot drift apart.
 */
export function requireContinuingPlayers(activePlayerCount: number): void {
  if (activePlayerCount < MIN_CONTINUING_PLAYERS) {
    throw new ConvexError(
      `Need at least ${MIN_CONTINUING_PLAYERS} active players to continue the game`,
    );
  }
}
