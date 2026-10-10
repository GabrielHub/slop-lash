import { moodPoints } from "@/games/matchslop/rules";
import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import { FIXTURE_NOW, fixtureId, fixturePlayer, fixtureView, type Fixture } from "./base";

type Mode = ModeView<"MATCHSLOP">;
type Round = NonNullable<Mode["round"]>;
type Message = Mode["messages"][number];
type Signal = NonNullable<Mode["signal"]>;
type Profile = NonNullable<Mode["persona"]["profile"]>;

// ---- Players ---------------------------------------------------------------

const gabe = fixturePlayer("gabe", "Gabe");
const amy = fixturePlayer("amy", "Amy");
const beau = fixturePlayer("beau", "Beau");
const haiku = fixturePlayer("haiku", "Claude Haiku", {
  type: "AI",
  modelId: "anthropic/claude-haiku-5.5",
});
const cleo = fixturePlayer("cleo", "Cleo");
const devraj = fixturePlayer("devraj", "Devraj Venkataraman");
const maxi = fixturePlayer("maxi", "Maximiliana Okonkwoo");
const gemini = fixturePlayer("gemini", "Gemini Flash", {
  type: "AI",
  modelId: "google/gemini-3.5-flash-lite",
});
const BASE = [gabe, amy, beau, haiku];
const EIGHT = [gabe, amy, beau, haiku, cleo, devraj, maxi, gemini];
const ids = (players: RoomPlayer[]) => players.map((player) => player.id);

function scored(players: RoomPlayer[], scores: Record<string, number>) {
  return players.map((player) => ({ ...player, score: scores[player.name] ?? 0 }));
}

// ---- Persona ---------------------------------------------------------------

/** A stand-in portrait (fixture data only): a soft gradient bust. */
const PORTRAIT_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7a8c4"/><stop offset="1" stop-color="#8f6bd8"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="120" cy="98" r="46" fill="#2d1b33" opacity="0.85"/><path d="M40 240c8-56 44-84 80-84s72 28 80 84z" fill="#2d1b33" opacity="0.85"/><circle cx="120" cy="70" r="30" fill="#fde2d0" opacity="0.6"/></svg>`,
  );

const NORA: Profile = {
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

/** Nora with every answer at the 100-character cap. */
const NORA_LONG: Profile = {
  ...NORA,
  prompts: [
    {
      id: "p-sunday",
      prompt: "Typical Sunday",
      answer:
        "Farmer's market at dawn, a reckless amount of anchovies, then tarot on the stoop till the light goes",
    },
    {
      id: "p-unhinged",
      prompt: "The most unhinged thing about me",
      answer:
        "I once live-blogged a neighborhood coyote for nine days. I still think he reads it. He does, I'd bet",
    },
    {
      id: "p-along",
      prompt: "We'll get along if",
      answer:
        "You can commit to a bit longer than a situationship, and don't flinch when I bring my own hot sauce.",
    },
  ],
};

function persona(overrides: Partial<Mode["persona"]> = {}): Mode["persona"] {
  return {
    seekerIdentity: "MAN",
    personaIdentity: "WOMAN",
    modelId: "openai/gpt-6.1-sol",
    profile: NORA,
    portraitUrl: null,
    ...overrides,
  };
}

// ---- Messages --------------------------------------------------------------

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
    authorName: null,
    openerPromptText: null,
    mood: null,
    outcome: null,
    level: null,
    ...extra,
  };
}

function players(key: string, turn: number, text: string, author: RoomPlayer, opener?: string) {
  return message(key, turn, "PLAYERS", text, {
    authorName: author.name,
    openerPromptText: opener ?? null,
  });
}

function nora(
  key: string,
  turn: number,
  text: string,
  mood: number,
  level: Message["level"],
  outcome: Message["outcome"],
) {
  return message(key, turn, "PERSONA", text, { mood, level, outcome });
}

