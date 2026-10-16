import type { ComponentType } from "react";
import type { GameType } from "@/games/core/types";
import type { AmbientScene } from "@/lib/ambient-events";
import type { Cues, TutorialScript, TutorialTiming } from "./timeline";

/** A sound on a beat: `play` runs once as the playhead crosses `at` (seconds). */
export interface SoundCue {
  at: number;
  play: () => void;
}

/** A game's tutorial visuals, loaded only by screens that draw them. */
export interface TutorialScene {
  /** Draws the frame for the current time (read it with `useTime` / `useLocalTime`). */
  Scene: ComponentType;
  /** Sound effects keyed on the voice. */
  sounds?(cues: Cues): SoundCue[];
  /** Fetches the scene's sound files ahead of time. */
  preload?(): void;
}

/**
 * A practice question the room answers on its phones while the tutorial
 * plays. Phones show it from `opens` until `closes` starts, then whether they
 * got it; the scene shows who locked in and reveals the picks.
 */
export interface TutorialPractice {
  opens: { line: string; word: string };
  /** The line that reveals the answer. */
  closes: string;
  prompt: string;
  choices: readonly string[];
  answer: number;
}

/** Everything about one game's tutorial. The script and timing are small; the scene loads on demand. */
export interface TutorialEntry {
  game: GameType;
  script: TutorialScript;
  timing: TutorialTiming;
  /** The background field behind the board where no room sets one. */
  ambient: AmbientScene;
  /** A question the room answers on its phones mid-video. */
  practice?: TutorialPractice;
  load(): Promise<TutorialScene>;
}
