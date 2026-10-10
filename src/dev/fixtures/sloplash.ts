import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import { orderMatchups, scoreMatchup } from "@/games/sloplash/scoring";
import {
  promptKey,
  reactionId,
  sloplashPrompt,
  type AnswerSpec,
  type VoteSpec,
} from "@/games/sloplash/test-kit";
import { FIXTURE_NOW, fixturePlayer, fixtureView, type Fixture } from "./base";

type Mode = ModeView<"SLOPLASH">;
type Round = NonNullable<Mode["round"]>;
type Prompt = Round["prompts"][number];

// --- Players ---

const ong = fixturePlayer("ong", "Ong");
const amy = fixturePlayer("amy", "Amy");
const beau = fixturePlayer("beau", "Beau");
const slopbot = fixturePlayer("slopbot", "GPT Slopbot", {
  type: "AI",
  modelId: "openai/gpt-6.1-sol",
});
const hank = fixturePlayer("hank", "Haiku Hank", {
  type: "AI",
  modelId: "anthropic/claude-haiku-5.5",
});
const bart = fixturePlayer("bart", "Bartholomew Fizzwick");
const priya = fixturePlayer("priya", "Priyanka Ramaswamy");
const gemini = fixturePlayer("gemini", "Gemini", {
  type: "AI",
  modelId: "google/gemini-3.5-flash-lite",
});

const FIVE = [ong, amy, beau, slopbot, hank];
const EIGHT = [ong, amy, beau, slopbot, hank, bart, priya, gemini];

// --- Five-player game: two rounds ---

type Matchup = [key: string, text: string, answers: AnswerSpec[], votes: VoteSpec[]];

/**
 * Round one, in play order once ordered: a walkover (amy ran out of time),
 * a TIE, a SLOPPED sweep, a matchup nobody voted on, and a plain AI win.
 */
const ROUND_ONE: Matchup[] = [
  [
    "r1-dentist",
    "The worst thing to hear from your dentist:",
    [{ by: "ong", text: "We drill after dark, baby." }, { by: "amy" }],
    [],
  ],
  [
    "r1-meditation",
    "A terrible name for a meditation app:",
    [
      { by: "amy", text: "Panic+ Premium", reactions: [["hundred", "ong"]] },
      { by: "beau", text: "Breathe Maybe" },
    ],
    [
      ["ong", 0],
      ["slopbot", 1],
      ["hank", null],
    ],
  ],
  [
    "r1-gym",
    "The least inspiring gym motivational quote:",
    [
      { by: "beau", text: "Just stand near the weights and look busy." },
      {
        by: "slopbot",
        text: "Pain is temporary. Membership fees are forever.",
        reactions: [
          ["fire", "ong"],
          ["skull", "amy"],
          ["skull", "hank"],
        ],
      },
    ],
    [
      ["hank", 1],
      ["amy", 1],
      ["ong", 1],
    ],
  ],
  [
    "r1-sparkling",
    "What not to say when the waiter asks “sparkling or still?”",
    [
      { by: "slopbot", text: "Whichever one screams less when poured." },
      { by: "hank", text: "Still. Like my career." },
    ],
    [
      ["ong", null],
      ["amy", null],
      ["beau", null, true],
    ],
  ],
  [
    "r1-lacroix",
    "A rejected flavor of LaCroix:",
    [
      { by: "hank", text: "Pamplemousse Regret", reactions: [["laugh", "amy"]] },
      { by: "ong", text: "Faint Memory of Lime" },
    ],
    [
      ["amy", 0],
      ["beau", 1],
      ["slopbot", 0],
    ],
  ],
];

