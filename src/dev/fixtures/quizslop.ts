import { availableCatalogTopics } from "@/games/quizslop/catalog";
import { QUIZSLOP_TOPIC_CATALOG } from "@/games/quizslop/config/topic-catalog";
import { finalResults, quizPointsForRound } from "@/games/quizslop/scoring";
import { presentChoices } from "@/games/quizslop/shuffle";
import type {
  QuizslopQuestionContent,
  QuizslopRoundKind,
  QuizslopTier,
} from "@/games/quizslop/types";
import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import { FIXTURE_NOW, fixturePlayer, fixtureView, type Fixture } from "./base";

type Mode = ModeView<"QUIZSLOP">;
type Seat = Mode["seats"][number];
type Bet = Mode["calls"]["list"][number];
type Revealed = Mode["reveal"][number];
type Round = NonNullable<Mode["round"]>;
type PlayerId = RoomPlayer["id"];

/* ─── Casts ─── */

const priya = fixturePlayer("priya", "Priya");
const marcus = fixturePlayer("marcus", "Marcus");
const jo = fixturePlayer("jo", "Jo");
const tal = fixturePlayer("tal", "Tal");
const cast = [priya, marcus, jo, tal];

/** The stress cast: eight seats, three at the 20-character name cap. */
const alexandria = fixturePlayer("alexandria", "Alexandria Whitfield");
const bartholomew = fixturePlayer("bartholomew", "Bartholomew Ashcroft");
const maximiliana = fixturePlayer("maximiliana", "Maximiliana Ashworth");
const wen = fixturePlayer("wen", "Wen");
const cast8 = [priya, marcus, jo, tal, alexandria, bartholomew, maximiliana, wen];

const TOTAL_ROUNDS = 6;
const TOTAL_ROUNDS_8 = 10;

/* ─── Catalog content ─── */

function catalogTopic(id: string) {
  const topic = QUIZSLOP_TOPIC_CATALOG.find((entry) => entry.id === id);
  if (!topic) throw new Error(`QuizSlop fixture: missing topic ${id}`);
  return topic;
}

function publicTopic(id: string) {
  return { id, label: catalogTopic(id).label };
}

function question(topicId: string, tier: QuizslopTier) {
  const found = catalogTopic(topicId).questions.find((entry) => entry.tier === tier);
  if (!found) throw new Error(`QuizSlop fixture: ${topicId} has no ${tier} question`);
  return presented(found);
}

/** Choices in a game's order, as the server sends them (the catalog writes the answer first). */
function presented<T extends QuizslopQuestionContent>(entry: T): T {
  return { ...entry, ...presentChoices(entry, `fixture:${entry.id}`) };
}

function longest<T>(items: readonly T[], size: (item: T) => number): T {
  return items.reduce((best, item) => (size(item) > size(best) ? item : best));
}

/** The worst case the stage must fit, measured from the shippable catalog at load. */
const SHIPPABLE = availableCatalogTopics();
const QUESTIONS = SHIPPABLE.flatMap((topic) => topic.questions);
const STRESS = {
  prompt: longest(QUESTIONS, (entry) => entry.displayPrompt.length),
  choices: presented(
    longest(QUESTIONS, (entry) => Math.max(...entry.choices.map((choice) => choice.length))),
  ),
  explanation: longest(QUESTIONS, (entry) => entry.explanation.length),
  topic: longest(SHIPPABLE, (topic) => topic.label.length),
};

const MUSIC = "cat-music-general";
const NINTENDO = "cat-classic-nintendo";
const SHARKS = "cat-sharks-ocean";
const GHIBLI = "cat-studio-ghibli";
const SOLAR = "cat-solar-system";
const FINALISTS = ["cat-world-capitals", "cat-ancient-rome", "cat-cheese-dairy"];

/* ─── Builders ─── */

function namesOf(players: readonly RoomPlayer[]) {
  return Object.fromEntries(players.map((player) => [player.id, player.name]));
}

function ids(players: readonly RoomPlayer[]): PlayerId[] {
  return players.map((player) => player.id);
}

function seat(player: RoomPlayer, overrides: Partial<Seat> = {}): Seat {
  return {
    playerId: player.id,
    callTokens: 2,
    quizPoints: 0,
    callPoints: 0,
    correctAnswers: 0,
    successfulCalls: 0,
    incorrectCalls: 0,
    ...overrides,
  };
}

