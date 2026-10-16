import type { SpringConfig } from "@/tutorial/timeline";

/**
 * The QuizSlop spot's beat sheet, in seconds from the loop's start. The
 * curtain is shut at 0 and again at `DURATION`, so the loop's seam is the
 * curtain itself.
 */

export const DURATION = 11.85;

/** The end slate, settled: the marquee lit and the super in. */
export const POSTER = 11.05;

export const AT = {
  /** The curtain starts parting. */
  open: 0.05,
  /** The question's marquee lands, and its two lines wipe on. */
  sign: 0.1,
  lines: [0.36, 0.52],
  /** The marquee tucks up top and the four tiles wipe in under it. */
  tuck: 1.7,
  tiles: 1.8,
  /** The players rise along the bottom. */
  players: 2.25,
  /** The camera leans in on the players while the tiles dim. */
  push: 2.5,
  /** The bet chip rolls in and hunts: over Max, then Jo, then Sam. */
  chip: 2.7,
  hunt: [3.12, 3.4, 3.68],
  /** It drops onto Sam. */
  slam: 3.9,
  /** The band asks "Who gets it wrong?" while the chip hunts; the chip's landing flips it to "Sam". */
  band: 2.85,
  bandOut: 4.8,
  /**
   * The lock-in, one move at a time: the camera pulls back as the board
   * returns, then the pills drop away, then everyone's token flies to its pick.
   */
  pull: 5.0,
  drop: 5.5,
  fly: 5.62,
  /** Orecchiette lights; the right answers get +100. */
  reveal: 6.22,
  plus: 6.34,
  /** Everything but Sam's tile steps out, then the camera goes in on Sam: wrong. */
  clear: 6.82,
  zoom: 6.9,
  miss: 7.22,
  /** The stage clears; the chip leaves Sam for you; the payout card opens and counts +150. */
  payoff: 7.6,
  /** The broadcast wipe to the end slate; it covers the board at `wipe + 0.35`. */
  wipe: 9.1,
  slate: 9.45,
  /** The curtain starts closing for the seam. */
  close: 11.35,
} as const;

/** QuizSlop's settle: fast and precise, about 3% overshoot, no wobble. */
export const SETTLE: SpringConfig = { stiffness: 520, damping: 34, mass: 1 };

/** A big, calm move (the marquee tucking, panels sliding). */
export const GLIDE: SpringConfig = { stiffness: 240, damping: 31, mass: 1 };