const ROUND_TWO: Matchup[] = [
  [
    "r2-hotel",
    "The weirdest item on a luxury hotel room service menu:",
    [
      { by: "ong", text: "Twelve artisanal ice cubes, chef's choice." },
      { by: "amy", text: "A single grape, emotionally available.", reactions: [["clap", "beau"]] },
    ],
    [
      ["beau", 1],
      ["slopbot", 1],
      ["hank", 0],
    ],
  ],
  [
    "r2-fridge",
    "Your smart fridge's most passive-aggressive notification:",
    [
      { by: "amy", text: "Reminder: the yogurt has seen things." },
      {
        by: "beau",
        text: "Your fridge has posted a subtweet about you.",
        reactions: [["fire", "ong"]],
      },
    ],
    [
      ["ong", 1],
      ["slopbot", 1],
      ["hank", 1],
    ],
  ],
  [
    "r2-rideshare",
    "The worst thing to hear from your rideshare driver:",
    [{ by: "beau" }, { by: "slopbot", text: "Good news, I watched one drifting video." }],
    [],
  ],
  [
    "r2-interview",
    "Something you should never say in a job interview:",
    [
      { by: "slopbot", text: "My greatest weakness is that I am three raccoons in a trench coat." },
      { by: "hank", text: "I'm mostly here for the free pens." },
    ],
    [
      ["ong", 0],
      ["amy", 0],
      ["beau", 1],
    ],
  ],
  [
    "r2-funeral",
    "A bad slogan for a funeral home:",
    [
      { by: "hank", text: "We'll take it from here. Literally." },
      {
        by: "ong",
        text: "Dying to meet you!",
        reactions: [
          ["clown", "slopbot"],
          ["laugh", "beau"],
        ],
      },
    ],
    [
      ["amy", 1],
      ["beau", 1],
      ["slopbot", 0],
    ],
  ],
];

// --- Building blocks ---

/** Sets each prompt's play order the way the server does: walkovers first, voids dropped. */
function ordered(prompts: Prompt[]): Prompt[] {
  const order = new Map(
    orderMatchups(
      prompts.map((prompt) => ({
        item: prompt.id,
        present: prompt.answers.filter((answer) => !answer.forfeited).length,
      })),
    ).map(({ item }, index) => [item, index]),
  );
  return prompts.map((prompt) => ({ ...prompt, order: order.get(prompt.id) ?? null }));
}

function build(matchups: Matchup[]): Prompt[] {
  return ordered(
    matchups.map(([key, text, answers, votes]) => sloplashPrompt(key, text, answers, votes)),
  );
}

type RoundData = { number: number; prompts: Prompt[] };

/**
 * Scores a round's matchups the way the server does, in play order, up to
 * (not including) `until`. Returns the round with those points filled in and
 * the players' scores after them.
 */
function settle(round: RoundData, before: RoomPlayer[], until = Number.POSITIVE_INFINITY) {
  const earned = new Map<string, number>();
  const prompts = round.prompts.map((prompt) => {
    if (prompt.order === null || prompt.order >= until) return prompt;
    const { points } = scoreMatchup(
      prompt.answers,
      prompt.votes.map((vote) => vote.responseId),
      round.number,
    );
    return {
      ...prompt,
      answers: prompt.answers.map((answer) => {
        const value = points[answer.id] ?? 0;
        if (answer.playerId) earned.set(answer.playerId, (earned.get(answer.playerId) ?? 0) + value);
        return { ...answer, pointsEarned: value };
      }),
    };
  });
  return {
    round: { number: round.number, prompts },
    players: before.map((player) => ({ ...player, score: player.score + (earned.get(player.id) ?? 0) })),
  };
}

/** A matchup that has not come up yet: the view sends only its kind, order and authors. */
function hidden(prompt: Prompt): Prompt {
  return { ...prompt, text: "", revealed: false, answers: [], votes: [], liveReactions: [] };
}

/**
 * The matchup on screen while it is voted on, as `viewer` sees it: only
 * their own answer and their own pick show through, reactions are hidden,
 * and only the vote rows of `voters` (in that order) are in. `live` is the
 * anonymous human reactions sent so far ([emoji, by]); by default, those
 * already on the answers from players who have voted.
 */
