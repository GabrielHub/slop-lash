/**
 * QuizSlop's shared timings, in ms from each moment's anchor. The stage and the
 * phones read the same numbers, so a phone's payoff never lands before the TV's.
 * Pure: no React.
 */

/** The shell's round-1 game-start card clears at about 1.47s. */
export const GAME_START_CARD_MS = 1600;
/** A normal title card clears at about 1.77s. */
export const TITLE_CARD_MS = 1800;
/** Choices stay inert this long after they appear, so a stray tap can't lock an answer. */
export const TAP_GUARD_MS = 400;
/** The "bets you'll miss" alert collapses into a banner after this long. */
export const ALERT_COLLAPSE_MS = 1200;

/** The round opener: kicker, title words, the owner, then the body. */
export const OPENER = {
  kicker: 0,
  title: 300,
  owner: 900,
  body: 1600,
  pills: 2200,
  tracker: 2600,
} as const;

/** The last round's tally: votes drop, the winner is picked, then it becomes the opener. */
export const TALLY = {
  drop: 0,
  pick: 1100,
  morph: 1800,
  double: 2400,
  body: 3200,
  pills: 3600,
  tracker: 4000,
} as const;

/** The vote for the last topic; anchored after its title card. */
export const VOTE = { headline: 0, cards: 300, tracker: 900 } as const;

/** One reveal step: the question, the picks flying to their tiles, the key, the bets. */
export const REVEAL = { start: 0, fly: 1200, key: 2400, bets: 3200 } as const;

/** Round results: delta chips, totals counting, the re-sort, the crown. */
export const RESULTS = { chips: 500, count: 1100, sort: 2300, crown: 2900 } as const;

/**
 * Up to this many bets, the ANSWER board names each one and slams them one by
 * one; past it, the cards turn into quick avatar pairs under a single slam.
 */
export const ANSWER_BETS_NAMED_MAX = 4;
/** The same split for a reveal step's bets. */
export const REVEAL_BETS_NAMED_MAX = 2;

/** When each of `n` bet cards slams onto the ANSWER board. */
export function answerBetTimes(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 600 + i * (n <= ANSWER_BETS_NAMED_MAX ? 400 : 150));
}

/** When each of `c` bets in a reveal step gets its verdict stamp. */
export function revealBetTimes(c: number): number[] {
  return Array.from({ length: c }, (_, j) => 3200 + j * (c <= REVEAL_BETS_NAMED_MAX ? 400 : 120));
}

/** When a reveal step's explanation unmasks: after its last bet stamp, never later than 4.8s. */
export function explanationAt(c: number): number {
  return c === 0 ? 3200 : Math.min(4800, revealBetTimes(c)[c - 1]! + 700);
}

/**
 * The final's beats: each non-winner's bar (i = 0 is last place), the winner,
 * the celebration, then each award card.
 */
export function finalTimes(nonWinners: number, awards: number) {
  const g = nonWinners <= 1 ? 0 : Math.min(450, 1800 / (nonWinners - 1));
  const bars = Array.from({ length: nonWinners }, (_, i) => 500 + i * g);
  const winner = nonWinners > 0 ? 500 + (nonWinners - 1) * g + 1000 : 500;
  return {
    bars,
    winner,
    celebrate: winner + 600,
    awards: Array.from({ length: awards }, (_, j) => winner + 1400 + j * 450),
  };
}
