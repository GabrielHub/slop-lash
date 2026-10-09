import { availableCatalogTopics } from "@/games/quizslop/catalog";
import { QUIZSLOP_TOPIC_CATALOG } from "@/games/quizslop/config/topic-catalog";
import { getVoiceLinesForTag } from "@/games/quizslop/config/voice-lines";
import { finalResults, quizPointsForRound } from "@/games/quizslop/scoring";
import type {
  QuizslopRoundKind,
  QuizslopTier,
  QuizslopVoiceEventTag,
} from "@/games/quizslop/types";
import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import { fixturePlayer, fixtureView, type Fixture } from "./base";

type Mode = ModeView<"QUIZSLOP">;
type Seat = Mode["seats"][number];
type Call = Mode["calls"]["list"][number];
type Revealed = Mode["reveal"][number];
type Round = NonNullable<Mode["round"]>;

const priya = fixturePlayer("priya", "Priya");
const marcus = fixturePlayer("marcus", "Marcus");
const jo = fixturePlayer("jo", "Jo");
const tal = fixturePlayer("tal", "Tal");
const cast = [priya, marcus, jo, tal];

const TOTAL_ROUNDS = 6;
const HOME_TOPICS = new Map([
  [priya.id, "cat-music-general"],
  [marcus.id, "cat-classic-nintendo"],
  [jo.id, "cat-studio-ghibli"],
  [tal.id, "cat-sharks-ocean"],
]);

function catalogTopic(id: string) {
  const topic = QUIZSLOP_TOPIC_CATALOG.find((entry) => entry.id === id);
  if (!topic) throw new Error(`QuizSlop fixture: missing topic ${id}`);
  return topic;
}

function publicTopic(id: string) {
  const { label, scope, category } = catalogTopic(id);
  return { id, label, scope, category };
}

function question(topicId: string, tier: QuizslopTier) {
  const found = catalogTopic(topicId).questions.find((entry) => entry.tier === tier);
  if (!found) throw new Error(`QuizSlop fixture: ${topicId} has no ${tier} question`);
  return found;
}

function voiceLine(tag: QuizslopVoiceEventTag, index = 0) {
  const line = getVoiceLinesForTag(tag)[index];
  return line ? { text: line.text, accessibleLabel: line.accessibleLabel } : null;
}

