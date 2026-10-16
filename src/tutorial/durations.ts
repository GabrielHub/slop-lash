// What the server needs to know about each tutorial: how long it runs (for the
// start-after-tutorial timer) and how many answers its practice question has.
// Relative imports and no UI: Convex bundles this file.
import type { GameType } from "../games/core/types";
import { practice as quizslopPractice } from "../games/quizslop/tutorial/practice";
import { timing as matchslop } from "../games/matchslop/tutorial/timing";
import { timing as quizslop } from "../games/quizslop/tutorial/timing";
import { timing as slopfight } from "../games/slopfight/tutorial/timing";
import { timing as sloplash } from "../games/sloplash/tutorial/timing";

export const TUTORIAL_DURATION_MS: Record<GameType, number> = {
  SLOPLASH: sloplash.durationMs,
  MATCHSLOP: matchslop.durationMs,
  QUIZSLOP: quizslop.durationMs,
  SLOPFIGHT: slopfight.durationMs,
};

/** How many answers each video's practice question offers, for games that have one. */
export const TUTORIAL_CHOICES: Partial<Record<GameType, number>> = {
  QUIZSLOP: quizslopPractice.choices.length,
};
