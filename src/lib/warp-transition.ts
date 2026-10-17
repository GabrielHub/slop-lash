/**
 * The warp between screens: pressing a marked link pulls the whole starfield
 * into it, the next screen loads while the sky waits there as one bright
 * point, then it bursts back out behind a shockwave that reveals the new
 * screen. The canvas side lives in the stars field; the page side (what fades,
 * what gets pulled in, the reveal) in `src/components/warp-transition.tsx`.
 * Both read their timing from here so the shockwave and the reveal line up.
 */

/** From the press to the route change: the sky falls into the control meanwhile. */
export const WARP_GATHER_MS = 640;
/** How long the burst's shockwave (and the new screen's reveal) takes to clear the viewport. */
export const WARP_REVEAL_MS = 900;
/** The reveal's soft edge, in CSS px; the shockwave rides inside it. */
export const WARP_FEATHER = 150;
/** If the next screen never arrives, the sky bursts back out anyway after this long. */
export const WARP_GIVE_UP_MS = 8_000;

/** The shockwave's radius at `t` (0-1 of the reveal), as a fraction of its reach: fast out, long settle. */
export function warpWave(t: number) {
  const k = Math.min(1, Math.max(0, t));
  return 1 - (1 - k) ** 4;
}

/** How far the shockwave travels from (x, y) to clear a w x h viewport, feather included. */
export function warpReach(x: number, y: number, w: number, h: number) {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + WARP_FEATHER;
}