function seat(player: RoomPlayer, overrides: Partial<Seat> = {}): Seat {
  return {
    playerId: player.id,
    homeTopic: catalogTopic(HOME_TOPICS.get(player.id)!).label,
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

/** What the server reports for a settled round: each seat's marked answer and call deltas. */
function settledScores(
  seats: readonly Seat[],
  reveal: readonly Revealed[],
  calls: readonly Call[],
) {
  return seats.map(({ playerId }) => ({
    playerId,
    quiz: reveal
      .flatMap((entry) => entry.players)
      .filter((entry) => entry.playerId === playerId)
      .reduce((sum, entry) => sum + entry.points, 0),
    calls: calls
      .filter((call) => call.callerId === playerId)
      .reduce((sum, call) => sum + call.delta, 0),
  }));
}

function mode(overrides: Partial<Mode>): Mode {
  return {
    kind: "QUIZSLOP",
    voiceLine: null,
    lobby: null,
    seats: [],
    round: null,
    callsNext: false,
    houseVote: null,
    calls: { decidedPlayerIds: [], myCall: null, list: [] },
    answer: null,
    reveal: [],
    revealTotal: 0,
    final: null,
    ...overrides,
  };
}

/** The cast with each player's score set to their seat total, as the server keeps it. */
function scored(seats: readonly Seat[]): RoomPlayer[] {
  return cast.map((player) => {
    const entry = seats.find((candidate) => candidate.playerId === player.id);
    return entry ? { ...player, score: entry.quizPoints + entry.callPoints } : player;
  });
}

function playing(room: Partial<RoomView["room"]>, modeView: Mode): RoomView {
  return fixtureView(
    scored(modeView.seats),
    { gameType: "QUIZSLOP", status: "PLAYING", totalRounds: TOTAL_ROUNDS, ...room },
    modeView,
  );
}

/* ─── Round 2: Priya's Home Turf, Music ─── */

const MUSIC = "cat-music-general";
const homeTurf = round(2, "HOME_TURF", MUSIC, priya);

/** After the warm-up: three of four got Solar System right. */
const afterWarmUp = [
  seat(priya, { quizPoints: 100, correctAnswers: 1 }),
  seat(marcus, { quizPoints: 100, correctAnswers: 1 }),
  seat(jo),
  seat(tal, { quizPoints: 100, correctAnswers: 1 }),
];

/** Marcus and Tal each spent a token. */
const afterCalls = afterWarmUp.map((entry) =>
  entry.playerId === marcus.id || entry.playerId === tal.id ? { ...entry, callTokens: 1 } : entry,
);

type Result = "correct" | "wrong" | "timeout";

/** Answers are marked when they lock, so every revealed question carries its verdict. */
function revealed(tier: QuizslopTier, results: [RoomPlayer, Result][]): Revealed {
  const content = question(MUSIC, tier);
  return {
    questionId: content.id,
    displayPrompt: content.displayPrompt,
    choices: [...content.choices],
    correctIndex: content.correctIndex,
    explanation: content.explanation,
    sources: content.sources.map(({ title, url }) => ({ title, url })),
    players: results.map(([player, result]) => ({
      playerId: player.id,
      selectedIndex:
        result === "correct"
          ? content.correctIndex
          : result === "wrong"
            ? (content.correctIndex + 1) % content.choices.length
            : null,
      timedOut: result === "timeout",
      correct: result === "correct",
      points: result === "correct" ? homeTurf.pointValue : 0,
    })),
  };
}

const musicReveal = [
  revealed("EASY", [[marcus, "correct"]]),
  revealed("MEDIUM", [
    [priya, "correct"],
    [jo, "wrong"],
  ]),
  revealed("HARD", [[tal, "timeout"]]),
];

/** Marcus's call on Priya busts; Tal's call on Jo lands. */
const settledCalls: Call[] = [
  { callerId: marcus.id, targetId: priya.id, outcome: "LOST", delta: -150 },
  { callerId: tal.id, targetId: jo.id, outcome: "WON", delta: 150 },
];

/** The calls as the server shows them: each is decided once its target's question is revealed. */
function shownCalls(reveal: readonly Revealed[]): Call[] {
  const onScreen = new Set(
    reveal.flatMap((entry) => entry.players.map((player) => player.playerId)),
  );
  return settledCalls.map((call) =>
    onScreen.has(call.targetId) ? call : { ...call, outcome: null, delta: 0 },
  );
}

const afterRound = [
  seat(priya, { quizPoints: 200, correctAnswers: 2 }),
  seat(marcus, {
    callTokens: 1,
    quizPoints: 200,
    callPoints: -150,
    correctAnswers: 2,
    incorrectCalls: 1,
  }),
  seat(jo),
  seat(tal, {
    callTokens: 1,
    quizPoints: 100,
    callPoints: 150,
    correctAnswers: 1,
    successfulCalls: 1,
  }),
];

const allDecided = cast.map((player) => player.id);

/* ─── Finale ─── */

const FINALISTS = ["cat-world-capitals", "cat-ancient-rome", "cat-cheese-dairy"];

const finalSeats = [
  seat(priya, { quizPoints: 500, correctAnswers: 4 }),
  seat(marcus, {
    callTokens: 0,
    quizPoints: 400,
    correctAnswers: 4,
    successfulCalls: 1,
    incorrectCalls: 1,
  }),
  seat(jo, {
    callTokens: 0,
    quizPoints: 300,
    callPoints: 300,
    correctAnswers: 2,
    successfulCalls: 2,
  }),
  seat(tal, {
    callTokens: 1,
    quizPoints: 300,
    callPoints: 150,
    correctAnswers: 3,
    successfulCalls: 1,
  }),
];

function finished(viewer: RoomPlayer | null): RoomView {
  return fixtureView(
    scored(finalSeats),
    {
      gameType: "QUIZSLOP",
      status: "FINISHED",
      phase: "FINAL",
      round: TOTAL_ROUNDS,
      totalRounds: TOTAL_ROUNDS,
    },
    mode({
      voiceLine: voiceLine("FINAL_RESULTS", 1),
      seats: finalSeats,
      final: finalResults(finalSeats),
    }),
    { viewer },
  );
}

export const quizslopFixtures: Fixture[] = [
  {
    id: "quizslop-lobby",
    label: "Lobby: picking Home Topics",
    view: fixtureView(
      cast,
      { gameType: "QUIZSLOP" },
      mode({
        voiceLine: voiceLine("LOBBY_SETUP"),
        seats: [seat(priya), seat(marcus), seat(jo)],
        lobby: {
          topics: availableCatalogTopics().map((topic) => ({
            ...publicTopic(topic.id),
            claimedBy:
              [priya, marcus, jo].find((player) => HOME_TOPICS.get(player.id) === topic.id)?.id ??
              null,
          })),
        },
      }),
    ),
  },
  {
    id: "quizslop-topic-warm-up",
    label: "Topic: warm-up round, rules on screen",
    view: playing(
      { phase: "TOPIC", round: 1 },
      mode({
        voiceLine: voiceLine("TOPIC_REVEAL_WARM_UP"),
        seats: cast.map((player) => seat(player)),
        round: round(1, "WARM_UP", "cat-solar-system"),
        callsNext: true,
      }),
    ),
  },
  {
    id: "quizslop-topic-home-turf",
    label: "Topic: the viewer's Home Turf",
    view: playing(
      { phase: "TOPIC", round: 2 },
      mode({
        voiceLine: voiceLine("TOPIC_REVEAL_HOME_TURF", 2),
        seats: afterWarmUp,
        round: homeTurf,
        callsNext: true,
      }),
    ),
  },
  {
    id: "quizslop-call",
    label: "Call Slop: two decided, viewer picking",
    view: playing(
      { phase: "CALL", round: 2 },
      mode({
        voiceLine: voiceLine("SLOP_CALL", 1),
        seats: afterCalls,
        round: homeTurf,
        calls: { decidedPlayerIds: [marcus.id, tal.id], myCall: null, list: [] },
      }),
    ),
  },
  {
    id: "quizslop-answer",
    label: "Answer: viewer was called, two locked",
    view: playing(
      { phase: "ANSWER", round: 2 },
      mode({
        voiceLine: voiceLine("ANSWER", 3),
        seats: afterCalls,
        round: homeTurf,
        calls: { decidedPlayerIds: allDecided, myCall: { targetId: null }, list: shownCalls([]) },
        answer: {
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
    id: "quizslop-reveal",
    label: "Reveal: question 2 of 3",
    view: playing(
      { phase: "REVEAL", round: 2, step: 1 },
      mode({
        voiceLine: voiceLine("QUESTION_REVEAL", 2),
        seats: afterCalls,
        round: homeTurf,
        calls: {
          decidedPlayerIds: allDecided,
          myCall: { targetId: null },
          list: shownCalls(musicReveal.slice(0, 2)),
        },
        reveal: musicReveal.slice(0, 2),
        revealTotal: 3,
      }),
    ),
  },
  {
    id: "quizslop-round-results",
    label: "Round results: one call lands, one busts",
    view: playing(
      { phase: "ROUND_RESULTS", round: 2 },
      mode({
        voiceLine: voiceLine("ROUND_RESULTS", 4),
        seats: afterRound,
        round: {
          ...homeTurf,
          settled: true,
          scores: settledScores(afterRound, musicReveal, settledCalls),
        },
        calls: { decidedPlayerIds: allDecided, myCall: { targetId: null }, list: settledCalls },
        reveal: musicReveal,
        revealTotal: 3,
      }),
    ),
  },
  {
    id: "quizslop-house-vote",
    label: "House vote: picking the finale",
    view: playing(
      { phase: "HOUSE_VOTE", round: TOTAL_ROUNDS },
      mode({
        voiceLine: voiceLine("HOUSE_VOTE", 1),
        seats: finalSeats.map((entry) => ({ ...entry, quizPoints: entry.quizPoints - 100 })),
        round: round(TOTAL_ROUNDS, "HOUSE_CHOICE", null),
        houseVote: {
          slate: FINALISTS.map(publicTopic),
          votedPlayerIds: [marcus.id, jo.id],
          myVoteTopicId: null,
        },
      }),
    ),
  },
  { id: "quizslop-finished", label: "Final results", view: finished(priya) },
  { id: "quizslop-finished-recap", label: "Final results: public recap", view: finished(null) },
];
