/**
 * The invented cast and copy of the MatchSlop tutorial. Strings the real game
 * shows (its phone and TV copy) come from `ui/copy.ts`, so the two never drift.
 */

export interface Cast {
  name: string;
  modelId: string | null;
}

/** The AI player in the room (not the date): a model that writes and votes. */
export const AI_MODEL = "anthropic/claude-haiku-5.5";

export const CAST = {
  zoe: { name: "Zoe", modelId: null },
  tess: { name: "Tess", modelId: null },
  remy: { name: "Remy", modelId: null },
  claude: { name: "Claude", modelId: AI_MODEL },
} as const satisfies Record<string, Cast>;

export type CastId = keyof typeof CAST;

/** The match: gender-neutral, as the host's persona can be anyone. */
export const MATCH = {
  name: "Jules",
  age: 27,
  place: "Eastside",
  tagline: "Will steal your hoodie. Might give it back.",
  prompts: [
    { prompt: "My most irrational fear", answer: "Escalators that are off", mark: [0, 23] },
    {
      prompt: "Typical Sunday",
      answer: "Farmers market, then a nap that ruins my evening",
      mark: [22, 48],
    },
    { prompt: "I'll fall for you if", answer: "You know a good dumpling place", mark: [11, 30] },
  ],
} as const;

/** The round's texts, A to D on the ballot. */
export const TEXTS = [
  { text: "Is your Wi-Fi named after me? Because I'm feeling a connection.", author: "zoe" },
  { text: "Two truths and a lie: I'm fun, I'm funny, I own a boat.", author: "tess" },
  { text: "Rate my opener out of 10. Be nice, I'm fragile.", author: "claude" },
  { text: "I know a great dumpling place. It's called my kitchen.", author: "remy" },
] as const satisfies readonly { text: string; author: CastId }[];

/** The ballot's winner (B) and who voted for it. Tess wrote it, so Tess votes D. */
export const WINNER = 1;
export const VOTES: readonly { voter: CastId; card: number }[] = [
  { voter: "zoe", card: 1 },
  { voter: "remy", card: 1 },
  { voter: "claude", card: 1 },
  { voter: "tess", card: 3 },
];

/** The match's reply to the sent line. */
export const REPLY = "A boat?? Okay, you have my attention.";

/** Round 2 on the opener phone: their latest line, and a reply. */
export const LATEST = "Okay, what's your idea of a perfect first date?";
export const ROUND_TWO_REPLY = "Dumplings. Then a nap. Then more dumplings.";

export type LevelId = "great" | "good" | "cute" | "meh" | "cringe" | "dealbreaker";

export interface Reaction {
  id: LevelId;
  emoji: string;
  word: string;
  /** Mood delta. */
  delta: number;
  tone: "win" | "ink" | "fail";
}

/** The six reactions, in the order the host names them. Deltas from `MATCHSLOP_LEVEL_DELTA`. */
export const REACTIONS: readonly Reaction[] = [
  { id: "great", emoji: "😍", word: "Great", delta: 15, tone: "win" },
  { id: "good", emoji: "😊", word: "Good", delta: 10, tone: "win" },
  { id: "cute", emoji: "🙂", word: "Cute", delta: 5, tone: "win" },
  { id: "meh", emoji: "😐", word: "Meh", delta: 0, tone: "ink" },
  { id: "cringe", emoji: "😬", word: "Cringe", delta: -10, tone: "fail" },
  { id: "dealbreaker", emoji: "💀", word: "Dealbreaker", delta: -20, tone: "fail" },
];

/** Points, from `game-config.ts` and `rules.ts`. */
export const POINTS = { perVote: 25, sent: 50, humanWeight: 2, aiWeight: 1 } as const;
