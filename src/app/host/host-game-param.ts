import { GAME_TYPES, type GameType } from "@/games/core/types";

/**
 * The game `/host?game=` preselects, e.g. from a finished game's "Play again".
 * Case and whitespace are forgiven; anything unknown falls back to SlopLash.
 */
export function parseHostGameParam(value: string | string[] | undefined): GameType {
  const raw = Array.isArray(value) ? value[0] : value;
  const wanted = raw?.trim().toUpperCase();
  return GAME_TYPES.find((type) => type === wanted) ?? "SLOPLASH";
}
