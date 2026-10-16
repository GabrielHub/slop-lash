import type { TutorialScript } from "@/tutorial/timeline";

/**
 * The QuizSlop how-to-play: a rehearsal round. A polished, slightly too
 * confident studio host walks the room through a real practice question that
 * every phone answers (see `practice.ts`), then the bets. Line ids are what
 * the scene keys its beats on; rewording a line keeps its id.
 */
export const script: TutorialScript = {
  lead: 2.4,
  lines: [
    {
      id: "intro",
      say: "[excited] Welcome to QuizSlop! The quiz show where knowing stuff is good... but betting your friends don't is better.",
    },
    {
      id: "topics",
      chapter: "Topics",
      say: "The topic you picked gets a round of its own. Didn't pick one? We picked for you.",
    },
    {
      id: "answer",
      chapter: "Answer",
      say: "Every round, everybody gets a question on their phone. Four choices. One tap locks it in.",
    },
    {
      id: "practice",
      say: "Let's rehearse. Phones out. Which pasta is named after little ears?",
      // The room answers on its phones in this gap.
      pause: 7,
    },
    { id: "reveal", chapter: "Reveal", say: "Pencils down. It's orecchiette. Little ears." },
    {
      id: "points",
      say: "Get it right for a hundred points. Get it wrong, and you get nothing. [laughs] Except judged.",
    },
    {
      id: "bets",
      chapter: "Bet",
      say: "Now, the fun part. Every round starts with bets. Think a friend is about to get one wrong? Call it.",
    },
    {
      id: "payout",
      say: "If they miss, you win a hundred and fifty. If they get it right... you lose a hundred and fifty.",
    },
    { id: "two", say: "You only get two bets all game, so pick your moment." },
    {
      id: "final",
      say: "In the last round, everyone votes on the topic, and right answers are worth double.",
    },
    { id: "outro", say: "Most points wins. [excited] Phones out, brains on! Let's play QuizSlop!" },
  ],
  tail: 2.6,
};