function round(
  ordinal: number,
  kind: QuizslopRoundKind,
  topicId: string | null,
  owner?: RoomPlayer,
): Round {
  return {
    ordinal,
    kind,
    pointValue: quizPointsForRound(kind === "HOUSE_CHOICE"),
    topic: topicId ? publicTopic(topicId) : null,
    ownerPlayerId: owner?.id ?? null,
    settled: false,
    scores: [],
  };
}

function mode(players: readonly RoomPlayer[], overrides: Partial<Mode>): Mode {
  return {
    kind: "QUIZSLOP",
    names: namesOf(players),
    lobby: null,
    seats: [],
    round: null,
    houseVote: null,
    calls: { eligiblePlayerIds: ids(players), decidedPlayerIds: [], myCall: null, list: [] },
    answer: null,
    reveal: [],
    revealTotal: 0,
    myRevealStep: null,
    reactions: [],
    final: null,
    ...overrides,
  };
}

/** Each phase's deadline at its real length from a start 10s ago, so moments have settled. */
const DEADLINE: Record<string, number> = {
  CALL: FIXTURE_NOW + 20_000,
  ANSWER: FIXTURE_NOW + 20_000,
  HOUSE_VOTE: FIXTURE_NOW + 20_000,
  REVEAL: FIXTURE_NOW + 5_000,
  ROUND_RESULTS: FIXTURE_NOW + 2_000,
};

/** The cast with each player's score set to their seat total, as the server keeps it. */
function scored(players: readonly RoomPlayer[], seats: readonly Seat[]): RoomPlayer[] {
  return players.map((player) => {
    const entry = seats.find((candidate) => candidate.playerId === player.id);
    return entry ? { ...player, score: entry.quizPoints + entry.callPoints } : player;
  });
}

function playing(
  room: Partial<RoomView["room"]> & { phase: string },
  modeView: Mode,
  options: { viewer?: RoomPlayer; players?: RoomPlayer[]; totalRounds?: number } = {},
): RoomView {
  const players = options.players ?? cast;
  return fixtureView(
    scored(players, modeView.seats),
    {
      gameType: "QUIZSLOP",
      status: "PLAYING",
      totalRounds: options.totalRounds ?? (players.length > 4 ? TOTAL_ROUNDS_8 : TOTAL_ROUNDS),
      phaseDeadline: DEADLINE[room.phase] ?? null,
      ...room,
    },
    modeView,
    { viewer: options.viewer ?? players[0] },
  );
}

/** What the server reports for a settled round: each seat's marked answer and bet deltas. */
function settledScores(
  seats: readonly Seat[],
  reveal: readonly Revealed[],
  bets: readonly Bet[],
) {
  return seats.map(({ playerId }) => ({
    playerId,
    quiz: reveal
      .flatMap((entry) => entry.players)
      .filter((entry) => entry.playerId === playerId)
      .reduce((sum, entry) => sum + entry.points, 0),
    calls: bets
      .filter((bet) => bet.callerId === playerId)
      .reduce((sum, bet) => sum + bet.delta, 0),
  }));
}

type Result = "correct" | "wrong" | "timeout";

function answers(
  content: { correctIndex: number; choices: readonly string[] },
  results: readonly (readonly [RoomPlayer, Result, number?])[],
  points: number,
): Revealed["players"] {
  return results.map(([player, result, pick]) => ({
    playerId: player.id,
    selectedIndex:
      result === "correct"
        ? content.correctIndex
        : result === "wrong"
          ? (pick ?? (content.correctIndex + 1) % content.choices.length)
          : null,
    timedOut: result === "timeout",
    correct: result === "correct",
    points: result === "correct" ? points : 0,
  }));
}

/* ─── Lobby ─── */

function lobbyTopics(picks: ReadonlyMap<string, PlayerId>) {
  return availableCatalogTopics().map((topic) => ({
    id: topic.id,
    label: topic.label,
    claimedBy: picks.get(topic.id) ?? null,
  }));
}

const lobbyPicks = new Map<string, PlayerId>([
  [MUSIC, priya.id],
  [NINTENDO, marcus.id],
  [SHARKS, tal.id],
]);

