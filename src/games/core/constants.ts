/** Sentinel response text indicating a player forfeited (did not submit in time). */
export const FORFEIT_MARKER = "[forfeit]";

/**
 * The forfeit sentinel shares the response text column with player-authored text,
 * so submit boundaries must reject text that would impersonate it. Scoring treats a
 * forfeited response as an uncontested loss, which a player could otherwise claim by
 * typing the marker themselves.
 */
export function isForfeitMarker(text: string): boolean {
  return text === FORFEIT_MARKER;
}