function onScreen(
  prompt: Prompt,
  viewer: RoomPlayer | null,
  voters: RoomPlayer[],
  live?: [emoji: string, by: RoomPlayer][],
): Prompt {
  const key = promptKey(prompt);
  const humans = new Set(voters.filter((voter) => voter.type === "HUMAN").map((voter) => voter.id));
  const sent =
    live?.map(([emoji, by], n) => ({ id: reactionId(key, 9, n), emoji, playerId: by.id })) ??
    prompt.answers.flatMap((answer, index) =>
      answer.reactions
        .filter((reaction) => humans.has(reaction.playerId))
        .map((reaction, n) => ({ id: reactionId(key, index, n), ...reaction })),
    );
  return {
    ...prompt,
    revealed: false,
    answers: prompt.answers.map((answer) => ({
      ...answer,
      playerId: answer.playerId === viewer?.id ? answer.playerId : null,
      pointsEarned: 0,
      reactions: [],
    })),
    votes: voters.flatMap((voter) => {
      const vote = prompt.votes.find((row) => row.voterId === voter.id);
      return vote ? [{ ...vote, responseId: voter.id === viewer?.id ? vote.responseId : null }] : [];
    }),
    liveReactions: sent.map(({ id, emoji, playerId }) => ({
      id,
      emoji,
      mine: playerId === viewer?.id,
    })),
  };
}

/** The view's shape varies by phase; fixtures fill in only what that phase sends. */
function mode(overrides: Partial<Mode>): Mode {
  return {
    kind: "SLOPLASH",
    tagline: null,
    round: null,
    rounds: [],
    writing: null,
    currentPromptId: null,
    matchupCount: 0,
    ...overrides,
  } as Mode;
}

type RoomPatch = Partial<RoomView["room"]>;

const playing = (round: number, totalRounds: number) =>
  ({ gameType: "SLOPLASH", status: "PLAYING", round, totalRounds }) as const;

/** The same view in a "no timers" room: no clock, so the host moves it on. */
function hostClocked(view: RoomView): RoomView {
  return { ...view, room: { ...view.room, timersDisabled: true, phaseDeadline: null } };
}

function withScores(players: RoomPlayer[], scores: Record<string, number>): RoomPlayer[] {
  return players.map((player) => {
    const key = player.id.replace(/^players_/, "");
    return key in scores ? { ...player, score: scores[key]! } : player;
  });
}

// --- Phase builders ---

function writingMode(round: RoundData, viewer: RoomPlayer, submitted: string[], finished: RoomPlayer[]) {
  return mode({
    round: { number: round.number, prompts: [] },
    writing: {
      prompts: round.prompts
        .filter((prompt) => prompt.assigneeIds.includes(viewer.id))
        .map((prompt) => ({
          id: prompt.id,
          text: prompt.text,
          submitted: submitted.includes(promptKey(prompt)),
        })),
      finishedPlayerIds: finished.map((player) => player.id),
    },
  });
}

/**
 * A round at matchup `step`, as `viewer` sees it. Earlier matchups are
 * revealed and on the scoreboard; while voting, the current one is masked
 * with only `voters`' rows in; while revealing it is revealed and scored;
 * later ones are hidden.
 */
function atMatchup(
  round: RoundData,
  before: RoomPlayer[],
  step: number,
  phase: "VOTING" | "REVEAL",
  options: {
    viewer: RoomPlayer | null;
    voters?: RoomPlayer[];
    live?: [string, RoomPlayer][];
    totalRounds?: number;
    room?: RoomPatch;
  },
): RoomView {
  const voting = phase === "VOTING";
  const settled = settle(round, before, voting ? step : step + 1);
  const current = round.prompts.find((prompt) => prompt.order === step)!;
  const walkover = current.kind === "walkover";
  const timing: RoomPatch = voting
    ? { phaseStartedAt: FIXTURE_NOW - 8_000, phaseDeadline: FIXTURE_NOW + 22_000 }
    : walkover
      ? { phaseStartedAt: FIXTURE_NOW - 6_000, phaseDeadline: null, timersDisabled: true }
      : { phaseStartedAt: FIXTURE_NOW - 6_000, phaseDeadline: FIXTURE_NOW + 2_000 };
  return fixtureView(
    settled.players,
    {
      ...playing(round.number, options.totalRounds ?? 2),
      phase,
      step,
      ...timing,
      ...options.room,
    },
    mode({
      round: {
        number: round.number,
        prompts: settled.round.prompts.map((prompt) =>
          prompt.order === null || prompt.order < step
            ? prompt
            : prompt.order === step
              ? voting
                ? onScreen(prompt, options.viewer, options.voters ?? [], options.live)
                : prompt
              : hidden(prompt),
        ),
      },
      currentPromptId: current.id,
      matchupCount: round.prompts.filter((prompt) => prompt.order !== null).length,
    }),
    { viewer: options.viewer },
  );
}

