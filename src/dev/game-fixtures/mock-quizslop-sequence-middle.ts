import {
  ANSWER_SECONDS,
  CONTINUITY_GRACE_SECONDS,
  QUESTION_REVEAL_SECONDS_PER_GROUP,
  QUIZ_CORRECT_POINTS,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_REVEAL_SECONDS,
  TOPIC_REVEAL_SECONDS,
} from "@/games/quizslop/game-constants";
import {
  HOME_TOPICS,
  catalogQuestion,
  publicTopic,
  wrongIndexFor,
  type QuizslopFixtureScript,
  type RevealGroupDef,
} from "./mock-quizslop-fixture-script";

export function appendQuizslopMiddleSequence(script: QuizslopFixtureScript): void {
  const {
    roster,
    pushBeat,
    playerName,
    answerFor,
    exemptAnswer,
    deltas,
    settled,
    applySettlement,
    noControllers,
  } = script;
  /* ════════════════════ ROUND 2 — HOME TURF (Jo) with a pre-answer exemption ════════════════════ */

  roster.P4.connected = false;
  const r2Topic = publicTopic(HOME_TOPICS.P3);
  const r2Groups: RevealGroupDef[] = [
    {
      topicCatalogId: HOME_TOPICS.P3,
      tier: "MEDIUM",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [
        { key: "P1", result: "correct" },
        { key: "P2", result: "wrong" },
      ],
    },
    {
      topicCatalogId: HOME_TOPICS.P3,
      tier: "EASY",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P3", result: "correct" }],
    },
  ];

  pushBeat({
    slug: "r2-topic-reveal",
    title: "R2: Jo's Home Turf",
    description:
      "Home Topic owner spotlight. Tal's phone died — he's offline before the round opens.",
    phase: "TOPIC_REVEAL",
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    currentRound: 2,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "TOPIC_REVEAL_HOME_TURF",
    participantsFrozen: true,
    currentTopic: r2Topic,
    topicOwnerName: playerName("P3"),
    controllers: noControllers,
  });

  pushBeat({
    slug: "r2-call-reveal",
    title: "R2: call reveal — everybody held",
    description: "No calls this round; the reveal beat still runs so the room stays in rhythm.",
    phase: "SLOP_CALL_REVEAL",
    deadlineSeconds: SLOP_CALL_REVEAL_SECONDS,
    currentRound: 2,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "SLOP_CALL_REVEAL",
    participantsFrozen: true,
    currentTopic: r2Topic,
    topicOwnerName: playerName("P3"),
    callReveal: [],
    controllers: noControllers,
  });

  pushBeat({
    slug: "r2-answer",
    title: "R2: answers with one exemption",
    description:
      "Tal was offline when questions went out, so he has no assignment and sits out with no penalty.",
    phase: "ANSWER",
    deadlineSeconds: ANSWER_SECONDS,
    currentRound: 2,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ANSWER",
    participantsFrozen: true,
    currentTopic: r2Topic,
    topicOwnerName: playerName("P3"),
    answerProgress: { lockedCount: 1, assignedCount: 3 },
    controllers: {
      P1: {
        answer: answerFor(HOME_TOPICS.P3, "MEDIUM", {
          selectedIndex: catalogQuestion(HOME_TOPICS.P3, "MEDIUM").correctIndex,
          locked: true,
        }),
      },
      P2: { answer: answerFor(HOME_TOPICS.P3, "MEDIUM", { selectedIndex: null, locked: false }) },
      P3: { answer: answerFor(HOME_TOPICS.P3, "EASY", { selectedIndex: null, locked: false }) },
      P4: { answer: exemptAnswer },
    },
  });

  pushBeat({
    slug: "r2-reveal-group-1",
    title: "R2: shared reveal · Question 1 of 2",
    description:
      "Hidden tiers diverged: Priya and Marcus shared this question while Jo's waits for the next turn.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 2,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: r2Topic,
    topicOwnerName: playerName("P3"),
    revealDefs: [r2Groups[0]!],
    revealOrdinal: 0,
    revealTotal: 2,
    controllers: noControllers,
  });

  pushBeat({
    slug: "r2-reveal-group-2",
    title: "R2: shared reveal · Question 2 of 2",
    description:
      "The second distinct question gets a fresh 30-second budget and becomes the hero card.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 2,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: r2Topic,
    topicOwnerName: playerName("P3"),
    revealDefs: r2Groups,
    revealOrdinal: 1,
    revealTotal: 2,
    controllers: noControllers,
  });

  applySettlement({
    P1: { quiz: 100, answeredCorrectly: true },
    P3: { quiz: 100, answeredCorrectly: true },
  });

  pushBeat({
    slug: "r2-round-results",
    title: "R2: results",
    description: "Jo cashes in on home turf; Tal's exemption means no score change for him.",
    phase: "ROUND_RESULTS",
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    currentRound: 2,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ROUND_RESULTS",
    participantsFrozen: true,
    currentTopic: r2Topic,
    topicOwnerName: playerName("P3"),
    revealDefs: r2Groups,
    revealOrdinal: 1,
    revealTotal: 2,
    roundDeltas: deltas({
      P1: { quiz: 100, call: 0 },
      P2: { quiz: 0, call: 0 },
      P3: { quiz: 100, call: 0 },
    }),
    controllers: noControllers,
  });

  /* ════════════════════ ROUND 3 — HOME TURF (Priya) with an accountable timeout ════════════════════ */

  roster.P4.connected = true;
  const r3Topic = publicTopic(HOME_TOPICS.P1);
  const r3Groups: RevealGroupDef[] = [
    {
      topicCatalogId: HOME_TOPICS.P1,
      tier: "HARD",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P1", result: "correct" }],
    },
    {
      topicCatalogId: HOME_TOPICS.P1,
      tier: "EASY",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P2", result: "timeout" }],
    },
    {
      topicCatalogId: HOME_TOPICS.P1,
      tier: "MEDIUM",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [
        { key: "P3", result: "correct" },
        { key: "P4", result: "wrong" },
      ],
    },
  ];

  pushBeat({
    slug: "r3-topic-reveal",
    title: "R3: Priya's Home Turf",
    description: "Tal is back online. Jo quietly spends a token on Marcus this round.",
    phase: "TOPIC_REVEAL",
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "TOPIC_REVEAL_HOME_TURF",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    controllers: noControllers,
  });

  pushBeat({
    slug: "r3-answer",
    title: "R3: answers — one player stalls",
    description:
      "Marcus is answer-eligible but never locks. An accountable timeout scores as incorrect.",
    phase: "ANSWER",
    deadlineSeconds: ANSWER_SECONDS,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ANSWER",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    answerProgress: { lockedCount: 3, assignedCount: 4 },
    controllers: {
      P1: {
        answer: answerFor(HOME_TOPICS.P1, "HARD", {
          selectedIndex: catalogQuestion(HOME_TOPICS.P1, "HARD").correctIndex,
          locked: true,
        }),
      },
      P2: { answer: answerFor(HOME_TOPICS.P1, "EASY", { selectedIndex: null, locked: false }) },
      P3: {
        answer: answerFor(HOME_TOPICS.P1, "MEDIUM", {
          selectedIndex: catalogQuestion(HOME_TOPICS.P1, "MEDIUM").correctIndex,
          locked: true,
        }),
      },
      P4: {
        answer: answerFor(HOME_TOPICS.P1, "MEDIUM", {
          selectedIndex: wrongIndexFor(catalogQuestion(HOME_TOPICS.P1, "MEDIUM")),
          locked: true,
        }),
      },
    },
  });

  pushBeat({
    slug: "r3-reveal-group-1",
    title: "R3: shared reveal · Question 1 of 3",
    description: "Priya's question gets its own full reveal turn before the next receipt appears.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    revealDefs: [r3Groups[0]!],
    revealOrdinal: 0,
    revealTotal: 3,
    controllers: noControllers,
  });

  pushBeat({
    slug: "r3-reveal-group-2-timeout",
    title: "R3: shared reveal · Question 2 of 3",
    description:
      "Marcus's timeout gets a full reveal turn and is marked incorrect with an icon and label, never color alone.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    revealDefs: [r3Groups[0]!, r3Groups[1]!],
    revealOrdinal: 1,
    revealTotal: 3,
    controllers: noControllers,
  });

  pushBeat({
    slug: "r3-reveal-group-3",
    title: "R3: shared reveal · Question 3 of 3",
    description:
      "The last grouped question receives the same 30-second reading budget as the first two.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    revealDefs: r3Groups,
    revealOrdinal: 2,
    revealTotal: 3,
    controllers: noControllers,
  });

  applySettlement({
    P1: { quiz: 100, answeredCorrectly: true },
    P3: { quiz: 100, call: 150, spendToken: true, wonCall: true, answeredCorrectly: true },
  });

  pushBeat({
    slug: "r3-round-results",
    title: "R3: results",
    description: "Jo's call on Marcus pays out thanks to the timeout.",
    phase: "ROUND_RESULTS",
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ROUND_RESULTS",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    revealDefs: r3Groups,
    revealOrdinal: 2,
    revealTotal: 3,
    roundDeltas: deltas({
      P1: { quiz: 100, call: 0 },
      P2: { quiz: 0, call: 0 },
      P3: { quiz: 100, call: 150 },
      P4: { quiz: 0, call: 0 },
    }),
    settledCalls: settled([{ caller: "P3", target: "P2", outcome: "WON", delta: 150 }]),
    controllers: noControllers,
  });

  /* ════════════════════ CONTINUITY GRACE ════════════════════ */

  roster.P2.connected = false;
  roster.P3.connected = false;
  roster.P4.connected = false;

  pushBeat({
    slug: "continuity-grace",
    title: "Continuity grace",
    description:
      "Three phones drop at once at the round boundary. The game waits 15 seconds for reconnects before abandoning.",
    phase: "CONTINUITY_GRACE",
    deadlineSeconds: CONTINUITY_GRACE_SECONDS,
    currentRound: 3,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "CONTINUITY_GRACE",
    participantsFrozen: true,
    currentTopic: r3Topic,
    topicOwnerName: playerName("P1"),
    roundDeltas: deltas({
      P1: { quiz: 100, call: 0 },
      P2: { quiz: 0, call: 0 },
      P3: { quiz: 100, call: 150 },
      P4: { quiz: 0, call: 0 },
    }),
    settledCalls: settled([{ caller: "P3", target: "P2", outcome: "WON", delta: 150 }]),
    controllerRoundDeltas: [],
    controllerSettledCalls: [],
    controllers: noControllers,
  });

  roster.P2.connected = true;
  roster.P3.connected = true;
  roster.P4.connected = true;
}
