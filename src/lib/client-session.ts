/**
 * Shared localStorage getters for use with useSyncExternalStore in shell components.
 * SSR-safe: returns null during server rendering.
 */

export const PLAYER_TOKEN_KEY = "rejoinToken";

export function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

export function getPlayerToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}

export function getHostControlToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hostControlToken");
}

/** No-op subscribe for useSyncExternalStore with localStorage (snapshot-only). */
export const noopSubscribe = () => () => {};
