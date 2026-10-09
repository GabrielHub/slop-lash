import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import { applyScoreResult, scorePrompt, type PlayerState } from "@/games/sloplash/scoring";
import { sloplashPrompt, type AnswerSpec, type VoteSpec } from "@/games/sloplash/test-kit";
import { FIXTURE_NOW, fixturePlayer, fixtureView, type Fixture } from "./base";

type Mode = ModeView<"SLOPLASH">;
type Round = NonNullable<Mode["round"]>;
type Prompt = Round["prompts"][number];

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
const players = [ong, amy, beau, slopbot, hank];

type Matchup = [key: string, text: string, answers: AnswerSpec[], votes: VoteSpec[]];

/** Each player is paired with the next one around the table, as the server deals them. */
const ROUND_ONE: Matchup[] = [
  [
    "r1-dentist",
    "The worst thing to hear from your dentist:",
    [
      {
        by: "ong",
        text: "We drill after dark, baby.",
        reactions: [
          ["laugh", "beau"],
          ["skull", "hank"],
        ],
      },
      { by: "amy", text: "I've never done this sober." },
    ],
    [
      ["beau", 0],
      ["slopbot", 1],
      ["hank", 0],
    ],
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
      ["hank", 0],
    ],
  ],
  [
    "r1-gym",
    "The least inspiring gym motivational quote:",
    [
      {
        by: "beau",
        text: "Just stand near the weights and look busy.",
        reactions: [["eyes", "amy"]],
      },
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
      ["ong", 1],
      ["amy", 1],
      ["hank", 1],
    ],
  ],
  [
    "r1-sparkling",
    "What not to say when the waiter asks “sparkling or still?”",
    [
      { by: "slopbot", text: "Whichever one screams less when poured." },
      { by: "hank", text: "Still. Like my career.", reactions: [["sleep", "beau"]] },
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

function build(matchups: Matchup[]): Prompt[] {
  return matchups.map(([key, text, answers, votes]) => sloplashPrompt(key, text, answers, votes));
}

/** A matchup that has not come up yet: the view sends only who wrote it. */
function hidden(prompt: Prompt): Prompt {
  return { ...prompt, text: "", revealed: false, answers: [], votes: [] };
}

/**
 * The matchup on screen while it is being voted on, as `viewer` sees it: only
 * their own answer and their own choice show through.
 */
function onScreen(prompt: Prompt, viewer: RoomPlayer, voters: string[]): Prompt {
  return {
    ...prompt,
    revealed: false,
    answers: prompt.answers.map((answer) => ({
      ...answer,
      playerId: answer.playerId === viewer.id ? answer.playerId : null,
      pointsEarned: 0,
      penalty: 0,
    })),
    votes: prompt.votes
      .filter((vote) => voters.includes(vote.voterId))
      .map((vote) => ({
        ...vote,
        responseId: vote.voterId === viewer.id ? vote.responseId : null,
      })),
  };
}

/**
 * Scores a round's first `count` matchups the way the server does: each votable
 * matchup as it is revealed, then forfeits at round end. Returns the round with
 * those matchups' points filled in, and the players' scores after them.
 */
function settle(number: number, prompts: Prompt[], before: RoomPlayer[], count = prompts.length) {
  const states = new Map<string, PlayerState>(
    before.map(({ id, score, humorRating, winStreak }) => [id, { score, humorRating, winStreak }]),
  );
  const typeOf = (id: string) => before.find((player) => player.id === id)?.type ?? "HUMAN";
  const order = [
    ...prompts.filter((prompt) => prompt.votable),
    ...prompts.filter((prompt) => !prompt.votable),
  ].slice(0, count);
  const scored = new Map<string, Prompt>();
  for (const prompt of order) {
    const answers = prompt.answers.map((answer) => ({ ...answer, playerId: answer.playerId! }));
    const result = scorePrompt(
      answers.map((answer) => ({
        id: answer.id,
        playerId: answer.playerId,
        playerType: typeOf(answer.playerId),
        text: answer.text,
      })),
      prompt.votes.map((vote) => ({
        id: vote.voterId,
        type: typeOf(vote.voterId),
        responseId: vote.responseId,
      })),
      states,
      number,
      before.filter((player) => !prompt.assigneeIds.includes(player.id)).length,
    );
    applyScoreResult(result, answers, states);
    scored.set(prompt.id, {
      ...prompt,
      answers: answers.map((answer) => ({
        ...answer,
        pointsEarned: result.points[answer.id] ?? 0,
        penalty: result.penalties[answer.playerId] ?? 0,
      })),
      votes: prompt.votes.map((vote) => ({
        ...vote,
        penalty: result.penalties[vote.voterId] ?? 0,
      })),
    });
  }
  return {
    round: { number, prompts: prompts.map((prompt) => scored.get(prompt.id) ?? prompt) },
    players: before.map((player) => ({ ...player, ...states.get(player.id) })),
  };
}

const roundOne = build(ROUND_ONE);
const roundTwo = build(ROUND_TWO);
const afterOne = settle(1, roundOne, players);
const afterTwo = settle(2, roundTwo, afterOne.players);
const roundOneMatchups = roundOne.filter((prompt) => prompt.votable).length;

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

function writing(viewer: RoomPlayer, submitted: string[], finished: RoomPlayer[]): Mode {
  return mode({
    round: { number: 1, prompts: [] },
    writing: {
      prompts: roundOne
        .filter((prompt) => prompt.assigneeIds.includes(viewer.id))
        .map((prompt) => ({
          id: prompt.id,
          text: prompt.text,
          submitted: submitted.includes(prompt.id),
        })),
      finishedPlayerIds: finished.map((player) => player.id),
    },
  });
}

const writingRoom = {
  gameType: "SLOPLASH",
  status: "PLAYING",
  phase: "WRITING",
  round: 1,
  totalRounds: 2,
  phaseStartedAt: FIXTURE_NOW - 40_000,
  phaseDeadline: FIXTURE_NOW + 50_000,
} satisfies Partial<RoomView["room"]>;

const votingRoom = (step: number) =>
  ({
    gameType: "SLOPLASH",
    status: "PLAYING",
    phase: "VOTING",
    step,
    round: 1,
    totalRounds: 2,
    phaseStartedAt: FIXTURE_NOW - 8_000,
    phaseDeadline: FIXTURE_NOW + 22_000,
  }) satisfies Partial<RoomView["room"]>;

const revealRoom = (step: number) =>
  ({
    ...votingRoom(step),
    phase: "REVEAL",
    phaseStartedAt: FIXTURE_NOW - 2_000,
    phaseDeadline: FIXTURE_NOW + 8_000,
  }) satisfies Partial<RoomView["room"]>;

/**
 * Round one at matchup `step`. While voting, `current` is that matchup as the
 * viewer sees it; without it, the matchup is being revealed. Earlier matchups
 * are revealed and on the scoreboard, later ones are not up yet.
 */
function atMatchup(step: number, current?: Prompt, options?: { viewer: RoomPlayer }): RoomView {
  const revealed = current ? step : step + 1;
  const settled = settle(1, roundOne, players, revealed);
  return fixtureView(
    settled.players,
    current ? votingRoom(step) : revealRoom(step),
    mode({
      round: {
        number: 1,
        prompts: settled.round.prompts.map((prompt, index) =>
          index < revealed ? prompt : index === step && current ? current : hidden(prompt),
        ),
      },
      currentPromptId: roundOne[step]!.id,
      matchupCount: roundOneMatchups,
    }),
    options,
  );
}

const [dentist, , gym] = roundOne;

export const sloplashFixtures: Fixture[] = [
  {
    id: "sloplash-writing",
    label: "Writing: one answer in, one to go",
    view: fixtureView(players, writingRoom, writing(ong, [dentist!.id], [beau, slopbot, hank])),
  },
  {
    id: "sloplash-writing-done",
    label: "Writing: all my answers in, waiting on others",
    view: fixtureView(
      players,
      { ...writingRoom, phaseStartedAt: FIXTURE_NOW - 75_000, phaseDeadline: FIXTURE_NOW + 15_000 },
      writing(
        ong,
        roundOne.map((prompt) => prompt.id),
        [ong, slopbot, hank],
      ),
    ),
  },
  {
    id: "sloplash-voting-own",
    label: "Voting: my own matchup is up",
    view: atMatchup(0, onScreen(dentist!, ong, [beau.id])),
  },
  {
    id: "sloplash-voting",
    label: "Voting: pick the funnier answer",
    view: atMatchup(2, onScreen(gym!, ong, [hank.id])),
  },
  {
    id: "sloplash-voting-voted",
    label: "Voting: vote locked in (non-host player)",
    view: atMatchup(2, onScreen(gym!, amy, [hank.id, amy.id]), { viewer: amy }),
  },
  {
    id: "sloplash-reveal",
    label: "Reveal: slopped by the machine",
    view: atMatchup(2),
  },
  {
    id: "sloplash-reveal-passed",
    label: "Reveal: every human passed",
    view: atMatchup(3),
  },
  {
    id: "sloplash-round-results",
    label: "Round results: tagline still being written",
    view: fixtureView(
      afterOne.players,
      {
        gameType: "SLOPLASH",
        status: "PLAYING",
        phase: "ROUND_RESULTS",
        round: 1,
        totalRounds: 2,
        phaseStartedAt: FIXTURE_NOW - 3_000,
        phaseDeadline: FIXTURE_NOW + 9_000,
      },
      mode({
        round: afterOne.round,
        matchupCount: roundOneMatchups,
        tagline: { playerId: slopbot.id, text: null },
      }),
    ),
  },
  {
    id: "sloplash-final",
    label: "Final results",
    view: fixtureView(
      afterTwo.players,
      { gameType: "SLOPLASH", status: "FINISHED", phase: "FINAL", round: 2, totalRounds: 2 },
      mode({
        round: afterTwo.round,
        rounds: [afterOne.round, afterTwo.round],
        tagline: {
          playerId: slopbot.id,
          text: "I came, I generated, I was statistically the funniest. GG, carbon-based lifeforms.",
        },
      }),
      {
        usage: {
          inputTokens: 18_420,
          outputTokens: 6_310,
          costUsd: 0.0914,
          byModel: [
            {
              modelId: "openai/gpt-6.1-sol",
              inputTokens: 11_208,
              outputTokens: 3_904,
              costUsd: 0.0702,
            },
            {
              modelId: "anthropic/claude-haiku-5.5",
              inputTokens: 7_212,
              outputTokens: 2_406,
              costUsd: 0.0212,
            },
          ],
        },
      },
    ),
  },
  {
    id: "sloplash-final-recap",
    label: "Final results as the public recap (no viewer)",
    view: fixtureView(
      afterTwo.players,
      { gameType: "SLOPLASH", status: "FINISHED", phase: "FINAL", round: 2, totalRounds: 2 },
      mode({ round: afterTwo.round, rounds: [afterOne.round, afterTwo.round] }),
      { viewer: null },
    ),
  },
];
