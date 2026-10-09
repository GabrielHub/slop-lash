import type { Id } from "../../../convex/_generated/dataModel";
import type { ModeView, RoomView } from "@/room/context";
import { FIXTURE_NOW, fixtureId, fixturePlayer, fixtureView, type Fixture } from "./base";

type Mode = ModeView<"MATCHSLOP">;
type Round = NonNullable<Mode["round"]>;
type Message = Mode["messages"][number];

const gabe = fixturePlayer("gabe", "Gabe");
const amy = fixturePlayer("amy", "Amy");
const beau = fixturePlayer("beau", "Beau");
const haiku = fixturePlayer("haiku", "Claude Haiku", {
  type: "AI",
  modelId: "anthropic/claude-haiku-5.5",
});
const players = [gabe, amy, beau, haiku];
const ids = players.map((player) => player.id);

function scored(scores: Record<string, number>) {
  return players.map((player) => ({ ...player, score: scores[player.name] ?? 0 }));
}

const NORA: NonNullable<Mode["persona"]["profile"]> = {
  displayName: "Nora",
  backstory: "Tattoo apprentice who reads tarot for her regulars and fixes bikes for fun.",
  appearance: "Bleached buzzcut, oil-stained denim jacket, a tin of anchovies in one pocket.",
  age: 29,
  location: "Echo Park",
  bio: "Tarot decks, bike grease, and the kind of confidence that gets you banned from trivia night.",
  tagline: "Looking for someone funny enough to survive brunch.",
  prompts: [
    {
      id: "p-sunday",
      prompt: "Typical Sunday",
      answer: "Farmer's market, then a reckless amount of anchovies.",
    },
    {
      id: "p-unhinged",
      prompt: "The most unhinged thing about me",
      answer: "I once live-blogged a neighborhood coyote for nine days.",
    },
    {
      id: "p-along",
      prompt: "We'll get along if",
      answer: "You can commit to a bit longer than a situationship.",
    },
  ],
  details: {
    job: "Tattoo Apprentice",
    school: "CalArts",
    height: "5'6\"",
    languages: ["English", "Spanish"],
  },
};

function persona(overrides: Partial<Mode["persona"]> = {}): Mode["persona"] {
  return {
    seekerIdentity: "MAN",
    personaIdentity: "WOMAN",
    modelId: "openai/gpt-6.1-sol",
    profile: NORA,
    portraitUrl: null,
    portraitPending: false,
    ...overrides,
  };
}

function message(
  key: string,
  turn: number,
  speaker: Message["speaker"],
  text: string,
  extra: Partial<Message> = {},
): Message {
  return {
    id: fixtureId("matchSlopMessages", key),
    turn,
    speaker,
    text,
    authorName: speaker === "PERSONA" ? "Nora" : null,
    openerPromptText: null,
    mood: null,
    outcome: null,
    ...extra,
  };
}

const OPENER = message(
  "r1-players",
  1,
  "PLAYERS",
  "Reckless anchovies? Finally, a woman who respects the tin.",
  { authorName: "Amy", openerPromptText: "Typical Sunday" },
);
const REPLY_1 = message(
  "r1-nora",
  1,
  "PERSONA",
  "the tin respects ME. ok tell me your farmer's market crime of choice",
  { mood: 58, outcome: "CONTINUE" },
);
const SENT_2 = message(
  "r2-players",
  2,
  "PLAYERS",
  "I sample every hot sauce and buy none. They know my face. They fear my face.",
  { authorName: "Beau" },
);
const UNMATCH_2 = message(
  "r2-nora",
  2,
  "PERSONA",
  "you're the reason they put up the one-sample-per-customer sign. unmatched.",
  { mood: 18, outcome: "UNMATCHED" },
);

const SIGNAL_1: Mode["signal"] = {
  category: "solid",
  sideComment: "ok the tin thing got me",
  nextSignal: "stay specific and committed",
  moodDelta: 8,
};
const SIGNAL_UNMATCH: Mode["signal"] = {
  category: "too much",
  sideComment: "the sign has my handwriting on it",
  nextSignal: "that was the last straw",
  moodDelta: -40,
};

type AnswerSeed = [key: string, author: (typeof players)[number], text: string, opener?: string];

