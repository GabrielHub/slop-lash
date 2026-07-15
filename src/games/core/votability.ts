import { FORFEIT_MARKER } from "./constants";
import type { GameType } from "./types";

/**
 * Whether a prompt can be voted on, given the responses submitted for it.
 *
 * The stage and controller views must agree on this, or players are shown a
 * matchup their phones cannot vote on (or vice versa). Keep it here rather than
 * inline at each view, so the two cannot drift apart.
 *
 * Slop-Lash pairs exactly two players per prompt, so a single forfeit leaves
 * nothing to judge. ChatSlop and MatchSlop run one prompt across the room, where
 * a forfeit only removes that player from contention.
 */
export function isPromptVotable(
  gameType: GameType,
  responses: ReadonlyArray<{ text: string }>,
): boolean {
  switch (gameType) {
    case "MATCHSLOP":
      return responses.some((response) => response.text !== FORFEIT_MARKER);
    case "AI_CHAT_SHOWDOWN":
      return (
        responses.length >= 2 && !responses.every((response) => response.text === FORFEIT_MARKER)
      );
    default:
      return (
        responses.length >= 2 && !responses.some((response) => response.text === FORFEIT_MARKER)
      );
  }
}
