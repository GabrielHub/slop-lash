import {
  ANSWER_SECONDS,
  FINAL_QUIZ_CORRECT_POINTS,
  HOUSE_VOTE_REVEAL_SECONDS,
  HOUSE_VOTE_SECONDS,
  QUESTION_REVEAL_SECONDS_PER_GROUP,
  QUIZ_CORRECT_POINTS,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_SECONDS,
  TOPIC_REVEAL_SECONDS,
} from "@/games/quizslop/game-constants";
import { computeAwards, rankFinalStandings } from "@/games/quizslop/scoring";
import type { QuizslopViewFinal } from "@/games/quizslop/ui/quizslop-view-contracts";
import {
  FINALE_WINNER_TOPIC,
  FINALIST_TOPICS,
  HOME_TOPICS,
  QUIZSLOP_FIXTURE_PLAYER_KEYS,
  catalogQuestion,
  publicTopic,
  slateEntry,
  type QuizslopFixtureScript,
  type RevealGroupDef,
} from "./mock-quizslop-fixture-script";

export function appendQuizslopFinaleSequence(script: QuizslopFixtureScript): void {
  const {
    roster,
    pushBeat,
    playerId,
    playerName,
    callTargets,
    answerFor,
    deltas,
    settled,
    applySettlement,
    noControllers,
  } = script;
  /* ════════════════════ ROUND 5 — HOME TURF (Marcus): four distinct groups ════════════════════ */

  const r5Topic = publicTopic(HOME_TOPICS.P2);
  const r5Groups: RevealGroupDef[] = [
    {
      topicCatalogId: HOME_TOPICS.P2,
      tier: "INSANE",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P1", result: "correct" }],
    },
    {
      topicCatalogId: HOME_TOPICS.P2,
      tier: "MEDIUM",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P2", result: "correct" }],
    },
    {
      topicCatalogId: HOME_TOPICS.P2,
      tier: "HARD",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P3", result: "wrong" }],
    },
    {
      topicCatalogId: HOME_TOPICS.P2,
      tier: "EASY",
      pointValue: QUIZ_CORRECT_POINTS,
      results: [{ key: "P4", result: "wrong" }],
    },
  ];

  pushBeat({
    slug: "r5-topic-reveal",
    title: "R5: Marcus's Home Turf",
    description: "Four hidden ladders have fully diverged — four different questions this round.",
    phase: "TOPIC_REVEAL",
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    currentRound: 5,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "TOPIC_REVEAL_HOME_TURF",
    participantsFrozen: true,
    currentTopic: r5Topic,
    topicOwnerName: playerName("P2"),
    controllers: noControllers,
  });

  pushBeat({
    slug: "r5-reveal-four-groups",
    title: "R5: reveal — four distinct groups",
    description:
      "Group 4 of 4 is the hero while three earlier receipts stack up. Reveal order is unrelated to hidden tier.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 5,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: r5Topic,
    topicOwnerName: playerName("P2"),
    revealDefs: r5Groups,
    revealOrdinal: 3,
    revealTotal: 4,
    controllers: noControllers,
  });

  applySettlement({
    P1: { quiz: 100, answeredCorrectly: true },
    P2: { quiz: 100, call: 150, spendToken: true, wonCall: true, answeredCorrectly: true },
  });

  pushBeat({
    slug: "r5-round-results",
    title: "R5: results",
    description: "Marcus wins his own turf and cashes his call on Tal.",
    phase: "ROUND_RESULTS",
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    currentRound: 5,
    roundKind: "HOME_TURF",
    pointValue: QUIZ_CORRECT_POINTS,
    voiceTag: "ROUND_RESULTS",
    participantsFrozen: true,
    currentTopic: r5Topic,
    topicOwnerName: playerName("P2"),
    revealDefs: r5Groups,
    revealOrdinal: 3,
    revealTotal: 4,
    roundDeltas: deltas({
      P1: { quiz: 100, call: 0 },
      P2: { quiz: 100, call: 150 },
      P3: { quiz: 0, call: 0 },
      P4: { quiz: 0, call: 0 },
    }),
    settledCalls: settled([{ caller: "P2", target: "P4", outcome: "WON", delta: 150 }]),
    controllers: noControllers,
  });

  /* ════════════════════ ROUND 6 — HOUSE CHOICE finale ════════════════════ */

  const finaleSlate = FINALIST_TOPICS.map((id) => slateEntry(id));
  const finaleTopic = publicTopic(FINALE_WINNER_TOPIC);
  const capitalsSlateId = `slate-${FINALIST_TOPICS[0]}`;
  const romeSlateId = `slate-${FINALIST_TOPICS[1]}`;
  const cheeseSlateId = `slate-${FINALIST_TOPICS[2]}`;

  pushBeat({
    slug: "r6-house-vote",
    title: "R6: final House vote",
    description:
      "Three reviewed catalog topics; the stage shows lock progress only until the vote closes.",
    phase: "HOUSE_VOTE",
    deadlineSeconds: HOUSE_VOTE_SECONDS,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "HOUSE_VOTE",
    participantsFrozen: true,
    slate: finaleSlate,
    houseVoteStage: { resolvedCount: 2, eligibleCount: 4, voteCounts: null },
    controllers: {
      P1: { houseVote: { eligible: true, myVoteTopicId: capitalsSlateId } },
      P2: { houseVote: { eligible: true, myVoteTopicId: null } },
      P3: { houseVote: { eligible: true, myVoteTopicId: cheeseSlateId } },
      P4: { houseVote: { eligible: true, myVoteTopicId: null } },
    },
  });

  pushBeat({
    slug: "r6-house-vote-reveal",
    title: "R6: vote reveal — tie broken by frozen rank",
    description:
      "Capitals and Cheese tie 2-2; the pre-frozen tie-break rank hands the finale to Cheese & Dairy.",
    phase: "HOUSE_VOTE_REVEAL",
    deadlineSeconds: HOUSE_VOTE_REVEAL_SECONDS,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "HOUSE_VOTE_REVEAL",
    participantsFrozen: true,
    slate: finaleSlate,
    currentTopic: finaleTopic,
    houseVoteStage: {
      resolvedCount: 4,
      eligibleCount: 4,
      voteCounts: [
        { topicId: capitalsSlateId, votes: 2 },
        { topicId: romeSlateId, votes: 0 },
        { topicId: cheeseSlateId, votes: 2 },
      ],
    },
    controllers: noControllers,
  });

  pushBeat({
    slug: "r6-topic-reveal",
    title: "R6: FINALE marquee",
    description: "The stage announces the 200-point finale.",
    phase: "TOPIC_REVEAL",
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "TOPIC_REVEAL_HOUSE_CHOICE",
    participantsFrozen: true,
    currentTopic: finaleTopic,
    controllers: noControllers,
  });

  pushBeat({
    slug: "r6-slop-call",
    title: "R6: finale calls — tokens or nothing",
    description:
      "Priya and Marcus are out of tokens, so HOLD is their only move. Tal spends his refunded token on Jo.",
    phase: "SLOP_CALL",
    deadlineSeconds: SLOP_CALL_SECONDS,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "SLOP_CALL",
    participantsFrozen: true,
    currentTopic: finaleTopic,
    callProgress: { resolvedCount: 1, eligibleCount: 4 },
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
          resolved: false,
          myTargetId: null,
          held: false,
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

  const r6Groups: RevealGroupDef[] = [
    {
      topicCatalogId: FINALE_WINNER_TOPIC,
      tier: "INSANE",
      pointValue: FINAL_QUIZ_CORRECT_POINTS,
      results: [{ key: "P1", result: "correct" }],
    },
    {
      topicCatalogId: FINALE_WINNER_TOPIC,
      tier: "HARD",
      pointValue: FINAL_QUIZ_CORRECT_POINTS,
      results: [{ key: "P2", result: "correct" }],
    },
    {
      topicCatalogId: FINALE_WINNER_TOPIC,
      tier: "MEDIUM",
      pointValue: FINAL_QUIZ_CORRECT_POINTS,
      results: [{ key: "P3", result: "wrong" }],
    },
    {
      topicCatalogId: FINALE_WINNER_TOPIC,
      tier: "EASY",
      pointValue: FINAL_QUIZ_CORRECT_POINTS,
      results: [{ key: "P4", result: "correct" }],
    },
  ];

  pushBeat({
    slug: "r6-answer",
    title: "R6: finale answers",
    description: "Every correct finale answer is worth 200. The stage still shows only progress.",
    phase: "ANSWER",
    deadlineSeconds: ANSWER_SECONDS,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "ANSWER",
    participantsFrozen: true,
    currentTopic: finaleTopic,
    answerProgress: { lockedCount: 3, assignedCount: 4 },
    controllers: {
      P1: {
        answer: answerFor(FINALE_WINNER_TOPIC, "INSANE", {
          selectedIndex: catalogQuestion(FINALE_WINNER_TOPIC, "INSANE").correctIndex,
          locked: true,
        }),
      },
      P2: {
        answer: answerFor(FINALE_WINNER_TOPIC, "HARD", {
          selectedIndex: catalogQuestion(FINALE_WINNER_TOPIC, "HARD").correctIndex,
          locked: true,
        }),
      },
      P3: {
        answer: answerFor(FINALE_WINNER_TOPIC, "MEDIUM", { selectedIndex: null, locked: false }),
      },
      P4: {
        answer: answerFor(FINALE_WINNER_TOPIC, "EASY", {
          selectedIndex: catalogQuestion(FINALE_WINNER_TOPIC, "EASY").correctIndex,
          locked: true,
        }),
      },
    },
  });

  pushBeat({
    slug: "r6-reveal",
    title: "R6: finale reveal — +200 receipts",
    description: "Four groups again; correct finale answers land 200 apiece.",
    phase: "QUESTION_REVEAL",
    deadlineSeconds: QUESTION_REVEAL_SECONDS_PER_GROUP,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "QUESTION_REVEAL",
    participantsFrozen: true,
    currentTopic: finaleTopic,
    revealDefs: r6Groups,
    revealOrdinal: 3,
    revealTotal: 4,
    controllers: noControllers,
  });

  applySettlement({
    P1: { quiz: 200, answeredCorrectly: true },
    P2: { quiz: 200, answeredCorrectly: true },
    P4: { quiz: 200, call: 150, spendToken: true, wonCall: true, answeredCorrectly: true },
  });

  pushBeat({
    slug: "r6-round-results",
    title: "R6: finale results",
    description: "Double points settle; Tal's finale call on Jo pays 150.",
    phase: "ROUND_RESULTS",
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "ROUND_RESULTS",
    participantsFrozen: true,
    currentTopic: finaleTopic,
    revealDefs: r6Groups,
    revealOrdinal: 3,
    revealTotal: 4,
    roundDeltas: deltas({
      P1: { quiz: 200, call: 0 },
      P2: { quiz: 200, call: 0 },
      P3: { quiz: 0, call: 0 },
      P4: { quiz: 200, call: 150 },
    }),
    settledCalls: settled([{ caller: "P4", target: "P3", outcome: "WON", delta: 150 }]),
    controllers: noControllers,
  });

  /* ════════════════════ FINAL RESULTS ════════════════════ */

  const { ordered, winnerIds } = rankFinalStandings(
    QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => ({
      playerId: playerId(key),
      total: roster[key].total,
      quizSubtotal: roster[key].quizSubtotal,
      successfulCalls: roster[key].successfulCalls,
    })),
  );
  const winnerSet = new Set(winnerIds);
  const nameById = new Map(
    QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => [playerId(key), playerName(key)]),
  );
  const finalPayload: QuizslopViewFinal = {
    standings: ordered.map((entry) => ({
      playerId: entry.playerId,
      name: nameById.get(entry.playerId) ?? "Player",
      total: entry.total,
      quizSubtotal: entry.quizSubtotal,
      successfulCalls: entry.successfulCalls,
      winner: winnerSet.has(entry.playerId),
    })),
    awards: computeAwards(
      QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => ({
        playerId: playerId(key),
        name: playerName(key),
        successfulCalls: roster[key].successfulCalls,
        incorrectCalls: roster[key].incorrectCalls,
        correctAnswers: roster[key].correctAnswers,
      })),
    ).map((award) => ({ ...award, recipients: [...award.recipients] })),
  };

  pushBeat({
    slug: "final-results",
    title: "Final: winner + deterministic awards",
    description:
      "Priya takes it. Transparent tie facts under every standing, and all three comedy awards with their stats.",
    phase: "FINAL_RESULTS",
    deadlineSeconds: null,
    currentRound: 6,
    roundKind: "HOUSE_CHOICE",
    pointValue: FINAL_QUIZ_CORRECT_POINTS,
    voiceTag: "FINAL_RESULTS",
    participantsFrozen: true,
    currentTopic: finaleTopic,
    final: finalPayload,
    controllers: noControllers,
  });
}
