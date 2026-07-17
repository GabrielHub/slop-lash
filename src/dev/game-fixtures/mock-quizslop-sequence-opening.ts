import {
  ANSWER_SECONDS,
  DISPUTE_WINDOW_SECONDS,
  QUESTION_REVEAL_SECONDS_PER_GROUP,
  QUIZ_CORRECT_POINTS,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_REVEAL_SECONDS,
  SLOP_CALL_SECONDS,
  TOPIC_REVEAL_SECONDS,
} from "@/games/quizslop/game-constants";
import type { QuizslopTopicSetupState } from "@/games/quizslop/types";
import type { QuizslopStageViewPayload } from "@/games/quizslop/ui/quizslop-view-contracts";
import {
  HOME_TOPICS,
  QUIZSLOP_FIXTURE_PLAYER_KEYS,
  WARMUP_TOPIC,
  catalogQuestion,
  offerFor,
  publicTopic,
  type QuizslopFixturePlayerKey,
  type QuizslopFixtureScript,
  type RevealGroupDef,
} from "./mock-quizslop-fixture-script";

export function appendQuizslopOpeningSequence(script: QuizslopFixtureScript): void {
  const {
    roster,
    pushBeat,
    playerId,
    playerName,
    callTargets,
    callReveal,
    answerFor,
    deltas,
    settled,
    applySettlement,
    noControllers,
  } = script;
  /* ════════════════════ LOBBY ════════════════════ */

  const lobbyStatuses = (
    states: Record<QuizslopFixturePlayerKey, QuizslopTopicSetupState>,
  ): NonNullable<QuizslopStageViewPayload["lobby"]>["statuses"] =>
    QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => ({
      playerId: playerId(key),
      name: playerName(key),
      connected: roster[key].connected,
      state: states[key],
    }));

  const lobbyControllerBase = {
    P1: {
      myTopicState: "READY" as const,
      myTopic: publicTopic(HOME_TOPICS.P1),
      myCatalogTopicId: HOME_TOPICS.P1,
      offers: [
        offerFor(HOME_TOPICS.P1),
        offerFor("cat-world-flags"),
        offerFor("cat-olympic-games"),
      ],
    },
    P2: {
      myTopicState: "NEEDS_TOPIC" as const,
      myTopic: null,
      myCatalogTopicId: null,
      offers: [
        offerFor(HOME_TOPICS.P2),
        offerFor("cat-ancient-egypt"),
        offerFor("cat-world-flags"),
      ],
    },
    P3: {
      myTopicState: "READY" as const,
      myTopic: publicTopic(HOME_TOPICS.P3),
      myCatalogTopicId: HOME_TOPICS.P3,
      offers: [
        offerFor(HOME_TOPICS.P3),
        offerFor("cat-ancient-egypt"),
        offerFor("cat-olympic-games"),
      ],
    },
    P4: {
      myTopicState: "NEEDS_TOPIC" as const,
      myTopic: null,
      myCatalogTopicId: null,
      offers: [
        offerFor(HOME_TOPICS.P4),
        offerFor("cat-olympic-games"),
        offerFor("cat-ancient-egypt"),
      ],
    },
  };

  pushBeat({
    slug: "lobby-setup",
    title: "Lobby: topics locking in",
    description: "Priya and Jo confirmed catalog Home Topics; Marcus and Tal are still picking.",
    phase: "LOBBY_SETUP",
    deadlineSeconds: null,
    currentRound: 0,
    roundKind: null,
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "LOBBY_SETUP",
    participantsFrozen: false,
    stageLobby: {
      statuses: lobbyStatuses({ P1: "READY", P2: "NEEDS_TOPIC", P3: "READY", P4: "NEEDS_TOPIC" }),
      canStart: false,
      minPlayers: 2,
    },
    controllers: {
      P1: { lobby: { ...lobbyControllerBase.P1, everyoneReady: false, canStart: false } },
      P2: { lobby: { ...lobbyControllerBase.P2, everyoneReady: false, canStart: false } },
      P3: { lobby: { ...lobbyControllerBase.P3, everyoneReady: false, canStart: false } },
      P4: { lobby: { ...lobbyControllerBase.P4, everyoneReady: false, canStart: false } },
    },
  });

  pushBeat({
    slug: "lobby-ready",
    title: "Lobby: everyone ready",
    description: "All four Home Topics are confirmed; the host can start the show.",
    phase: "LOBBY_SETUP",
    deadlineSeconds: null,
    currentRound: 0,
    roundKind: null,
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "LOBBY_SETUP",
    participantsFrozen: false,
    stageLobby: {
      statuses: lobbyStatuses({ P1: "READY", P2: "READY", P3: "READY", P4: "READY" }),
      canStart: true,
      minPlayers: 2,
    },
    controllers: {
      P1: { lobby: { ...lobbyControllerBase.P1, everyoneReady: true, canStart: true } },
      P2: {
        lobby: {
          ...lobbyControllerBase.P2,
          myTopicState: "READY",
          myTopic: publicTopic(HOME_TOPICS.P2),
          myCatalogTopicId: HOME_TOPICS.P2,
          everyoneReady: true,
          canStart: false,
        },
      },
      P3: { lobby: { ...lobbyControllerBase.P3, everyoneReady: true, canStart: false } },
      P4: {
        lobby: {
          ...lobbyControllerBase.P4,
          myTopicState: "READY",
          myTopic: publicTopic(HOME_TOPICS.P4),
          myCatalogTopicId: HOME_TOPICS.P4,
          everyoneReady: true,
          canStart: false,
        },
      },
    },
  });

  /* ════════════════════ ROUND 1 — WARM-UP (everyone on the same EASY question) ════════════════════ */

  const warmupTopic = publicTopic(WARMUP_TOPIC);
  const r1Group: RevealGroupDef = {
    topicCatalogId: WARMUP_TOPIC,
    tier: "EASY",
    pointValue: QUIZ_CORRECT_POINTS,
    results: [
      { key: "P1", result: "correct" },
      { key: "P2", result: "correct" },
      { key: "P3", result: "wrong" },
      { key: "P4", result: "correct" },
    ],
  };

  pushBeat({
    slug: "r1-topic-reveal",
    title: "R1: warm-up topic reveal",
    description: "Server-selected warm-up marquee. Everyone will get the same Easy question.",
    phase: "TOPIC_REVEAL",
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "TOPIC_REVEAL_WARM_UP",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    controllers: noControllers,
  });

  pushBeat({
    slug: "r1-slop-call",
    title: "R1: Call Slop window",
    description:
      "Stage shows lock progress only. Priya already stamped Jo, Jo is holding, Marcus and Tal are deciding.",
    phase: "SLOP_CALL",
    deadlineSeconds: SLOP_CALL_SECONDS,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "SLOP_CALL",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    callProgress: { resolvedCount: 2, eligibleCount: 4 },
    controllers: {
      P1: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P1"),
          resolved: true,
          myTargetId: playerId("P3"),
          held: false,
        },
      },
      P2: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P2"),
          resolved: false,
          myTargetId: null,
          held: false,
        },
      },
      P3: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P3"),
          resolved: true,
          myTargetId: null,
          held: true,
        },
      },
      P4: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P4"),
          resolved: false,
          myTargetId: null,
          held: false,
        },
      },
    },
  });

  pushBeat({
    slug: "r1-call-reveal",
    title: "R1: call reveal — two callers on one target",
    description: "Simultaneous stamps: Priya and Tal both called Jo; Marcus called Priya; Jo held.",
    phase: "SLOP_CALL_REVEAL",
    deadlineSeconds: SLOP_CALL_REVEAL_SECONDS,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "SLOP_CALL_REVEAL",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    callReveal: callReveal([
      ["P1", "P3"],
      ["P4", "P3"],
      ["P2", "P1"],
    ]),
    controllers: noControllers,
  });

  pushBeat({
    slug: "r1-answer",
    title: "R1: private answers",
    description:
      "Everyone has the same Easy warm-up question on their phone. The stage shows progress only — never the question.",
    phase: "ANSWER",
    deadlineSeconds: ANSWER_SECONDS,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ANSWER",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    answerProgress: { lockedCount: 2, assignedCount: 4 },
    controllers: {
      P1: {
        answer: answerFor(WARMUP_TOPIC, "EASY", {
          selectedIndex: catalogQuestion(WARMUP_TOPIC, "EASY").correctIndex,
          locked: true,
        }),
      },
      P2: { answer: answerFor(WARMUP_TOPIC, "EASY", { selectedIndex: null, locked: false }) },
      P3: { answer: answerFor(WARMUP_TOPIC, "EASY", { selectedIndex: null, locked: false }) },
      P4: {
        answer: answerFor(WARMUP_TOPIC, "EASY", {
          selectedIndex: catalogQuestion(WARMUP_TOPIC, "EASY").correctIndex,
          locked: true,
        }),
      },
    },
  });

  pushBeat({
    slug: "r1-question-reveal",
    title: "R1: shared reveal — one group",
    description: "One shared question receipt: Jo missed; Priya, Marcus, and Tal got it.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    revealDefs: [r1Group],
    revealOrdinal: 0,
    revealTotal: 1,
    controllers: noControllers,
  });

  pushBeat({
    slug: "r1-dispute-window",
    title: "R1: dispute window (quiet)",
    description: "Nobody challenges the warm-up. Controllers show the low-key challenge entry.",
    phase: "DISPUTE_WINDOW",
    deadlineSeconds: DISPUTE_WINDOW_SECONDS,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "DISPUTE_WINDOW",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    revealDefs: [r1Group],
    revealOrdinal: 0,
    revealTotal: 1,
    controllers: {
      P1: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [catalogQuestion(WARMUP_TOPIC, "EASY").id],
        },
      },
      P2: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [catalogQuestion(WARMUP_TOPIC, "EASY").id],
        },
      },
      P3: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [catalogQuestion(WARMUP_TOPIC, "EASY").id],
        },
      },
      P4: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [catalogQuestion(WARMUP_TOPIC, "EASY").id],
        },
      },
    },
  });

  // Settle round 1: quiz + calls (P1 won on Jo, P4 won on Jo, P2 lost on Priya).
  applySettlement({
    P1: { quiz: 100, call: 150, spendToken: true, wonCall: true, answeredCorrectly: true },
    P2: { quiz: 100, call: -150, spendToken: true, lostCall: true, answeredCorrectly: true },
    P3: {},
    P4: { quiz: 100, call: 150, spendToken: true, wonCall: true, answeredCorrectly: true },
  });

  const r1Deltas = deltas({
    P1: { quiz: 100, call: 150 },
    P2: { quiz: 100, call: -150 },
    P3: { quiz: 0, call: 0 },
    P4: { quiz: 100, call: 150 },
  });
  const r1Settled = settled([
    { caller: "P1", target: "P3", outcome: "WON", delta: 150 },
    { caller: "P4", target: "P3", outcome: "WON", delta: 150 },
    { caller: "P2", target: "P1", outcome: "LOST", delta: -150 },
  ]);

  pushBeat({
    slug: "r1-round-results",
    title: "R1: results",
    description: "Warm-up settles: both calls on Jo paid out; Marcus's call on Priya backfired.",
    phase: "ROUND_RESULTS",
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    currentRound: 1,
    roundKind: "WARM_UP",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ROUND_RESULTS",
    participantsFrozen: true,
    currentTopic: warmupTopic,
    revealDefs: [r1Group],
    revealOrdinal: 0,
    revealTotal: 1,
    roundDeltas: r1Deltas,
    settledCalls: r1Settled,
    controllers: noControllers,
  });
}