const lobby8Picks = new Map<string, PlayerId>([
  [MUSIC, priya.id],
  [STRESS.topic.id, bartholomew.id],
  [SHARKS, tal.id],
  [GHIBLI, jo.id],
  [FINALISTS[0]!, alexandria.id],
  [FINALISTS[1]!, wen.id],
]);

/* ─── Round 2: Priya's topic, Music ─── */

const homeTurf = round(2, "HOME_TURF", MUSIC, priya);

/** After the warm-up: Jo bet right on Marcus; three of four answered right. */
const afterWarmUp = [
  seat(priya, { quizPoints: 100, correctAnswers: 1 }),
  seat(marcus),
  seat(jo, { callTokens: 1, quizPoints: 100, callPoints: 150, correctAnswers: 1, successfulCalls: 1 }),
  seat(tal, { quizPoints: 100, correctAnswers: 1 }),
];

/** Marcus and Tal each placed a bet this round. */
const afterBets = afterWarmUp.map((entry) =>
  entry.playerId === marcus.id || entry.playerId === tal.id
    ? { ...entry, callTokens: entry.callTokens - 1 }
    : entry,
);

function musicGroup(tier: QuizslopTier, results: [RoomPlayer, Result][]): Revealed {
  const content = question(MUSIC, tier);
  return {
    questionId: content.id,
    displayPrompt: content.displayPrompt,
    choices: [...content.choices],
    correctIndex: content.correctIndex,
    explanation: content.explanation,
    players: answers(content, results, homeTurf.pointValue),
  };
}

/** Priya's own group reveals last. */
const musicReveal = [
  musicGroup("EASY", [[marcus, "correct"]]),
  musicGroup("HARD", [[tal, "timeout"]]),
  musicGroup("MEDIUM", [
    [priya, "correct"],
    [jo, "wrong"],
  ]),
];

const MUSIC_STEP: Record<string, number> = {
  [marcus.id]: 0,
  [tal.id]: 1,
  [priya.id]: 2,
  [jo.id]: 2,
};

/** Marcus's bet on Priya busts; Tal's bet on Jo lands. */
const settledBets: Bet[] = [
  { callerId: marcus.id, targetId: priya.id, outcome: "LOST", delta: -150 },
  { callerId: tal.id, targetId: jo.id, outcome: "WON", delta: 150 },
];

/** The bets as the server shows them: each is decided once its target's question is revealed. */
function shownBets(reveal: readonly Revealed[]): Bet[] {
  const onScreen = new Set(
    reveal.flatMap((entry) => entry.players.map((player) => player.playerId)),
  );
  return settledBets.map((bet) =>
    onScreen.has(bet.targetId) ? bet : { ...bet, outcome: null, delta: 0 },
  );
}

const afterRound = [
  seat(priya, { quizPoints: 200, correctAnswers: 2 }),
  seat(marcus, { callTokens: 1, quizPoints: 100, callPoints: -150, correctAnswers: 1, incorrectCalls: 1 }),
  afterWarmUp[2]!,
  seat(tal, { callTokens: 1, quizPoints: 100, callPoints: 150, correctAnswers: 1, successfulCalls: 1 }),
];

const roundTwoCalls = {
  eligiblePlayerIds: ids(cast),
  decidedPlayerIds: ids(cast),
};

function musicStep(step: number, viewer: RoomPlayer): RoomView {
  const reveal = musicReveal.slice(0, step + 1);
  return playing(
    { phase: "REVEAL", round: 2, step },
    mode(cast, {
      seats: afterBets,
      round: homeTurf,
      calls: {
        ...roundTwoCalls,
        myCall: { targetId: settledBets.find((bet) => bet.callerId === viewer.id)?.targetId ?? null },
        list: shownBets(reveal),
      },
      reveal,
      revealTotal: musicReveal.length,
      myRevealStep: MUSIC_STEP[viewer.id] ?? null,
    }),
    { viewer },
  );
}

/* ─── Eight players, worst-case content ─── */

/** One bet per player, 20-character names on both sides. */
const bets8: [RoomPlayer, RoomPlayer][] = [
  [alexandria, bartholomew],
  [bartholomew, maximiliana],
  [maximiliana, alexandria],
  [priya, tal],
  [marcus, jo],
  [jo, wen],
  [tal, priya],
  [wen, bartholomew],
];