function resultsView(
  round: RoundData,
  before: RoomPlayer[],
  options: { viewer: RoomPlayer | null; totalRounds: number; tagline: Mode["tagline"]; untimed?: boolean },
): RoomView {
  const settled = settle(round, before);
  const view = fixtureView(
    settled.players,
    {
      ...playing(round.number, options.totalRounds),
      phase: "ROUND_RESULTS",
      phaseStartedAt: FIXTURE_NOW - 6_000,
      phaseDeadline: FIXTURE_NOW + 6_000,
    },
    mode({
      round: settled.round,
      matchupCount: round.prompts.filter((prompt) => prompt.order !== null).length,
      tagline: options.tagline,
    }),
    { viewer: options.viewer },
  );
  return options.untimed ? hostClocked(view) : view;
}

function finalView(
  rounds: Round[],
  players: RoomPlayer[],
  options: {
    viewer: RoomPlayer | null;
    tagline: Mode["tagline"];
    usage?: RoomView["usage"];
  },
): RoomView {
  return fixtureView(
    players,
    {
      gameType: "SLOPLASH",
      status: "FINISHED",
      phase: "FINAL",
      round: rounds.length,
      totalRounds: rounds.length,
      phaseStartedAt: FIXTURE_NOW - 30_000,
      phaseDeadline: null,
    },
    mode({ round: rounds.at(-1) ?? null, rounds, tagline: options.tagline }),
    { viewer: options.viewer, usage: options.usage },
  );
}

// --- The five-player game ---

const roundOne: RoundData = { number: 1, prompts: build(ROUND_ONE) };
const roundTwo: RoundData = { number: 2, prompts: build(ROUND_TWO) };
const afterOne = settle(roundOne, FIVE);
const afterTwo = settle(roundTwo, afterOne.players);

/** Round two with the funeral swept 3-0 by Ong instead. */
const roundTwoHuman: RoundData = {
  number: 2,
  prompts: build(
    ROUND_TWO.map((matchup): Matchup =>
      matchup[0] === "r2-funeral"
        ? [
            matchup[0],
            matchup[1],
            matchup[2],
            [
              ["amy", 1],
              ["beau", 1],
              ["slopbot", 1],
            ],
          ]
        : matchup,
    ),
  ),
};
const afterTwoHuman = settle(roundTwoHuman, afterOne.players);

const FINAL_TAGLINE =
  "I came, I generated, I was statistically the funniest. GG, carbon-based lifeforms.";

const USAGE: RoomView["usage"] = {
  inputTokens: 18_420,
  outputTokens: 6_310,
  costUsd: 0.0914,
  byModel: [
    { modelId: "openai/gpt-6.1-sol", inputTokens: 11_208, outputTokens: 3_904, costUsd: 0.0702 },
    {
      modelId: "anthropic/claude-haiku-5.5",
      inputTokens: 7_212,
      outputTokens: 2_406,
      costUsd: 0.0212,
    },
  ],
};

// --- The eight-player game ---

/** Prompt texts and answer pairs reused from the five-player game, one per seat pairing. */
const EIGHT_TEXTS: [key: string, prompt: string, a: string, b: string][] = [
  ["dentist", ROUND_ONE[0]![1], "We drill after dark, baby.", "I've never done this sober."],
  ["meditation", ROUND_ONE[1]![1], "Panic+ Premium", "Breathe Maybe"],
  [
    "gym",
    ROUND_ONE[2]![1],
    "Just stand near the weights and look busy.",
    "Pain is temporary. Membership fees are forever.",
  ],
  ["sparkling", ROUND_ONE[3]![1], "Whichever one screams less when poured.", "Still. Like my career."],
  ["lacroix", ROUND_ONE[4]![1], "Pamplemousse Regret", "Faint Memory of Lime"],
  [
    "hotel",
    ROUND_TWO[0]![1],
    "Twelve artisanal ice cubes, chef's choice.",
    "A single grape, emotionally available.",
  ],
  [
    "fridge",
    ROUND_TWO[1]![1],
    "Reminder: the yogurt has seen things.",
    "Your fridge has posted a subtweet about you.",
  ],
  [
    "interview",
    ROUND_TWO[3]![1],
    "My greatest weakness is that I am three raccoons in a trench coat.",
    "I'm mostly here for the free pens.",
  ],
];