const OPENERS: AnswerSeed[] = [
  [
    "gabe-1",
    gabe,
    "I also live-blog wildlife. Mostly my roommate. He's nocturnal.",
    "The most unhinged thing about me",
  ],
  ["amy-1", amy, "Reckless anchovies? Finally, a woman who respects the tin.", "Typical Sunday"],
  [
    "beau-1",
    beau,
    "Is that a tarot deck in your photo or are you just happy to see me",
    "Their photo",
  ],
  ["haiku-1", haiku, "I'm emotionally available and lightly marinated.", "Typical Sunday"],
];

const FOLLOW_UPS: AnswerSeed[] = [
  ["gabe-2", gabe, "I fake-haggle at the free sample table. Last week they gave me two."],
  [
    "amy-2",
    amy,
    "I tell the honey guy his bees seem stressed. Every week. He's starting to believe me.",
  ],
  ["beau-2", beau, SENT_2.text],
];

const COMEBACKS: AnswerSeed[] = [
  [
    "gabe-3",
    gabe,
    "Fair. But if the hot sauce guy flakes, I make an incredible emotional support butter board.",
  ],
  [
    "amy-3",
    amy,
    "Counterpoint: I've been banned from that market too. We could be banned together.",
  ],
  ["haiku-3", haiku, "Then let me be the jam. Two carbs this compatible don't just happen."],
];

/** Votes as [weighted, raw, points] per answer key, once the round is revealed. */
type Tally = Record<string, [number, number, number]>;

function round(
  number: number,
  promptText: string,
  seeds: AnswerSeed[],
  options: {
    answered?: Id<"players">[];
    voted?: Id<"players">[];
    /** Names every author with their votes, as once the message is sent. */
    reveal?: Tally;
    showAnswers?: boolean;
    myVote?: string;
    winner?: string;
  } = {},
): Round {
  const viewer = gabe.id;
  const answered = options.answered ?? seeds.map(([, author]) => author.id);
  const mine = answered.includes(viewer)
    ? seeds.find(([, author]) => author.id === viewer)
    : undefined;
  return {
    number,
    promptId: fixtureId("prompts", `r${number}`),
    promptText,
    answeredPlayerIds: answered,
    votedPlayerIds: options.voted ?? [],
    myResponseId: mine ? fixtureId("responses", mine[0]) : null,
    myVoteResponseId: options.myVote ? fixtureId("responses", options.myVote) : null,
    answers:
      options.showAnswers === false
        ? []
        : seeds.map(([key, author, text, opener]) => {
            const [weightedVotes, rawVotes, pointsEarned] = options.reveal?.[key] ?? [0, 0, 0];
            return {
              id: fixtureId("responses", key),
              text,
              openerPromptText: opener ?? null,
              playerId: options.reveal || author.id === viewer ? author.id : null,
              weightedVotes,
              rawVotes,
              pointsEarned,
            };
          }),
    forfeitedPlayerIds: [],
    winnerResponseId: options.winner ? fixtureId("responses", options.winner) : null,
  };
}

function mode(overrides: Partial<Mode> = {}): Mode {
  return {
    kind: "MATCHSLOP",
    persona: persona({ portraitPending: true }),
    mood: 50,
    outcome: "IN_PROGRESS",
    comeback: false,
    signal: null,
    messages: [],
    round: null,
    postMortem: null,
    ...overrides,
  };
}

function playing(
  phase: string,
  roundNumber: number,
  extra: Partial<RoomView["room"]> = {},
): Partial<RoomView["room"]> & Pick<RoomView["room"], "gameType"> {
  return {
    gameType: "MATCHSLOP",
    status: "PLAYING",
    phase,
    round: roundNumber,
    totalRounds: 5,
    phaseGeneration: roundNumber * 5,
    ...extra,
  };
}

const ROUND_1_TALLY: Tally = {
  "amy-1": [5, 3, 175],
  "gabe-1": [2, 1, 50],
  "beau-1": [0, 0, 0],
  "haiku-1": [0, 0, 0],
};

const USAGE: RoomView["usage"] = {
  inputTokens: 48_210,
  outputTokens: 6_934,
  costUsd: 0.0842,
  byModel: [
    { modelId: "openai/gpt-6.1-sol", inputTokens: 31_400, outputTokens: 4_120, costUsd: 0.0713 },
    {
      modelId: "anthropic/claude-haiku-5.5",
      inputTokens: 16_810,
      outputTokens: 2_814,
      costUsd: 0.0129,
    },
  ],
};

