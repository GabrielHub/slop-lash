import { seededShuffle } from "../../lib/hash";
import type { QuizslopQuestionContent } from "./types";

/** The choices as players see them, and where the correct one landed. */
export interface PresentedChoices {
  choices: string[];
  correctIndex: number;
}

/**
 * Orders a question's choices for one game. The catalog stores the correct
 * answer first, so the order must never reach players as written. The order is
 * a pure function of the seed (game id plus question id): the stage, every
 * phone and the scoring code all see the same permutation, and `selectedIndex`
 * is stored in this presented order.
 */
export function presentChoices(
  question: Pick<QuizslopQuestionContent, "choices" | "correctIndex">,
  seed: string,
): PresentedChoices {
  const order = seededShuffle(
    question.choices.map((_, index) => index),
    seed,
  );
  return {
    choices: order.map((source) => question.choices[source]!),
    correctIndex: order.indexOf(question.correctIndex),
  };
}