const LONG_PROMPT =
  "The most unhinged crowd work moment: a comedian asked 'What do you do for a living?' and they said ______";
const LONG_BART = "I'm a people person. I just like them best when they've stopped talking for good";
const LONG_PRIYA = "My last three employers are still technically my clients, if you think about it.";
const LONG_TAGLINE =
  "Six rounds, zero mercy. Bartholomew, your jokes have the shelf life of milk. Priyanka, almost funny.";

/** "a–b": the first `a` eligible voters (seat order) pick the first answer, the rest the second. */
type Split = [first: number, second: number];

const EIGHT_RESULTS: Split[] = [
  [4, 2],
  [3, 3],
  [0, 6],
  [2, 4],
  [1, 5],
  [4, 2],
  [0, 6],
  [5, 1],
];
const EIGHT_FINAL: Split[] = [
  [5, 1],
  [0, 6],
  [3, 3],
  [4, 2],
  [2, 4],
  [2, 4],
  [0, 6],
  [1, 5],
];

const pairOf = (seat: number) => [EIGHT[seat]!, EIGHT[(seat + 1) % EIGHT.length]!] as const;

function splitVotes(seat: number, [first]: Split): VoteSpec[] {
  const [a, b] = pairOf(seat);
  return EIGHT.filter((player) => player !== a && player !== b).map((voter, index) => [
    keyOf(voter),
    index < first ? 0 : 1,
  ]);
}

const keyOf = (player: RoomPlayer) => player.id.replace(/^players_/, "");

function eightRound(
  number: number,
  splits: (Split | null)[],
  options: { long?: boolean; votes?: Partial<Record<number, VoteSpec[]>>; reactions?: [string, string][] } = {},
): RoundData {
  return {
    number,
    prompts: ordered(
      EIGHT_TEXTS.map(([key, text, a, b], seat) => {
        const [left, right] = pairOf(seat);
        const long = options.long && seat === 5;
        const votes = options.votes?.[seat] ?? (splits[seat] ? splitVotes(seat, splits[seat]) : []);
        return sloplashPrompt(
          `e${number}-${long ? "long" : key}`,
          long ? LONG_PROMPT : text,
          [
            {
              by: keyOf(left),
              text: long ? LONG_BART : a,
              reactions: long ? options.reactions : undefined,
            },
            { by: keyOf(right), text: long ? LONG_PRIYA : b },
          ],
          votes,
        );
      }),
    ),
  };
}

const eightResults = eightRound(1, EIGHT_RESULTS);
const eightFinal = settle(eightRound(1, EIGHT_FINAL), EIGHT);

/** Round 3 of 3 (×4): the long prompt and two 80-character answers are matchup 6 of 8. */
function longRound(longVotes: VoteSpec[], reactions?: [string, string][]): RoundData {
  return eightRound(3, [...EIGHT_RESULTS.slice(0, 5), null, null, null], {
    long: true,
    votes: { 5: longVotes },
    reactions,
  });
}
const LONG_STEP = 5;

const LONG_FLAWLESS: VoteSpec[] = [
  ["ong", 0],
  ["amy", 0],
  ["beau", 0],
  ["slopbot", 0],
  ["hank", 0],
  ["gemini", 0],
];
const LONG_SPLIT: VoteSpec[] = [
  ["ong", 0],
  ["hank", 1],
  ["amy", 0],
  ["gemini", 1],
  ["beau", 0],
  ["slopbot", 0],
];
const LONG_REACTIONS: [string, string][] = [
  ["laugh", "ong"],
  ["skull", "amy"],
  ["fire", "beau"],
  ["clown", "hank"],
  ["hundred", "gemini"],
];
/** Scores don't matter in the long-matchup fixtures. */
const EIGHT_AT_ZERO = EIGHT;

