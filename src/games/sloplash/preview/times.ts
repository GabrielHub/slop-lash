/**
 * The spot's beats, in seconds from the start of the loop. One micro-story:
 * a prompt, two answers, a flawless sweep, and the twist that the loser was
 * the AI; then the LED wordmark, and a pixel sweep back to the top.
 */

export const DURATION = 10.5;

/** The pixel sweep that covers the seam: it covers the board fully at `DURATION` (= 0). */
export const SWEEP = 0.76;

export const BEATS = {
  // Hook: the prompt glitches onto the LED wall and holds.
  promptOn: 0.1,
  promptLock: 0.46,
  promptUp: 1.5,
  // Face-off: the cards slam in from either side, the VS lands between them.
  leftIn: 1.57,
  rightIn: 1.75,
  vs: 1.95,
  mystery: 2.13,
  ask: 2.3,
  askOut: 3.45,
  // Votes: four friends' tokens fly into the left card, then the stamp.
  votes: [3.5, 3.7, 3.9, 4.1] as const,
  flight: 0.36,
  /** The FLAWLESS stamp slams big across the winning card, then settles into its corner. */
  flawless: 4.52,
  bonus: 4.74,
  settle: 5.16,
  // Twist: the winner was a friend; the camera pushes in on the loser: the AI.
  flipLeft: 5.32,
  push: 5.92,
  flipRight: 6.06,
  pull: 6.68,
  score: 6.92,
  // The AI's glitch takes the screen, and cuts to the end slate.
  glitch: 7.66,
  cut: 7.9,
  rainStart: 7.96,
  rainEnd: 8.44,
  lock: 8.5,
  tagline: 8.74,
} as const;

/** The key-art frame: the wordmark locked, the line in, the confetti settled. */
export const POSTER = 9.9;