const FINAL_DATE_MESSAGES: Message[] = [
  OPENER,
  REPLY_1,
  message(
    "d2-players",
    2,
    "PLAYERS",
    "I fake-haggle at the free sample table. Last week they gave me two.",
    { authorName: "Gabe" },
  ),
  message("d2-nora", 2, "PERSONA", "...that's weirdly hot. keep talking", {
    mood: 71,
    outcome: "CONTINUE",
  }),
  message(
    "d3-players",
    3,
    "PLAYERS",
    "Sunday. I bring the anchovies, you bring the tarot, and we let the coyote decide.",
    { authorName: "Amy" },
  ),
  message("d3-nora", 3, "PERSONA", "the coyote says yes. so do i. sunday, 10am, don't be late", {
    mood: 86,
    outcome: "DATE_SEALED",
  }),
];

const FINAL_UNMATCHED_MESSAGES: Message[] = [
  OPENER,
  REPLY_1,
  SENT_2,
  UNMATCH_2,
  message("u3-players", 3, "PLAYERS", COMEBACKS[0]![2], { authorName: "Gabe" }),
  message("u3-nora", 3, "PERSONA", "i'd rather date the butter board. goodbye forever", {
    mood: 4,
    outcome: "UNMATCHED",
  }),
];

export const matchslopFixtures: Fixture[] = [
  {
    id: "matchslop-lobby",
    label: "MatchSlop · Lobby with the persona ready",
    view: fixtureView(players, { gameType: "MATCHSLOP", totalRounds: 5 }, mode()),
  },
  {
    id: "matchslop-profile",
    label: "MatchSlop · Waiting on the profile",
    view: fixtureView(
      players,
      playing("PROFILE", 0, { phaseDeadline: null }),
      mode({ persona: persona({ profile: null }) }),
    ),
  },
  {
    id: "matchslop-opener-writing",
    label: "MatchSlop · Round 1 openers (picking a prompt)",
    view: fixtureView(
      players,
      playing("WRITING", 1),
      mode({
        round: round(
          1,
          "Pick one of Nora's profile prompts and send the funniest opener.",
          OPENERS,
          {
            answered: [amy.id, haiku.id],
            showAnswers: false,
          },
        ),
      }),
    ),
  },
  {
    id: "matchslop-opener-voting",
    label: "MatchSlop · Round 1 ballot",
    view: fixtureView(
      players,
      playing("VOTING", 1),
      mode({
        round: round(
          1,
          "Pick one of Nora's profile prompts and send the funniest opener.",
          OPENERS,
          {
            voted: [amy.id, haiku.id],
          },
        ),
      }),
    ),
  },
  {
    id: "matchslop-sent",
    label: "MatchSlop · Winning opener sent, Nora typing",
    view: fixtureView(
      scored({ Amy: 175, Gabe: 50 }),
      playing("SENT", 1, { phaseDeadline: null }),
      mode({
        messages: [OPENER],
        round: round(
          1,
          "Pick one of Nora's profile prompts and send the funniest opener.",
          OPENERS,
          {
            voted: ids,
            myVote: "amy-1",
            reveal: ROUND_1_TALLY,
            winner: "amy-1",
          },
        ),
      }),
    ),
  },
  {
    id: "matchslop-reply",
    label: "MatchSlop · Nora replies",
    view: fixtureView(
      scored({ Amy: 175, Gabe: 50 }),
      playing("REPLY", 1),
      mode({
        mood: 58,
        signal: SIGNAL_1,
        messages: [OPENER, REPLY_1],
        round: round(
          1,
          "Pick one of Nora's profile prompts and send the funniest opener.",
          OPENERS,
          {
            voted: ids,
            myVote: "amy-1",
            reveal: ROUND_1_TALLY,
            winner: "amy-1",
          },
        ),
      }),
    ),
  },
  {
    id: "matchslop-follow-up-writing",
    label: "MatchSlop · Round 2 writing",
    view: fixtureView(
      scored({ Amy: 175, Gabe: 50 }),
      playing("WRITING", 2),
      mode({
        persona: persona(),
        mood: 58,
        signal: SIGNAL_1,
        messages: [OPENER, REPLY_1],
        round: round(2, REPLY_1.text, [], { answered: [beau.id], showAnswers: false }),
      }),
    ),
  },
  {
    id: "matchslop-unmatched-reply",
    label: "MatchSlop · Unmatched, comeback coming",
    view: fixtureView(
      scored({ Amy: 200, Gabe: 100, Beau: 125 }),
      playing("REPLY", 2),
      mode({
        persona: persona(),
        mood: 18,
        signal: SIGNAL_UNMATCH,
        messages: [OPENER, REPLY_1, SENT_2, UNMATCH_2],
        round: round(2, REPLY_1.text, FOLLOW_UPS, {
          voted: ids,
          myVote: "beau-2",
          reveal: { "beau-2": [3, 2, 125], "gabe-2": [2, 1, 50], "amy-2": [1, 1, 25] },
          winner: "beau-2",
        }),
      }),
    ),
  },
  {
    id: "matchslop-comeback-voting",
    label: "MatchSlop · Comeback vote, already voted",
    view: fixtureView(
      scored({ Amy: 200, Gabe: 100, Beau: 125 }),
      playing("VOTING", 3, { phaseDeadline: FIXTURE_NOW + 12_000 }),
      mode({
        persona: persona(),
        mood: 18,
        comeback: true,
        signal: SIGNAL_UNMATCH,
        messages: [OPENER, REPLY_1, SENT_2, UNMATCH_2],
        round: round(3, UNMATCH_2.text, COMEBACKS, {
          voted: [gabe.id, beau.id],
          myVote: "amy-3",
        }),
      }),
    ),
  },
  {
    id: "matchslop-final-date",
    label: "MatchSlop · Final: date sealed",
    view: fixtureView(
      scored({ Amy: 400, Gabe: 225, Beau: 50, "Claude Haiku": 25 }),
      { gameType: "MATCHSLOP", status: "FINISHED", phase: "FINAL", round: 3, totalRounds: 5 },
      mode({
        persona: persona(),
        mood: 86,
        outcome: "DATE_SEALED",
        messages: FINAL_DATE_MESSAGES,
        postMortem: {
          pending: false,
          value: {
            opening:
              "I came for the anchovy discourse and stayed because four strangers somehow out-weirded me.",
            playerCallouts: [
              {
                playerName: "Amy",
                verdict: "Opened strong, closed stronger. Respects the tin.",
                favoriteLine: "we let the coyote decide",
              },
              {
                playerName: "Gabe",
                verdict: "Haggling for free samples is a red flag I would follow into battle.",
                favoriteLine: "Last week they gave me two.",
              },
              {
                playerName: "Beau",
                verdict: "Asked about my photo before it existed. Bold. Wrong, but bold.",
                favoriteLine: null,
              },
              {
                playerName: "Claude Haiku",
                verdict: "Lightly marinated. Heavily forgettable.",
                favoriteLine: "I'm emotionally available and lightly marinated.",
              },
            ],
            favoriteMoment: "The moment the coyote became a co-signer on this date.",
            finalThought: "Sunday, 10am. If anyone brings a butter board I'm leaving.",
          },
        },
      }),
      { usage: USAGE },
    ),
  },
  {
    id: "matchslop-final-unmatched",
    label: "MatchSlop · Final: unmatched, post-mortem typing",
    view: fixtureView(
      scored({ Amy: 175, Gabe: 150, Beau: 100 }),
      { gameType: "MATCHSLOP", status: "FINISHED", phase: "FINAL", round: 3, totalRounds: 5 },
      mode({
        persona: persona(),
        mood: 4,
        outcome: "UNMATCHED",
        messages: FINAL_UNMATCHED_MESSAGES,
        postMortem: { pending: true, value: null },
      }),
      { viewer: beau, usage: USAGE },
    ),
  },
  {
    id: "matchslop-final-recap",
    label: "MatchSlop · Recap for a spectator (no post-mortem)",
    view: fixtureView(
      scored({ Amy: 175, Gabe: 50, Beau: 125 }),
      { gameType: "MATCHSLOP", status: "FINISHED", phase: "FINAL", round: 2, totalRounds: 2 },
      mode({
        persona: persona(),
        mood: 30,
        outcome: "TURN_LIMIT",
        messages: [
          OPENER,
          REPLY_1,
          SENT_2,
          message("t2-nora", 2, "PERSONA", "lol. anyway my bus is here", {
            mood: 30,
            outcome: "TURN_LIMIT",
          }),
        ],
        postMortem: { pending: false, value: null },
      }),
      { viewer: null, usage: USAGE },
    ),
  },
];