const warmUp8Results: [RoomPlayer, Result, number?][] = [
  [priya, "correct"],
  [marcus, "correct"],
  [alexandria, "correct"],
  [maximiliana, "correct"],
  [wen, "correct"],
  [jo, "wrong", (STRESS.choices.correctIndex + 1) % 4],
  [bartholomew, "wrong", (STRESS.choices.correctIndex + 2) % 4],
  [tal, "timeout"],
];

const stressGroup: Revealed = {
  questionId: STRESS.prompt.id,
  displayPrompt: STRESS.prompt.displayPrompt,
  choices: [...STRESS.choices.choices],
  correctIndex: STRESS.choices.correctIndex,
  explanation: STRESS.explanation.explanation,
  players: answers(STRESS.choices, warmUp8Results, 100),
};

const settledBets8: Bet[] = bets8.map(([caller, target]) => {
  const right = stressGroup.players.find((entry) => entry.playerId === target.id)?.correct;
  return {
    callerId: caller.id,
    targetId: target.id,
    outcome: right ? "LOST" : "WON",
    delta: right ? -150 : 150,
  };
});

const seats8Start = cast8.map((player) => seat(player));

/** Round results for eight: a new single leader, a tie for 3rd, and two negative rounds. */
const results8: [RoomPlayer, number, number, number][] = [
  // player, previous total, quiz this round, bets this round
  [maximiliana, 400, 100, 150],
  [priya, 500, 0, 0],
  [bartholomew, 300, 100, 0],
  [jo, 250, 0, 150],
  [alexandria, 350, 100, -150],
  [marcus, 150, 100, 0],
  [tal, 200, 0, -150],
  [wen, 0, 100, 0],
];

const seats8Results = results8.map(([player, previous, quiz, bets]) =>
  seat(player, {
    callTokens: 1,
    quizPoints: previous + quiz,
    callPoints: bets,
    correctAnswers: Math.round((previous + quiz) / 100),
    successfulCalls: bets > 0 ? 1 : 0,
    incorrectCalls: bets < 0 ? 1 : 0,
  }),
);

/* ─── The last round and the end ─── */

const finalSeats = [
  seat(priya, { quizPoints: 500, correctAnswers: 4 }),
  seat(marcus, {
    callTokens: 0,
    quizPoints: 400,
    correctAnswers: 4,
    successfulCalls: 1,
    incorrectCalls: 1,
  }),
  seat(jo, { callTokens: 0, quizPoints: 300, callPoints: 300, correctAnswers: 2, successfulCalls: 2 }),
  seat(tal, { callTokens: 1, quizPoints: 300, callPoints: 150, correctAnswers: 3, successfulCalls: 1 }),
];

const beforeLastRound = finalSeats.map((entry) => ({
  ...entry,
  quizPoints: Math.max(0, entry.quizPoints - 200),
}));

const lastRound = round(TOTAL_ROUNDS, "HOUSE_CHOICE", null);

function finished(
  viewer: RoomPlayer | null,
  seats: Seat[] = finalSeats,
  players: RoomPlayer[] = cast,
): RoomView {
  return fixtureView(
    scored(players, seats),
    {
      gameType: "QUIZSLOP",
      status: "FINISHED",
      phase: "FINAL",
      round: players.length > 4 ? TOTAL_ROUNDS_8 : TOTAL_ROUNDS,
      totalRounds: players.length > 4 ? TOTAL_ROUNDS_8 : TOTAL_ROUNDS,
    },
    mode(players, { seats, final: finalResults(seats) }),
    { viewer },
  );
}

/** Jo and Priya level on 600; Jo has more points from answers. */
const tieSeats = [
  seat(priya, { quizPoints: 450, callPoints: 150, correctAnswers: 4, successfulCalls: 1 }),
  seat(marcus, { quizPoints: 400, correctAnswers: 4 }),
  seat(jo, { quizPoints: 600, correctAnswers: 5 }),
  seat(tal, { quizPoints: 300, callPoints: 150, correctAnswers: 3, successfulCalls: 1 }),
];

/** Jo and Priya level on everything: co-winners. */
const coWinnerSeats = [
  seat(priya, { quizPoints: 450, callPoints: 150, correctAnswers: 4, successfulCalls: 1 }),
  seat(marcus, { quizPoints: 400, correctAnswers: 4 }),
  seat(jo, { quizPoints: 450, callPoints: 150, correctAnswers: 4, successfulCalls: 1 }),
  seat(tal, { quizPoints: 300, correctAnswers: 3 }),
];