const OPENER = players(
  "r1-players",
  1,
  "Reckless anchovies? Finally, a woman who respects the tin.",
  amy,
  "Typical Sunday",
);
const REPLY_1 = nora(
  "r1-nora",
  1,
  "the tin respects ME. ok tell me your farmer's market crime of choice",
  60,
  "good",
  "CONTINUE",
);
const REPLY_1_CRINGE = nora(
  "r1-nora",
  1,
  "anchovies as a personality. bold. ok, farmer's market crime, go",
  40,
  "cringe",
  "CONTINUE",
);
const REPLY_1_LONG = nora(
  "r1-nora",
  1,
  "the tin respects ME. ok, tell me your farmer's market crime of choice, and make it a good one, because I have heard them all and I am not easily shocked. go on.",
  60,
  "good",
  "CONTINUE",
);
const SENT_2 = players(
  "r2-players",
  2,
  "I sample every hot sauce and buy none. They know my face. They fear my face.",
  beau,
);
const UNMATCH_2 = nora(
  "r2-nora",
  2,
  "you're the reason they put up the one-sample-per-customer sign. last chance.",
  20,
  "dealbreaker",
  "UNMATCHED",
);
const D2_PLAYERS = players(
  "d2-players",
  2,
  "I fake-haggle at the free sample table. Last week they gave me two.",
  gabe,
);
const D2_NORA = nora("d2-nora", 2, "...that's weirdly hot. keep talking", 70, "good", "CONTINUE");
const D3_PLAYERS = players(
  "d3-players",
  3,
  "Sunday. I bring anchovies, you bring tarot, we let the coyote decide.",
  amy,
);
const D3_NORA = nora(
  "d3-nora",
  3,
  "the coyote says yes. so do i. sunday, 10am, don't be late",
  80,
  "good",
  "DATE_SEALED",
);
const U3_PLAYERS = players(
  "u3-players",
  3,
  "Fair. But if the hot sauce guy flakes, I make an emotional support butter board.",
  gabe,
);
const U3_NORA = nora(
  "u3-nora",
  3,
  "i'd rather date the butter board. goodbye forever",
  10,
  "cringe",
  "UNMATCHED",
);
const SAVED_3 = nora(
  "u3-nora",
  3,
  "fine. ONE coffee. you're buying, and the coyote isn't invited",
  80,
  "good",
  "DATE_SEALED",
);

const FINAL_DATE_MESSAGES: Message[] = [OPENER, REPLY_1, D2_PLAYERS, D2_NORA, D3_PLAYERS, D3_NORA];
const UNMATCH_MESSAGES: Message[] = [OPENER, REPLY_1_CRINGE, SENT_2, UNMATCH_2];
const FINAL_UNMATCHED_MESSAGES: Message[] = [...UNMATCH_MESSAGES, U3_PLAYERS, U3_NORA];
/** The three-round "no second date" path: Amy, Gabe, then Beau. */
const NO_DATE_MESSAGES: Message[] = [
  OPENER,
  REPLY_1,
  D2_PLAYERS,
  nora("n2-nora", 2, "lol ok that's a little cute", 65, "cute", "CONTINUE"),
  { ...SENT_2, id: fixtureId("matchSlopMessages", "n3-players"), turn: 3 },
  nora(
    "n3-nora",
    3,
    "this was fun, but you're more of a group-chat guy. good luck out there",
    65,
    "meh",
    "UNMATCHED",
  ),
];
const LAST_WRITING_MESSAGES: Message[] = [
  OPENER,
  REPLY_1,
  D2_PLAYERS,
  nora("l2-nora", 2, "lol ok that's a little cute", 65, "cute", "CONTINUE"),
  { ...SENT_2, id: fixtureId("matchSlopMessages", "l3-players"), turn: 3 },
  nora(
    "l3-nora",
    3,
    "the hot sauce guy has a restraining order vibe. noted.",
    65,
    "meh",
    "CONTINUE",
  ),
  players("l4-players", 4, "I'm emotionally available and lightly marinated.", haiku),
  {
    ...REPLY_1_LONG,
    id: fixtureId("matchSlopMessages", "l4-nora"),
    turn: 4,
    mood: 70,
    level: "cute",
  },
];

