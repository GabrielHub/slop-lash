// The spot's cut list, in seconds. Shots run back to back; each beat inside a
// shot is in that shot's local seconds (see the shot's file).

import { BRAWL_END } from "./brawl";

export const DURATION = 11.8;

/** The slash that covers the loop seam: half at the end, half at the start. */
export const SEAM = 0.5;

export const SHOTS = {
  /** A marker draws the shark; the doodle pops into a toy. */
  hook: { from: 0, to: 3.3 },
  /** Shark vs toaster, split screen. */
  faceOff: { from: 3.3, to: 5.05 },
  /** Bonks, a rubber-arm haymaker, and the toaster leaves the building. */
  brawl: { from: 5.05, to: 5.05 + BRAWL_END },
  /** Lights down, spot up: the logo, the champion, the line. */
  slate: { from: 5.05 + BRAWL_END, to: DURATION },
} as const;

/** The key-art frame: the end slate, fully settled. */
export const POSTER = 11.0;

/** Where the shark stands when the hook hands it to the face-off (board px, feet). */
export const HERO = { x: 960, y: 890, scale: 1.45 } as const;