/** Eight players: Maximiliana wins, Wen finishes below zero, and every award lands. */
const seats8Final = [
  seat(maximiliana, { quizPoints: 900, callPoints: 150, correctAnswers: 5, successfulCalls: 1 }),
  seat(jo, { quizPoints: 800, correctAnswers: 5, successfulCalls: 1, incorrectCalls: 1 }),
  seat(tal, { quizPoints: 400, callPoints: 300, correctAnswers: 3, successfulCalls: 2 }),
  seat(priya, { quizPoints: 600, correctAnswers: 4 }),
  seat(alexandria, { quizPoints: 400, callPoints: 150, correctAnswers: 3, successfulCalls: 1 }),
  seat(bartholomew, { quizPoints: 500, callPoints: -150, correctAnswers: 4, incorrectCalls: 1 }),
  seat(marcus, { quizPoints: 300, correctAnswers: 3 }),
  seat(wen, { callTokens: 0, quizPoints: 200, callPoints: -300, correctAnswers: 2, incorrectCalls: 2 }),
];

/* ─── Fixtures ─── */

export const quizslopFixtures: Fixture[] = [
  {
    id: "quizslop-lobby",
    label: "Lobby: three topics picked, Jo's deal",
    view: fixtureView(
      cast,
      { gameType: "QUIZSLOP" },
      mode(cast, {
        seats: cast.map((player) => seat(player)),
        lobby: { topics: lobbyTopics(lobbyPicks) },
      }),
      { viewer: jo },
    ),
  },
  {
    id: "quizslop-lobby-8",
    label: "Lobby: eight players, six picked",
    view: fixtureView(
      cast8,
      { gameType: "QUIZSLOP" },
      mode(cast8, {
        seats: seats8Start,
        lobby: { topics: lobbyTopics(lobby8Picks) },
      }),
      { viewer: alexandria },
    ),
  },
  {
    id: "quizslop-call-warm-up",
    label: "Bets: the warm-up, nobody decided",
    view: playing(
      { phase: "CALL", round: 1 },
      mode(cast, {
        seats: cast.map((player) => seat(player)),
        round: round(1, "WARM_UP", SOLAR),
      }),
    ),
  },
  {
    id: "quizslop-call",
    label: "Bets: Priya's topic, two decided, Priya picking",
    view: playing(
      { phase: "CALL", round: 2 },
      mode(cast, {
        seats: afterBets,
        round: homeTurf,
        calls: { ...roundTwoCalls, decidedPlayerIds: [marcus.id, tal.id], myCall: null, list: [] },
      }),
    ),
  },
  {
    id: "quizslop-call-decided",
    label: "Bets: Marcus bet on Priya",
    view: playing(
      { phase: "CALL", round: 2 },
      mode(cast, {
        seats: afterBets,
        round: homeTurf,
        calls: {
          ...roundTwoCalls,
          decidedPlayerIds: [marcus.id, tal.id],
          myCall: { targetId: priya.id },
          list: [],
        },
      }),
      { viewer: marcus },
    ),
  },
  {
    id: "quizslop-call-no-bets",
    label: "Bets: Tal has none left",
    view: playing(
      { phase: "CALL", round: 4 },
      mode(cast, {
        seats: afterRound.map((entry) =>
          entry.playerId === tal.id ? { ...entry, callTokens: 0 } : entry,
        ),
        round: round(4, "HOME_TURF", GHIBLI, jo),
        calls: {
          eligiblePlayerIds: [priya.id, marcus.id, jo.id],
          decidedPlayerIds: [marcus.id],
          myCall: null,
          list: [],
        },
      }),
      { viewer: tal },
    ),
  },
  {
    id: "quizslop-call-8",
    label: "Bets: eight players, longest topic",
    view: playing(
      { phase: "CALL", round: 3 },
      mode(cast8, {
        seats: seats8Start,
        round: round(3, "HOME_TURF", STRESS.topic.id, bartholomew),
        calls: {
          eligiblePlayerIds: ids(cast8),
          decidedPlayerIds: [priya.id, marcus.id, maximiliana.id],
          myCall: null,
          list: [],
        },
      }),
      { viewer: alexandria, players: cast8 },
    ),
  },
  {
    id: "quizslop-answer",
    label: "Answer: two bets on the board, Priya bet on",
    view: playing(
      { phase: "ANSWER", round: 2 },
      mode(cast, {
        seats: afterBets,
        round: homeTurf,
        calls: { ...roundTwoCalls, myCall: { targetId: null }, list: shownBets([]) },
        answer: {
          assignedPlayerIds: ids(cast),
          lockedPlayerIds: [marcus.id, tal.id],
          mine: {
            displayPrompt: question(MUSIC, "MEDIUM").displayPrompt,
            choices: [...question(MUSIC, "MEDIUM").choices],
            selectedIndex: null,
            locked: false,
          },
        },
      }),
    ),
  },
  {
    id: "quizslop-answer-locked",
    label: "Answer: Marcus locked in",
    view: playing(
      { phase: "ANSWER", round: 2 },
      mode(cast, {
        seats: afterBets,
        round: homeTurf,
        calls: { ...roundTwoCalls, myCall: { targetId: priya.id }, list: shownBets([]) },
        answer: {
          assignedPlayerIds: ids(cast),
          lockedPlayerIds: [marcus.id, tal.id],
          mine: {
            displayPrompt: question(MUSIC, "EASY").displayPrompt,
            choices: [...question(MUSIC, "EASY").choices],
            selectedIndex: 1,
            locked: true,
          },
        },
      }),
      { viewer: marcus },
    ),
  },
  {
    id: "quizslop-answer-round-open",
    label: "Answer: nobody has bets, the round opens here",
    view: playing(
      { phase: "ANSWER", round: 5 },
      mode(cast, {
        seats: afterRound.map((entry) => ({ ...entry, callTokens: 0 })),
        round: round(5, "HOME_TURF", SHARKS, tal),
        calls: { eligiblePlayerIds: [], decidedPlayerIds: [], myCall: null, list: [] },
        answer: {
          assignedPlayerIds: ids(cast),
          lockedPlayerIds: [priya.id],
          mine: {
            displayPrompt: question(SHARKS, "MEDIUM").displayPrompt,
            choices: [...question(SHARKS, "MEDIUM").choices],
            selectedIndex: null,
            locked: false,
          },
        },
      }),
      { viewer: jo },
    ),
  },
  {
    id: "quizslop-answer-8",
    label: "Answer: eight bets, long names",
    view: playing(
      { phase: "ANSWER", round: 1 },
      mode(cast8, {
        seats: seats8Start.map((entry) => ({ ...entry, callTokens: 1 })),
        round: round(1, "WARM_UP", STRESS.topic.id),
        calls: {
          eligiblePlayerIds: ids(cast8),
          decidedPlayerIds: ids(cast8),
          myCall: { targetId: bartholomew.id },
          list: settledBets8.map((bet) => ({ ...bet, outcome: null, delta: 0 })),
        },
        answer: {
          assignedPlayerIds: ids(cast8),
          lockedPlayerIds: [priya.id, jo.id, maximiliana.id],
          mine: {
            displayPrompt: STRESS.prompt.displayPrompt,
            choices: [...STRESS.choices.choices],
            selectedIndex: null,
            locked: false,
          },
        },
      }),
      { viewer: alexandria, players: cast8 },
    ),
  },
  {
    id: "quizslop-reveal",
    label: "Reveal: Priya's question last, both bets stamped",
    view: musicStep(2, priya),
  },
  {
    id: "quizslop-reveal-first",
    label: "Reveal: the first question, Jo waiting",
    view: musicStep(0, jo),
  },
  {
    id: "quizslop-reveal-spectator",
    label: "Reveal: Marcus watches Tal's question, one reaction sent",
    view: (() => {
      const view = musicStep(1, marcus);
      if (view.mode.kind !== "QUIZSLOP") return view;
      const reactionId = "fx-reaction-clap" as Mode["reactions"][number]["id"];
      return {
        ...view,
        mode: { ...view.mode, reactions: [{ id: reactionId, emoji: "clap", mine: true }] },
      };
    })(),
  },
  {
    id: "quizslop-reveal-quiz-wins",
    label: "Reveal: nobody right, the quiz wins",
    view: musicStep(1, tal),
  },
  {
    id: "quizslop-reveal-8",
    label: "Reveal: one question for eight, eight bets",
    view: playing(
      { phase: "REVEAL", round: 1, step: 0 },
      mode(cast8, {
        seats: seats8Start.map((entry) => ({ ...entry, callTokens: 1 })),
        round: round(1, "WARM_UP", STRESS.topic.id),
        calls: {
          eligiblePlayerIds: ids(cast8),
          decidedPlayerIds: ids(cast8),
          myCall: { targetId: bartholomew.id },
          list: settledBets8,
        },
        reveal: [stressGroup],
        revealTotal: 1,
        myRevealStep: 0,
      }),
      { viewer: alexandria, players: cast8 },
    ),
  },
  {
    id: "quizslop-round-results",
    label: "Scores: two tied at the top",
    view: playing(
      { phase: "ROUND_RESULTS", round: 2 },
      mode(cast, {
        seats: afterRound,
        round: {
          ...homeTurf,
          settled: true,
          scores: settledScores(afterRound, musicReveal, settledBets),
        },
        calls: { ...roundTwoCalls, myCall: { targetId: null }, list: settledBets },
        reveal: musicReveal,
        revealTotal: musicReveal.length,
        myRevealStep: MUSIC_STEP[priya.id]!,
      }),
    ),
  },
  {
    id: "quizslop-round-results-8",
    label: "Scores: eight players, a new leader",
    view: playing(
      { phase: "ROUND_RESULTS", round: 4 },
      mode(cast8, {
        seats: seats8Results,
        round: {
          ...round(4, "HOME_TURF", STRESS.topic.id, bartholomew),
          settled: true,
          scores: results8.map(([player, , quiz, bets]) => ({
            playerId: player.id,
            quiz,
            calls: bets,
          })),
        },
      }),
      { viewer: maximiliana, players: cast8 },
    ),
  },
  {
    id: "quizslop-house-vote",
    label: "Vote: the last topic",
    view: playing(
      { phase: "HOUSE_VOTE", round: TOTAL_ROUNDS },
      mode(cast, {
        seats: beforeLastRound,
        round: lastRound,
        houseVote: {
          slate: FINALISTS.map(publicTopic),
          votedPlayerIds: [marcus.id, jo.id],
          myVoteTopicId: null,
          result: null,
        },
      }),
    ),
  },
  {
    id: "quizslop-final-tally",
    label: "Last round: the tally, a tiebreak (R to replay)",
    view: playing(
      { phase: "CALL", round: TOTAL_ROUNDS },
      mode(cast, {
        seats: beforeLastRound.map((entry) =>
          entry.playerId === jo.id ? { ...entry, callTokens: 1 } : entry,
        ),
        round: { ...lastRound, topic: publicTopic(FINALISTS[0]!) },
        houseVote: {
          slate: FINALISTS.map(publicTopic),
          votedPlayerIds: ids(cast),
          myVoteTopicId: FINALISTS[0]!,
          result: {
            winnerTopicId: FINALISTS[0]!,
            votes: [
              { topicId: FINALISTS[0]!, voterIds: [priya.id, jo.id] },
              { topicId: FINALISTS[1]!, voterIds: [marcus.id, tal.id] },
              { topicId: FINALISTS[2]!, voterIds: [] },
            ],
          },
        },
        calls: {
          eligiblePlayerIds: [priya.id, jo.id, tal.id],
          decidedPlayerIds: [],
          myCall: null,
          list: [],
        },
      }),
      { viewer: jo },
    ),
  },
  { id: "quizslop-finished", label: "Final: Priya came 2nd", view: finished(priya) },
  { id: "quizslop-finished-winner", label: "Final: Jo won", view: finished(jo) },
  {
    id: "quizslop-finished-tie",
    label: "Final: tied on points, answers decide",
    view: finished(priya, tieSeats),
  },
  {
    id: "quizslop-finished-cowinners",
    label: "Final: co-winners",
    view: finished(jo, coWinnerSeats),
  },
  { id: "quizslop-finished-recap", label: "Final: public recap", view: finished(null) },
  {
    id: "quizslop-finished-8",
    label: "Final: eight players, every award",
    view: finished(maximiliana, seats8Final, cast8),
  },
];