// ---- Signals ---------------------------------------------------------------

/** Points follow the live rule, so fixtures never drift from `moodPoints`. */
function signal(
  level: Signal["level"],
  delta: number,
  thought: string | null,
  source: Signal["source"],
  author: RoomPlayer,
): Signal {
  const points = level ? moodPoints(delta) : 0;
  return { level, delta, points, thought, source, authorId: author.id };
}

const SIGNAL_GOOD = signal("good", 10, "ok the tin thing got me", "model", amy);
const SIGNAL_UNMATCH = signal(
  "dealbreaker",
  -20,
  "the sign has my handwriting on it",
  "model",
  beau,
);

// ---- Rounds ----------------------------------------------------------------

type AnswerSeed = [key: string, author: RoomPlayer, text: string, opener?: string];

const OPENERS: AnswerSeed[] = [
  [
    "gabe-1",
    gabe,
    "I also live-blog wildlife. Mostly my roommate. He's nocturnal.",
    "The most unhinged thing about me",
  ],
  ["amy-1", amy, OPENER.text, "Typical Sunday"],
  [
    "beau-1",
    beau,
    "Is that a tarot deck in your bio or are you just happy to see me",
    "We'll get along if",
  ],
  ["haiku-1", haiku, "I'm emotionally available and lightly marinated.", "Typical Sunday"],
];

const FOLLOW_UPS: AnswerSeed[] = [
  ["gabe-2", gabe, D2_PLAYERS.text],
  ["amy-2", amy, "I tell the honey guy his bees seem stressed. Every week. He believes me now."],
  ["beau-2", beau, SENT_2.text],
];

const COMEBACKS: AnswerSeed[] = [
  ["gabe-3", gabe, U3_PLAYERS.text],
  ["amy-3", amy, "Counterpoint: I'm banned from that market too. We could be banned together."],
  ["haiku-3", haiku, "Then let me be the jam. Two carbs this compatible don't just happen."],
];

/** Eight lines at the 80-character cap, one per seat in roster order. */
const EIGHT_LINES: AnswerSeed[] = [
  "I return the free samples, used, with a note on what they could do better. Kind.",
  "I ask the egg guy if the eggs are free range, then I set one free. Every Sunday.",
  "I haggle at the free sample table. Not for a discount. For respect. It works ok.",
  "I tell the honey guy his bees seem stressed. Every week. He believes me now. Ok.",
  "I bring my own scale to the peach stand and gasp loudly at every reading. Every.",
  "I named a pumpkin, put it on a leash, and walked it past the pumpkin stand twice",
  "I sample every hot sauce and buy none. They know my face. They fear my face. Yep",
  "I pay for one kale bunch in nickels, slowly, holding eye contact the whole time.",
].map((text, index) => [
  `${EIGHT[index]!.name.split(" ")[0]!.toLowerCase()}-8`,
  EIGHT[index]!,
  text,
]);

/** Votes per answer key, once revealed: [weighted, raw, points, voters]. */
type Tally = Record<string, [number, number, number, RoomPlayer[]]>;

const ROUND_1_TALLY: Tally = {
  "amy-1": [5, 3, 175, [gabe, beau, haiku]],
  "gabe-1": [2, 1, 50, [amy]],
  "beau-1": [0, 0, 0, []],
  "haiku-1": [0, 0, 0, []],
};
const ROUND_2_TALLY: Tally = {
  "beau-2": [3, 2, 125, [amy, haiku]],
  "gabe-2": [2, 1, 50, [beau]],
  "amy-2": [1, 1, 25, [gemini]],
};
const SENT_8_TALLY: Tally = {
  "devraj-8": [7, 4, 225, [gabe, amy, haiku, maxi]],
  "maximiliana-8": [4, 2, 100, [beau, devraj]],
  "amy-8": [2, 1, 50, [cleo]],
  "cleo-8": [1, 1, 25, [gemini]],
};

