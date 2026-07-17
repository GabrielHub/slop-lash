import {
  DISPUTE_VOTE_SECONDS,
  DISPUTE_WINDOW_SECONDS,
  QUIZ_CORRECT_POINTS,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_SECONDS,
  TOPIC_REVEAL_SECONDS,
} from "@/games/quizslop/game-constants";
import {
  HOME_TOPICS,
  ballotFor,
  catalogQuestion,
  publicTopic,
  type QuizslopFixtureScript,
  type RevealGroupDef,
} from "./mock-quizslop-fixture-script";

export function appendQuizslopDisputeSequence(script: QuizslopFixtureScript): void {
  const {
    pushBeat,
    playerId,
    playerName,
    callTargets,
    deltas,
    settled,
    applySettlement,
    noControllers,
  } = script;
  /* ════════════════════ ROUND 4 — HOME TURF (Tal) with a batched dispute vote ════════════════════ */

  const r4Topic = publicTopic(HOME_TOPICS.P4);
  const r4InsaneQ = catalogQuestion(HOME_TOPICS.P4, "INSANE");
  const r4GroupsLive: RevealGroupDef[] = [
    {
      topicCatalogId: HOME_TOPICS.P4,
      tier: "INSANE",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P1", result: "correct" }],
    },
    {
      topicCatalogId: HOME_TOPICS.P4,
      tier: "EASY",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [
        { key: "P2", result: "correct" },
        { key: "P4", result: "wrong" },
      ],
    },
    {
      topicCatalogId: HOME_TOPICS.P4,
      tier: "HARD",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P3", result: "wrong" }],
    },
  ];
  const r4GroupsRuled: RevealGroupDef[] = [
    { ...r4GroupsLive[0]!, ruling: "UPHELD" },
    { ...r4GroupsLive[1]!, ruling: "UNCHALLENGED_VALID" },
    { ...r4GroupsLive[2]!, ruling: "PLAYER_VOIDED" },
  ];

  pushBeat({
    slug: "r4-topic-reveal",
    title: "R4: Tal's Home Turf",
    description: "Everyone is back for shark facts. Two calls are coming.",
    phase: "TOPIC_REVEAL",
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    currentRound: 4,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "TOPIC_REVEAL_HOME_TURF",
    participantsFrozen: true,
    currentTopic: r4Topic,
    topicOwnerName: playerName("P4"),
    controllers: noControllers,
  });

  pushBeat({
    slug: "r4-slop-call",
    title: "R4: Call Slop — last tokens move",
    description: "Tal stamps Jo on his own topic; Priya is lining up her final token on Marcus.",
    phase: "SLOP_CALL",
    deadlineSeconds: SLOP_CALL_SECONDS,
    currentRound: 4,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "SLOP_CALL",
    participantsFrozen: true,
    currentTopic: r4Topic,
    topicOwnerName: playerName("P4"),
    callProgress: { resolvedCount: 2, eligibleCount: 4 },
    controllers: {
      P1: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P1"),
          resolved: false,
          myTargetId: null,
          held: false,
        },
      },
      P2: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P2"),
          resolved: true,
          myTargetId: null,
          held: true,
        },
      },
      P3: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P3"),
          resolved: false,
          myTargetId: null,
          held: false,
        },
      },
      P4: {
        call: {
          eligible: true,
          targets: callTargets(["P1", "P2", "P3", "P4"], "P4"),
          resolved: true,
          myTargetId: playerId("P3"),
          held: false,
        },
      },
    },
  });

  pushBeat({
    slug: "r4-dispute-window",
    title: "R4: dispute window — first challenge lands",
    description:
      "Jo has already challenged the shark deep-cut for a wrong key; Marcus is about to file a second challenge.",
    phase: "DISPUTE_WINDOW",
    deadlineSeconds: DISPUTE_WINDOW_SECONDS,
    currentRound: 4,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "DISPUTE_WINDOW",
    participantsFrozen: true,
    currentTopic: r4Topic,
    topicOwnerName: playerName("P4"),
    revealDefs: r4GroupsLive,
    revealOrdinal: 2,
    revealTotal: 3,
    ballots: [
      ballotFor(HOME_TOPICS.P4, "HARD", {
        disputeId: "dispute-shark-hard",
        reason: "WRONG_ANSWER_KEY",
        initiator: "P3",
        votesResolved: 0,
        votersTotal: 0,
      }),
    ],
    controllers: {
      P1: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [r4InsaneQ.id, catalogQuestion(HOME_TOPICS.P4, "EASY").id],
        },
      },
      P2: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [r4InsaneQ.id, catalogQuestion(HOME_TOPICS.P4, "EASY").id],
        },
      },
      P3: { dispute: { canInitiate: false, challengeableQuestionIds: [] } },
      P4: {
        dispute: {
          canInitiate: true,
          challengeableQuestionIds: [r4InsaneQ.id, catalogQuestion(HOME_TOPICS.P4, "EASY").id],
        },
      },
    },
  });

  pushBeat({
    slug: "r4-dispute-vote",
    title: "R4: batched dispute vote",
    description:
      "Two distinct challenges settle in one vote phase. Priya has ruled on the first ballot only.",
    phase: "DISPUTE_VOTE",
    deadlineSeconds: DISPUTE_VOTE_SECONDS,
    currentRound: 4,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "DISPUTE_VOTE",
    participantsFrozen: true,
    currentTopic: r4Topic,
    topicOwnerName: playerName("P4"),
    revealDefs: r4GroupsLive,
    revealOrdinal: 2,
    revealTotal: 3,
    ballots: [
      ballotFor(HOME_TOPICS.P4, "HARD", {
        disputeId: "dispute-shark-hard",
        reason: "WRONG_ANSWER_KEY",
        initiator: "P3",
        votesResolved: 2,
        votersTotal: 4,
      }),
      ballotFor(HOME_TOPICS.P4, "INSANE", {
        disputeId: "dispute-shark-insane",
        reason: "MULTIPLE_DEFENSIBLE_ANSWERS",
        initiator: "P2",
        votesResolved: 1,
        votersTotal: 4,
      }),
    ],
    controllers: {
      P1: { myDisputeVotes: [{ disputeId: "dispute-shark-hard", choice: "VOID" }] },
      P2: { myDisputeVotes: [{ disputeId: "dispute-shark-insane", choice: "VOID" }] },
      P3: {
        myDisputeVotes: [
          { disputeId: "dispute-shark-hard", choice: "VOID" },
          { disputeId: "dispute-shark-insane", choice: "UPHOLD" },
        ],
      },
      P4: { myDisputeVotes: [] },
    },
  });

  // Settle round 4. Jo's question is voided by vote: no quiz points, no tier
  // change, Tal's call on Jo refunds. Priya's challenge-upheld question stands.
  applySettlement({
    P1: { quiz: 100, call: -150, spendToken: true, lostCall: true, answeredCorrectly: true },
    P2: { quiz: 100, spendDispute: true, answeredCorrectly: true },
    P3: { spendDispute: true },
    P4: { spendToken: true, refundToken: true },
  });

  const r4Deltas = deltas({
    P1: { quiz: 100, call: -150 },
    P2: { quiz: 100, call: 0 },
    P3: { quiz: 0, call: 0 },
    P4: { quiz: 0, call: 0 },
  });
  const r4Settled = settled([
    { caller: "P1", target: "P2", outcome: "LOST", delta: -150 },
    { caller: "P4", target: "P3", outcome: "REFUNDED", delta: 0 },
  ]);

  pushBeat({
    slug: "r4-round-results",
    title: "R4: results — one upheld, one voided",
    description:
      "The batched vote lands: the deep-cut is voided (call refunded), the challenged key on Priya's question is upheld.",
    phase: "ROUND_RESULTS",
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    currentRound: 4,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ROUND_RESULTS",
    participantsFrozen: true,
    currentTopic: r4Topic,
    topicOwnerName: playerName("P4"),
    revealDefs: r4GroupsRuled,
    revealOrdinal: 2,
    revealTotal: 3,
    ballots: [
      ballotFor(HOME_TOPICS.P4, "HARD", {
        disputeId: "dispute-shark-hard",
        reason: "WRONG_ANSWER_KEY",
        initiator: "P3",
        votesResolved: 4,
        votersTotal: 4,
        ruling: "PLAYER_VOIDED",
      }),
      ballotFor(HOME_TOPICS.P4, "INSANE", {
        disputeId: "dispute-shark-insane",
        reason: "MULTIPLE_DEFENSIBLE_ANSWERS",
        initiator: "P2",
        votesResolved: 4,
        votersTotal: 4,
        ruling: "UPHELD",
      }),
    ],
    roundDeltas: r4Deltas,
    settledCalls: r4Settled,
    controllers: noControllers,
  });
}
