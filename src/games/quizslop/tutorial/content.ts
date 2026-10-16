/**
 * The invented example game the tutorial plays through on the standalone
 * page: four friends, their topics, a question, their bets. Nothing here is
 * real play data; in a lobby the rehearsal shows the room's real players.
 */

export type PlayerName = "Ana" | "Sam" | "Jo" | "Max";

/** Fixed token colours, picked so the four read apart at a glance. */
export const PLAYER_COLOR: Record<PlayerName, string> = {
  Ana: "#2563EB",
  Sam: "#7C3AED",
  Jo: "#EA580C",
  Max: "#059669",
};

/** The lobby: each player's topic, picked before the show. Max didn't pick, so the house did. */
export const LOBBY: readonly { name: PlayerName; topic: string; house: boolean }[] = [
  { name: "Ana", topic: "Pasta Shapes", house: false },
  { name: "Sam", topic: "Famous Heists", house: false },
  { name: "Jo", topic: "Deep-Sea Creatures", house: false },
  { name: "Max", topic: "90s Cartoons", house: true },
];

/** The show rundown: a warm-up, one round per player's topic, then the last round. */
export const RUNDOWN: readonly {
  kicker: string;
  owner: PlayerName | null;
  topic: string | null;
  tone: "teal" | "punch" | "gold";
}[] = [
  { kicker: "Warm-up", owner: null, topic: "Volcanoes", tone: "teal" },
  { kicker: "'s topic", owner: "Ana", topic: "Pasta Shapes", tone: "punch" },
  { kicker: "'s topic", owner: "Sam", topic: "Famous Heists", tone: "punch" },
  { kicker: "'s topic", owner: "Jo", topic: "Deep-Sea Creatures", tone: "punch" },
  { kicker: "'s topic", owner: "Max", topic: "90s Cartoons", tone: "punch" },
  { kicker: "Last round", owner: null, topic: null, tone: "gold" },
];

/** The example question the phones show while the host explains answering (not the practice one). */
export const DEMO = {
  topic: "Space Junk",
  prompt: "What did an astronaut lose on a 2008 spacewalk?",
  choices: ["A camera", "A tool bag", "A sandwich", "A glove"],
  correct: 1,
} as const;

/**
 * The answer round: everyone gets their own question from the round's topic
 * (each at their own hidden difficulty), so no two phones match. Ana's is DEMO.
 */
export const ROUND_QUESTIONS: Record<PlayerName, { topic: string; prompt: string; choices: readonly string[]; correct: number }> = {
  Ana: DEMO,
  Sam: {
    topic: DEMO.topic,
    prompt: "Which of these was really left on the Moon?",
    choices: ["A piano", "Golf balls", "A sofa", "A surfboard"],
    correct: 1,
  },
  Jo: {
    topic: DEMO.topic,
    prompt: "Which space station fell back to Earth in 2001?",
    choices: ["Skylab", "Salyut 7", "Mir", "Tiangong-1"],
    correct: 2,
  },
  Max: {
    topic: DEMO.topic,
    prompt: "Where did Skylab's debris land in 1979?",
    choices: ["Canada", "Australia", "Brazil", "Norway"],
    correct: 1,
  },
};

export const TOPIC = "Pasta Shapes";

export const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * The rehearsal's invented cast for the standalone page: three right, one
 * wrong, locking in at these seconds after the question opens.
 */
export const REHEARSAL_CAST: readonly { name: PlayerName; pick: number; lockAfter: number }[] = [
  { name: "Ana", pick: 1, lockAfter: 2.2 },
  { name: "Sam", pick: 1, lockAfter: 3.6 },
  { name: "Jo", pick: 3, lockAfter: 5.1 },
  { name: "Max", pick: 1, lockAfter: 6.9 },
];

/** The last round's vote: three topics, and who votes for which. */
export const SLATE = ["Board Games", "Cheese of the World", "Haunted Castles"] as const;
export const VOTES: readonly { name: PlayerName; topic: number }[] = [
  { name: "Ana", topic: 1 },
  { name: "Sam", topic: 0 },
  { name: "Jo", topic: 1 },
  { name: "Max", topic: 2 },
];
export const VOTE_WINNER = 1;

/** Final standings, in seat order. Jo wins. */
export const STANDINGS: readonly { name: PlayerName; total: number }[] = [
  { name: "Ana", total: 550 },
  { name: "Sam", total: 400 },
  { name: "Jo", total: 850 },
  { name: "Max", total: 250 },
];

export const MINUS = "−";