function round(
  number: number,
  promptText: string,
  seeds: AnswerSeed[],
  options: {
    viewer?: RoomPlayer;
    writers?: RoomPlayer[];
    answered?: RoomPlayer[];
    voted?: RoomPlayer[];
    /** Names every author with their votes, as once the message is sent. */
    reveal?: Tally;
    showAnswers?: boolean;
    myVote?: string;
    winner?: string;
  } = {},
): Round {
  const viewer = options.viewer ?? gabe;
  const writers = options.writers ?? seeds.map(([, author]) => author);
  const answered = ids(options.answered ?? seeds.map(([, author]) => author));
  const mine = answered.includes(viewer.id)
    ? seeds.find(([, author]) => author.id === viewer.id)
    : undefined;
  return {
    number,
    promptId: fixtureId("prompts", `r${number}`),
    promptText,
    writerIds: ids(writers),
    answeredPlayerIds: answered,
    votedPlayerIds: ids(options.voted ?? []),
    myResponseId: mine ? fixtureId("responses", mine[0]) : null,
    myVoteResponseId: options.myVote ? fixtureId("responses", options.myVote) : null,
    answers:
      options.showAnswers === false
        ? []
        : seeds.map(([key, author, text, opener]) => {
            const [weightedVotes, rawVotes, pointsEarned, voters] = options.reveal?.[key] ?? [
              0,
              0,
              0,
              [],
            ];
            return {
              id: fixtureId("responses", key),
              text,
              openerPromptText: opener ?? null,
              playerId: options.reveal || author.id === viewer.id ? author.id : null,
              weightedVotes,
              rawVotes,
              pointsEarned,
              voterIds: options.reveal ? ids(voters) : [],
            };
          }),
    forfeitedPlayerIds: [],
    winnerResponseId: options.winner ? fixtureId("responses", options.winner) : null,
  };
}

function mode(overrides: Partial<Mode> = {}): Mode {
  return {
    kind: "MATCHSLOP",
    persona: persona(),
    mood: 50,
    outcome: "IN_PROGRESS",
    verdict: null,
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
    // SENT and PROFILE wait on the AI behind a hidden watchdog, as the server sends them.
    awaitingAi: phase === "SENT" || phase === "PROFILE",
    ...extra,
  };
}

function finished(roundNumber: number, totalRounds = 5) {
  return {
    gameType: "MATCHSLOP" as const,
    status: "FINISHED" as const,
    phase: "FINAL",
    round: roundNumber,
    totalRounds,
  };
}

const OPENER_PROMPT =
  "Pick one of Nora's profile prompts and write the opener most likely to charm Nora.";

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

const VERDICTS: Record<string, string> = {
  Amy: "Opened with a tin of fish and somehow made it work. Respect, honestly.",
  Gabe: "Haggled for respect at a free sample table. I would follow you to war.",
  Beau: "Quiet all game, then voted like a sommelier. Your taste is suspicious.",
  "Claude Haiku": "Lightly marinated, heavily forgettable. Polite in a way that scared me",
  Cleo: "Asked about my photo before it existed. Bold. Wrong, but bold. Respect",
  "Devraj Venkataraman": "Walked a pumpkin on a leash. Three red flags and I want all of them!!!",
  "Maximiliana Okonkwoo": "Brought nickels to a kale fight. I have never felt so seen or so tired",
  "Gemini Flash": "Every line was a hostage note from a man who has met bees. Keep going.",
};
const verdicts = (roster: RoomPlayer[]) =>
  roster.map((player) => ({ playerName: player.name, verdict: VERDICTS[player.name]! }));

