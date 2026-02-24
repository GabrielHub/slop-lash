/**
 * Deterministic player color based on name.
 * Each human player gets a consistent color across all game phases.
 */

const PLAYER_COLORS = [
  "#E91E63", // Rose
  "#7C3AED", // Violet
  "#2563EB", // Blue
  "#0891B2", // Cyan
  "#059669", // Emerald
  "#EA580C", // Orange
  "#C026D3", // Fuchsia
  "#4F46E5", // Indigo
  "#D97706", // Amber
  "#16A34A", // Green
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Returns a hex color string deterministically chosen from the player's name. */
export function getPlayerColor(name: string): string {
  return PLAYER_COLORS[hashName(name) % PLAYER_COLORS.length];
}
