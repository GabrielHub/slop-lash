import type { TutorialPractice } from "../../../tutorial/spec";

/** The rehearsal question: phones answer it during the "practice" line's pause. */
export const practice: TutorialPractice = {
  opens: { line: "practice", word: "which" },
  closes: "reveal",
  prompt: "Which pasta is named after little ears?",
  choices: ["Farfalle", "Orecchiette", "Penne", "Fusilli"],
  answer: 1,
};