const PARTING_LONG =
  "honestly? the coyote closed it. sunday, 10am. if anyone brings a butter board, I am leaving before the coffee shows up!";
const PARTING_SHORT = "Sunday, 10am. If anyone brings a butter board I'm leaving.";
const PARTING_NO_DATE = "no hard feelings. ok, some. the coyote would have liked you though.";

const EIGHT_SCORES = {
  "Devraj Venkataraman": 600,
  Amy: 425,
  "Maximiliana Okonkwoo": 425,
  Gabe: 300,
  Cleo: 175,
  Beau: 50,
  "Claude Haiku": 0,
  "Gemini Flash": -50,
};

// ---- Fixtures, in game order ------------------------------------------------

export const matchslopFixtures: Fixture[] = [
  {
    id: "matchslop-lobby",
    label: "MatchSlop · Lobby with the persona ready",
    view: fixtureView(BASE, { gameType: "MATCHSLOP", totalRounds: 5 }, mode()),
  },
  {
    id: "matchslop-lobby-pending",
    label: "MatchSlop · Lobby while the persona is written",
    view: fixtureView(
      BASE,
      { gameType: "MATCHSLOP", totalRounds: 5 },
      mode({ persona: persona({ profile: null }) }),
    ),
  },
  {
    id: "matchslop-profile",
    label: "MatchSlop · Finding a match",
    view: fixtureView(
      BASE,
      playing("PROFILE", 0, { phaseDeadline: null }),
      mode({ persona: persona({ profile: null }) }),
    ),
  },
  {
    id: "matchslop-opener-writing",
    label: "MatchSlop · The Meet, then openers (R plays the Meet)",
    view: fixtureView(
      BASE,
      playing("WRITING", 1),
      mode({
        round: round(1, OPENER_PROMPT, OPENERS, { answered: [amy, haiku], showAnswers: false }),
      }),
    ),
  },
  {
    id: "matchslop-opener-writing-photo",
    label: "MatchSlop · Openers, 8 players, long answers and a photo",
    view: fixtureView(
      EIGHT,
      playing("WRITING", 1),
      mode({
        persona: persona({ profile: NORA_LONG, portraitUrl: PORTRAIT_URL }),
        round: round(1, OPENER_PROMPT, [], {
          writers: EIGHT,
          answered: [amy, haiku, devraj],
          showAnswers: false,
        }),
      }),
    ),
  },
  {
    id: "matchslop-opener-voting",
    label: "MatchSlop · Round 1 ballot",
    view: fixtureView(
      BASE,
      playing("VOTING", 1, { phaseDeadline: FIXTURE_NOW + 20_000 }),
      mode({ round: round(1, OPENER_PROMPT, OPENERS, { voted: [amy] }) }),
    ),
  },
  {
    id: "matchslop-sent",
    label: "MatchSlop · The send: Amy's opener goes",
    view: fixtureView(
      scored(BASE, { Amy: 175, Gabe: 50 }),
      playing("SENT", 1, { phaseDeadline: null }),
      mode({
        messages: [OPENER],
        round: round(1, OPENER_PROMPT, OPENERS, {
          voted: [amy, gabe, haiku, beau],
          myVote: "amy-1",
          reveal: ROUND_1_TALLY,
          winner: "amy-1",
        }),
      }),
    ),
  },
  {
    id: "matchslop-sent-author",
    label: "MatchSlop · The send, seen by its author",
    view: fixtureView(
      scored(BASE, { Amy: 175, Gabe: 50 }),
      playing("SENT", 1, { phaseDeadline: null }),
      mode({
        messages: [OPENER],
        round: round(1, OPENER_PROMPT, OPENERS, {
          viewer: amy,
          voted: [amy, gabe, haiku, beau],
          myVote: "gabe-1",
          reveal: ROUND_1_TALLY,
          winner: "amy-1",
        }),
      }),
      { viewer: amy },
    ),
  },
  {
    id: "matchslop-sent-single",
    label: "MatchSlop · The only text goes (no vote)",
    view: fixtureView(
      scored(BASE, { Amy: 50 }),
      playing("SENT", 1, { phaseDeadline: null }),
      mode({
        messages: [OPENER],
        round: round(1, OPENER_PROMPT, [OPENERS[1]!], {
          viewer: amy,
          writers: BASE,
          reveal: { "amy-1": [0, 0, 50, []] },
          winner: "amy-1",
        }),
      }),
      { viewer: amy },
    ),
  },
  {
    id: "matchslop-reply",
    label: "MatchSlop · Nora replies: Good",
    view: fixtureView(
      scored(BASE, { Amy: 225, Gabe: 50 }),
      playing("REPLY", 1),
      mode({
        mood: 60,
        signal: SIGNAL_GOOD,
        messages: [OPENER, REPLY_1],
        round: round(1, OPENER_PROMPT, OPENERS, {
          voted: [amy, gabe, haiku, beau],
          myVote: "amy-1",
          reveal: ROUND_1_TALLY,
          winner: "amy-1",
        }),
      }),
    ),
  },
  {
    id: "matchslop-reply-fallback",
    label: "MatchSlop · A stand-in reply scores nothing",
    view: fixtureView(
      scored(BASE, { Amy: 225, Gabe: 100 }),
      playing("REPLY", 2),
      mode({
        mood: 60,
        signal: signal(null, 0, null, "fallback", gabe),
        messages: [
          OPENER,
          REPLY_1,
          D2_PLAYERS,
          nora("f2-nora", 2, "sorry, got distracted. say that again?", 60, null, "CONTINUE"),
        ],
        round: round(2, REPLY_1.text, FOLLOW_UPS, {
          voted: [amy, beau, haiku],
          myVote: "amy-2",
          reveal: { "gabe-2": [3, 2, 125, [amy, haiku]], "amy-2": [2, 1, 50, [beau]] },
          winner: "gabe-2",
        }),
      }),
    ),
  },
  {
    id: "matchslop-follow-up-writing",
    label: "MatchSlop · Round 2 writing",
    view: fixtureView(
      scored(BASE, { Amy: 225, Gabe: 50 }),
      playing("WRITING", 2),
      mode({
        mood: 60,
        signal: SIGNAL_GOOD,
        messages: [OPENER, REPLY_1],
        round: round(2, REPLY_1.text, [], {
          writers: BASE,
          answered: [beau],
          showAnswers: false,
        }),
      }),
    ),
  },
  {
    id: "matchslop-voting-8",
    label: "MatchSlop · Ballot of eight 80-character texts (overflow gate)",
    view: fixtureView(
      scored(EIGHT, { Amy: 225, Gabe: 50 }),
      playing("VOTING", 2, { phaseDeadline: FIXTURE_NOW + 20_000 }),
      mode({
        mood: 60,
        signal: SIGNAL_GOOD,
        messages: [OPENER, REPLY_1_LONG],
        round: round(2, REPLY_1_LONG.text, EIGHT_LINES, { voted: [amy, haiku, cleo] }),
      }),
    ),
  },
  {
    id: "matchslop-sent-8",
    label: "MatchSlop · The send with eight texts",
    view: fixtureView(
      scored(EIGHT, {
        Amy: 275,
        Gabe: 50,
        "Devraj Venkataraman": 225,
        "Maximiliana Okonkwoo": 100,
        Cleo: 25,
      }),
      playing("SENT", 2, { phaseDeadline: null }),
      mode({
        mood: 60,
        signal: SIGNAL_GOOD,
        messages: [OPENER, REPLY_1_LONG, players("s8-players", 2, EIGHT_LINES[5]![2], devraj)],
        round: round(2, REPLY_1_LONG.text, EIGHT_LINES, {
          voted: [gabe, amy, haiku, maxi, beau, devraj, cleo, gemini],
          myVote: "devraj-8",
          reveal: SENT_8_TALLY,
          winner: "devraj-8",
        }),
      }),
    ),
  },
  {
    id: "matchslop-unmatched-reply",
    label: "MatchSlop · Dealbreaker: the last shot",
    view: fixtureView(
      scored(BASE, { Amy: 175, Gabe: 100, Beau: 25 }),
      playing("REPLY", 2),
      mode({
        mood: 20,
        signal: SIGNAL_UNMATCH,
        messages: UNMATCH_MESSAGES,
        round: round(2, REPLY_1_CRINGE.text, FOLLOW_UPS, {
          voted: [amy, haiku, gemini, beau],
          myVote: "beau-2",
          reveal: ROUND_2_TALLY,
          winner: "beau-2",
        }),
      }),
    ),
  },
  {
    id: "matchslop-comeback-writing",
    label: "MatchSlop · One last shot: writing",
    view: fixtureView(
      scored(BASE, { Amy: 175, Gabe: 100, Beau: 25 }),
      playing("WRITING", 3),
      mode({
        mood: 20,
        comeback: true,
        signal: SIGNAL_UNMATCH,
        messages: UNMATCH_MESSAGES,
        round: round(3, UNMATCH_2.text, [], {
          writers: BASE,
          answered: [haiku],
          showAnswers: false,
        }),
      }),
    ),
  },
  {
    id: "matchslop-comeback-voting",
    label: "MatchSlop · One last shot: the vote",
    view: fixtureView(
      scored(BASE, { Amy: 175, Gabe: 100, Beau: 25 }),
      playing("VOTING", 3, { phaseDeadline: FIXTURE_NOW + 12_000 }),
      mode({
        mood: 20,
        comeback: true,
        signal: SIGNAL_UNMATCH,
        messages: UNMATCH_MESSAGES,
        round: round(3, UNMATCH_2.text, COMEBACKS, { voted: [beau, haiku] }),
      }),
    ),
  },
  {
    id: "matchslop-comeback-saved",
    label: "MatchSlop · One last shot lands: it's a date",
    view: fixtureView(
      scored(BASE, { Amy: 200, Gabe: 225, Beau: 25 }),
      playing("REPLY", 3),
      mode({
        mood: 80,
        outcome: "DATE_SEALED",
        verdict: "DATE",
        comeback: true,
        signal: signal("good", 10, "i hate that this worked", "model", gabe),
        messages: [...UNMATCH_MESSAGES, U3_PLAYERS, SAVED_3],
        round: round(3, UNMATCH_2.text, COMEBACKS, {
          voted: [amy, beau, haiku],
          myVote: "amy-3",
          reveal: {
            "gabe-3": [3, 2, 125, [amy, haiku]],
            "amy-3": [2, 1, 50, [beau]],
          },
          winner: "gabe-3",
        }),
      }),
    ),
  },
  {
    id: "matchslop-last-writing",
    label: "MatchSlop · Last message: writing",
    view: fixtureView(
      scored(BASE, { Amy: 300, Gabe: 150, Beau: 75, "Claude Haiku": 75 }),
      playing("WRITING", 5),
      mode({
        mood: 70,
        signal: signal("cute", 5, "lightly marinated is a lot", "model", haiku),
        messages: LAST_WRITING_MESSAGES,
        round: round(5, REPLY_1_LONG.text, [], {
          writers: BASE,
          answered: [amy, beau],
          showAnswers: false,
        }),
      }),
    ),
  },
  {
    id: "matchslop-reply-date",
    label: "MatchSlop · It's a date",
    view: fixtureView(
      scored(BASE, { Amy: 600, Gabe: 375, Beau: 150, "Claude Haiku": 50 }),
      playing("REPLY", 3),
      mode({
        mood: 80,
        outcome: "DATE_SEALED",
        verdict: "DATE",
        signal: signal("good", 10, "already picking an outfit", "model", amy),
        messages: FINAL_DATE_MESSAGES,
        round: round(
          3,
          D2_NORA.text,
          [
            ["amy-3", amy, D3_PLAYERS.text],
            ["beau-3", beau, "Do you like jazz? Lie to me."],
          ],
          {
            voted: [gabe, beau, haiku],
            myVote: "amy-3",
            reveal: { "amy-3": [5, 3, 175, [gabe, beau, haiku]], "beau-3": [0, 0, 0, []] },
            winner: "amy-3",
          },
        ),
      }),
    ),
  },
  {
    id: "matchslop-reply-no-date",
    label: "MatchSlop · The last message falls short",
    view: fixtureView(
      scored(BASE, { Amy: 225, Gabe: 175, Beau: 125 }),
      playing("REPLY", 3, { totalRounds: 3 }),
      mode({
        mood: 65,
        outcome: "UNMATCHED",
        verdict: "NO_SECOND_DATE",
        signal: signal("meh", 0, "sweet. not enough.", "model", beau),
        messages: NO_DATE_MESSAGES,
        round: round(
          3,
          "lol ok that's a little cute",
          [
            ["beau-3", beau, SENT_2.text],
            ["amy-3", amy, "I'd like to apologize in advance for my entire personality."],
          ],
          {
            voted: [amy, gabe, haiku],
            myVote: "beau-3",
            reveal: { "beau-3": [5, 3, 175, [amy, gabe, haiku]], "amy-3": [0, 0, 0, []] },
            winner: "beau-3",
          },
        ),
      }),
    ),
  },
  {
    id: "matchslop-final-date",
    label: "MatchSlop · Final: it's a date",
    view: fixtureView(
      scored(BASE, { Amy: 600, Gabe: 375, Beau: 150, "Claude Haiku": 50 }),
      finished(3),
      mode({
        mood: 80,
        outcome: "DATE_SEALED",
        verdict: "DATE",
        messages: FINAL_DATE_MESSAGES,
        postMortem: { pending: false, value: { verdicts: verdicts(BASE), parting: PARTING_SHORT } },
      }),
      { usage: USAGE },
    ),
  },
  {
    id: "matchslop-final-unmatched",
    label: "MatchSlop · Final: unmatched, her take still typing",
    view: fixtureView(
      scored(BASE, { Amy: 175, Gabe: 150, Beau: 100 }),
      finished(3),
      mode({
        mood: 10,
        outcome: "UNMATCHED",
        verdict: "UNMATCHED",
        messages: FINAL_UNMATCHED_MESSAGES,
        postMortem: { pending: true, value: null },
      }),
      { viewer: beau, usage: USAGE },
    ),
  },
  {
    id: "matchslop-final-8",
    label: "MatchSlop · Final with eight players",
    view: fixtureView(
      scored(EIGHT, EIGHT_SCORES),
      finished(3),
      mode({
        persona: persona({ portraitUrl: PORTRAIT_URL }),
        mood: 80,
        outcome: "DATE_SEALED",
        verdict: "DATE",
        messages: FINAL_DATE_MESSAGES,
        postMortem: { pending: false, value: { verdicts: verdicts(EIGHT), parting: PARTING_LONG } },
      }),
      { usage: USAGE },
    ),
  },
  {
    id: "matchslop-final-recap",
    label: "MatchSlop · Recap for a spectator",
    view: fixtureView(
      scored(BASE, { Amy: 225, Gabe: 175, Beau: 125 }),
      finished(3, 3),
      mode({
        mood: 65,
        outcome: "UNMATCHED",
        verdict: "NO_SECOND_DATE",
        messages: NO_DATE_MESSAGES,
        postMortem: {
          pending: false,
          value: { verdicts: verdicts(BASE), parting: PARTING_NO_DATE },
        },
      }),
      { viewer: null, usage: USAGE },
    ),
  },
];