// --- Fixtures ---

const writingRoom = {
  ...playing(1, 2),
  phase: "WRITING",
  phaseStartedAt: FIXTURE_NOW - 40_000,
  phaseDeadline: FIXTURE_NOW + 50_000,
} satisfies RoomPatch;

export const sloplashFixtures: Fixture[] = [
  {
    id: "sloplash-writing",
    label: "Writing: one answer in, one to go",
    view: fixtureView(FIVE, writingRoom, writingMode(roundOne, ong, ["r1-dentist"], [beau, slopbot, hank])),
  },
  {
    id: "sloplash-writing-done",
    label: "Writing: all my answers in, waiting on others",
    view: fixtureView(
      FIVE,
      { ...writingRoom, phaseStartedAt: FIXTURE_NOW - 75_000, phaseDeadline: FIXTURE_NOW + 15_000 },
      writingMode(roundOne, ong, ["r1-dentist", "r1-lacroix"], [ong, slopbot, hank]),
    ),
  },
  {
    id: "sloplash-writing-round2",
    label: "Writing, round 2 of 2: every vote is worth 200",
    view: fixtureView(
      afterOne.players,
      { ...writingRoom, ...playing(2, 2) },
      writingMode(roundTwo, ong, [], []),
    ),
  },
  {
    id: "sloplash-writing-long",
    label: "Writing, 8 players, no timers (host)",
    view: hostClocked(
      fixtureView(
        EIGHT,
        { ...writingRoom, ...playing(1, 3) },
        writingMode(eightResults, ong, ["e1-dentist", "e1-interview"], [ong, slopbot, gemini]),
      ),
    ),
  },
  {
    id: "sloplash-voting-own",
    label: "Voting: my own matchup is up",
    view: atMatchup(roundOne, FIVE, 1, "VOTING", { viewer: amy, voters: [ong] }),
  },
  {
    id: "sloplash-voting",
    label: "Voting: pick the funnier answer",
    view: atMatchup(roundOne, FIVE, 2, "VOTING", { viewer: ong, voters: [hank] }),
  },
  {
    id: "sloplash-voting-voted",
    label: "Voting: voted, one reaction sent",
    view: atMatchup(roundOne, FIVE, 2, "VOTING", {
      viewer: amy,
      voters: [hank, amy],
      live: [["laugh", amy]],
    }),
  },
  {
    id: "sloplash-voting-long",
    label: "Voting, worst case: 8 players, longest prompt and answers, no timers (host)",
    view: hostClocked(
      atMatchup(longRound(LONG_SPLIT), EIGHT_AT_ZERO, LONG_STEP, "VOTING", {
        viewer: ong,
        voters: [ong, beau, slopbot, gemini],
        live: [
          ["laugh", ong],
          ["fire", beau],
        ],
        totalRounds: 3,
      }),
    ),
  },
  {
    id: "sloplash-voting-long-voter",
    label: "Voting, worst case: two 80-character answers on a phone",
    view: hostClocked(
      atMatchup(longRound(LONG_SPLIT), EIGHT_AT_ZERO, LONG_STEP, "VOTING", {
        viewer: amy,
        voters: [ong, beau, slopbot, gemini],
        totalRounds: 3,
      }),
    ),
  },
  {
    id: "sloplash-reveal",
    label: "Reveal: SLOPPED, a bot sweeps a human",
    view: atMatchup(roundOne, FIVE, 2, "REVEAL", { viewer: beau }),
  },
  {
    id: "sloplash-reveal-tie",
    label: "Reveal: TIE",
    view: atMatchup(roundOne, FIVE, 1, "REVEAL", { viewer: ong }),
  },
  {
    id: "sloplash-reveal-no-votes",
    label: "Reveal: NO VOTES",
    view: atMatchup(roundOne, FIVE, 3, "REVEAL", { viewer: beau }),
  },
  {
    id: "sloplash-reveal-win",
    label: "Reveal: a human beats a bot",
    view: atMatchup(roundTwo, afterOne.players, 4, "REVEAL", { viewer: ong }),
  },
  {
    id: "sloplash-reveal-flawless",
    label: "Reveal: FLAWLESS",
    view: atMatchup(roundTwo, afterOne.players, 2, "REVEAL", { viewer: beau }),
  },
  {
    id: "sloplash-reveal-walkover",
    label: "Reveal: walkover, I win by default",
    view: atMatchup(roundOne, FIVE, 0, "REVEAL", { viewer: ong }),
  },
  {
    id: "sloplash-reveal-walkover-forfeit",
    label: "Reveal: walkover, I ran out of time",
    view: atMatchup(roundOne, FIVE, 0, "REVEAL", { viewer: amy }),
  },
  {
    id: "sloplash-reveal-long",
    label: "Reveal, worst case: 6-0 FLAWLESS at ×4 with reactions",
    view: atMatchup(longRound(LONG_FLAWLESS, LONG_REACTIONS), EIGHT_AT_ZERO, LONG_STEP, "REVEAL", {
      viewer: bart,
      totalRounds: 3,
    }),
  },
  {
    id: "sloplash-reveal-split",
    label: "Reveal: a 4-2 split at ×4",
    view: atMatchup(longRound(LONG_SPLIT), EIGHT_AT_ZERO, LONG_STEP, "REVEAL", {
      viewer: amy,
      totalRounds: 3,
    }),
  },
  {
    id: "sloplash-reveal-untimed",
    label: "Reveal, worst case, no timers (host)",
    view: hostClocked(
      atMatchup(longRound(LONG_FLAWLESS, LONG_REACTIONS), EIGHT_AT_ZERO, LONG_STEP, "REVEAL", {
        viewer: ong,
        totalRounds: 3,
      }),
    ),
  },
  {
    id: "sloplash-round-results",
    label: "Round results: tagline still being written",
    view: resultsView(roundOne, FIVE, {
      viewer: ong,
      totalRounds: 2,
      tagline: { playerId: slopbot.id, text: null },
    }),
  },
  {
    id: "sloplash-round-results-long",
    label: "Round results, 8 players with a 100-character tagline, no timers (host)",
    view: resultsView(eightResults, EIGHT, {
      viewer: ong,
      totalRounds: 3,
      tagline: { playerId: gemini.id, text: LONG_TAGLINE },
      untimed: true,
    }),
  },
  {
    id: "sloplash-final",
    label: "Final: the machine wins",
    view: finalView([afterOne.round, afterTwo.round], afterTwo.players, {
      viewer: ong,
      tagline: { playerId: slopbot.id, text: FINAL_TAGLINE },
      usage: USAGE,
    }),
  },
  {
    id: "sloplash-final-human",
    label: "Final: a human wins",
    view: finalView([afterOne.round, afterTwoHuman.round], afterTwoHuman.players, {
      viewer: ong,
      tagline: null,
    }),
  },
  {
    id: "sloplash-final-tie",
    label: "Final: a tie for first",
    view: finalView([afterOne.round, afterTwo.round], withScores(afterTwo.players, { ong: 1050 }), {
      viewer: ong,
      tagline: null,
    }),
  },
  {
    id: "sloplash-final-long",
    label: "Final, 8 players: five awards and the field",
    view: finalView([eightFinal.round], eightFinal.players, { viewer: ong, tagline: null }),
  },
  {
    id: "sloplash-final-recap",
    label: "Final results as the public recap (no viewer)",
    view: finalView([afterOne.round, afterTwo.round], afterTwo.players, {
      viewer: null,
      tagline: null,
      usage: USAGE,
    }),
  },
];

/** Exposed for the fixture test: the data behind the fixtures above. */
export const sloplashFixtureData = {
  players: { ong, amy, beau, slopbot, hank, bart, priya, gemini },
  afterOne,
  afterTwo,
  afterTwoHuman,
  eightResults: settle(eightResults, EIGHT),
  eightFinal,
};
