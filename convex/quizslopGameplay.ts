import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  listBoundaryActivePlayerIds,
  listDisputeVotes,
  listEligibility,
  listQuestionsForTopic,
  listQuizslopParticipants,
  listRoundAssignments,
  listRoundCalls,
  listRoundDisputes,
  listRoundHouseVotes,
  loadQuizslopRoundByOrdinal,
} from "./quizslopData";
import { auditQuestionGroups } from "./quizslopIntegrity";
import {
  isTerminalQuizslopPhase,
  transitionQuizslopPhase,
  type QuizslopEngineBundle,
} from "./quizslopLifecycle";
import { MIN_CONTINUING_PLAYERS } from "../src/games/core/game-rules";
import {
  ANSWER_SECONDS,
  CONTINUITY_GRACE_SECONDS,
  DISPUTE_VOTE_SECONDS,
  HOUSE_VOTE_REVEAL_SECONDS,
  HOUSE_VOTE_SECONDS,
  QUESTION_REVEAL_SECONDS_PER_GROUP,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_REVEAL_SECONDS,
  SLOP_CALL_SECONDS,
  TOPIC_REVEAL_SECONDS,
} from "../src/games/quizslop/game-constants";
import { applyLadderResult } from "../src/games/quizslop/difficulty";
import { resolveHouseVote } from "../src/games/quizslop/deck";
import { disputesInRulingOrder, resolveDisputeBallot } from "../src/games/quizslop/disputes";
import {
  settleRound,
  type RoundSettlementInput,
  type SettlementAssignment,
} from "../src/games/quizslop/scoring";
import { stableHash } from "../src/games/quizslop/voice";
import type { QuizslopPhase, QuizslopQuestionRuling } from "../src/games/quizslop/types";

/**
 * Transactional QuizSlop gameplay. Setup/materialization and shared lifecycle
 * writes live in focused modules; this file owns only round progression,
 * settlement, continuity, and quorum advancement.
 */
async function loadCurrentRound(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
): Promise<Doc<"quizSlopRounds">> {
  const round = await loadQuizslopRoundByOrdinal(ctx, bundle.game._id, bundle.state.deckPosition);
  if (!round) throw new ConvexError("QuizSlop round is missing for the current deck position");
  return round;
}

async function snapshotEligibility(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  kind: Doc<"quizSlopEligibility">["kind"],
  now: number,
): Promise<{ eligible: Set<Id<"players">>; participants: Doc<"quizSlopParticipants">[] }> {
  const [boundaryActive, participants] = await Promise.all([
    listBoundaryActivePlayerIds(ctx, bundle.game._id),
    listQuizslopParticipants(ctx, bundle.game._id),
  ]);
  const eligiblePlayerIds = participants
    .filter((participant) => boundaryActive.has(participant.playerId))
    .map((participant) => participant.playerId);
  await Promise.all(
    eligiblePlayerIds.map((playerId) =>
      ctx.db.insert("quizSlopEligibility", {
        gameId: bundle.game._id,
        roundId: round._id,
        kind,
        phaseGeneration: bundle.game.phaseGeneration + 1,
        playerId,
        snapshotAt: now,
      }),
    ),
  );
  return { eligible: new Set(eligiblePlayerIds), participants };
}

async function openSlopCall(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  await snapshotEligibility(ctx, bundle, round, "CALL", now);
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "SLOP_CALL",
    now,
    deadlineSeconds: SLOP_CALL_SECONDS,
    roundKind: round.kind,
  });
}

async function closeSlopCall(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  // Missing choices default to hold; persist the hold so reveal is complete.
  const [eligibility, calls] = await Promise.all([
    listEligibility(ctx, round._id, "CALL"),
    listRoundCalls(ctx, round._id),
  ]);
  const resolved = new Set(calls.map((call) => call.callerId));
  await Promise.all(
    eligibility
      .filter((entry) => !resolved.has(entry.playerId))
      .map((entry) =>
        ctx.db.insert("quizSlopCalls", {
          gameId: bundle.game._id,
          roundId: round._id,
          callerId: entry.playerId,
          lockedAt: now,
        }),
      ),
  );
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "SLOP_CALL_REVEAL",
    now,
    deadlineSeconds: SLOP_CALL_REVEAL_SECONDS,
    roundKind: round.kind,
  });
}

async function openAnswer(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  if (!round.topicId) throw new ConvexError("QuizSlop round has no topic to answer");
  const { eligible, participants } = await snapshotEligibility(ctx, bundle, round, "ANSWER", now);
  const questions = await listQuestionsForTopic(ctx, round.topicId);
  const questionByTier = new Map(questions.map((question) => [question.tier, question]));
  const assignmentRows = participants
    .filter((participant) => eligible.has(participant.playerId))
    .map((participant) => {
      const question = questionByTier.get(participant.hiddenTier);
      if (!question) {
        throw new ConvexError("QuizSlop pack is missing a tier question at assignment");
      }
      return { participant, question };
    });
  await Promise.all(
    assignmentRows.map(({ participant, question }) =>
      ctx.db.insert("quizSlopAssignments", {
        gameId: bundle.game._id,
        roundId: round._id,
        playerId: participant.playerId,
        questionId: question._id,
        tierAtAssignment: participant.hiddenTier,
        assignedAt: now,
      }),
    ),
  );
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "ANSWER",
    now,
    deadlineSeconds: ANSWER_SECONDS,
    roundKind: round.kind,
  });
}

async function closeAnswer(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  const assignments = await listRoundAssignments(ctx, round._id);
  await Promise.all(
    assignments
      .filter((assignment) => assignment.lockedAt === undefined && assignment.timedOut !== true)
      .map((assignment) => ctx.db.patch("quizSlopAssignments", assignment._id, { timedOut: true })),
  );
  if (assignments.length === 0) {
    await settleRoundAndShowResults(ctx, bundle, round, now);
    return;
  }

  // Freeze a reveal order unrelated to hidden tier, and detect integrity
  // faults before any group becomes public.
  const distinctQuestionIds = [...new Set(assignments.map((entry) => entry.questionId))];
  const { systemVoidQuestionIds } = await auditQuestionGroups(
    ctx,
    bundle.game._id,
    round,
    assignments,
  );
  const revealQuestionIds = distinctQuestionIds.toSorted((left, right) => {
    const leftHash = stableHash(`${bundle.game._id}:${round._id}:${left}`);
    const rightHash = stableHash(`${bundle.game._id}:${round._id}:${right}`);
    return leftHash - rightHash || left.localeCompare(right);
  });
  await ctx.db.patch("quizSlopRounds", round._id, {
    revealQuestionIds,
    ...(systemVoidQuestionIds.length > 0
      ? { systemVoidQuestionIds: [...systemVoidQuestionIds] }
      : {}),
  });
  // A challenge is an escape hatch inside the shared reveal, not a mandatory
  // fifth beat. Freeze its roster before the first answer group becomes public.
  await snapshotEligibility(ctx, bundle, round, "DISPUTE_WINDOW", now);
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "QUESTION_REVEAL",
    now,
    // The first shared reveal finishes the walkthrough. Let the host hold it
    // as long as the room needs; later groups still get a generous full turn.
    deadlineSeconds: round.kind === "WARM_UP" ? null : QUESTION_REVEAL_SECONDS_PER_GROUP,
    revealOrdinal: 0,
    roundKind: round.kind,
  });
}

async function advanceQuestionReveal(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  const groups = round.revealQuestionIds ?? [];
  const nextOrdinal = bundle.state.revealOrdinal + 1;
  if (nextOrdinal < groups.length) {
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "QUESTION_REVEAL",
      now,
      deadlineSeconds: round.kind === "WARM_UP" ? null : QUESTION_REVEAL_SECONDS_PER_GROUP,
      revealOrdinal: nextOrdinal,
      roundKind: round.kind,
    });
    return;
  }
  await openRulingsOrSettle(ctx, bundle, round, now);
}

async function openRulingsOrSettle(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  const open = disputesInRulingOrder(await listRoundDisputes(ctx, round._id));
  if (open.length === 0) {
    await settleRoundAndShowResults(ctx, bundle, round, now);
    return;
  }
  const { eligible: voters } = await snapshotEligibility(ctx, bundle, round, "DISPUTE_VOTE", now);
  await Promise.all(
    open.map((dispute) =>
      ctx.db.patch("quizSlopDisputes", dispute._id, { frozenVoterCount: voters.size }),
    ),
  );
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "DISPUTE_VOTE",
    now,
    deadlineSeconds: DISPUTE_VOTE_SECONDS,
    revealOrdinal: 0,
    roundKind: round.kind,
  });
}

async function advanceDisputeVote(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  const open = disputesInRulingOrder(await listRoundDisputes(ctx, round._id));
  const nextOrdinal = bundle.state.revealOrdinal + 1;
  if (nextOrdinal < open.length) {
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "DISPUTE_VOTE",
      now,
      deadlineSeconds: DISPUTE_VOTE_SECONDS,
      revealOrdinal: nextOrdinal,
      roundKind: round.kind,
    });
    return;
  }
  await settleRoundAndShowResults(ctx, bundle, round, now);
}

async function settleOpenDisputes(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  roundId: Id<"quizSlopRounds">,
  systemVoid: ReadonlySet<Id<"quizSlopQuestions">>,
  now: number,
): Promise<void> {
  const disputes = await listRoundDisputes(ctx, roundId);
  const voteEntries = await Promise.all(
    disputes
      .filter((dispute) => dispute.ruling === undefined && !systemVoid.has(dispute.questionId))
      .map(async (dispute) => [dispute._id, await listDisputeVotes(ctx, dispute._id)] as const),
  );
  const votesByDispute = new Map(voteEntries);
  await Promise.all(
    disputes.map(async (dispute) => {
      if (dispute.ruling !== undefined) return;
      if (systemVoid.has(dispute.questionId)) {
        // A known-broken record is never put to a player vote. Restore the
        // initiator's dispute token exactly once.
        const [, participant] = await Promise.all([
          ctx.db.patch("quizSlopDisputes", dispute._id, {
            ruling: "SYSTEM_VOID",
            settledAt: now,
          }),
          ctx.db
            .query("quizSlopParticipants")
            .withIndex("by_gameId_and_playerId", (index) =>
              index.eq("gameId", bundle.game._id).eq("playerId", dispute.initiatorId),
            )
            .unique(),
        ]);
        if (participant && !participant.disputeAvailable) {
          await ctx.db.patch("quizSlopParticipants", participant._id, { disputeAvailable: true });
        }
        return;
      }
      const votes = votesByDispute.get(dispute._id) ?? [];
      const ruling = resolveDisputeBallot(
        votes.map((vote) => vote.choice),
        dispute.frozenVoterCount ?? 0,
      );
      await ctx.db.patch("quizSlopDisputes", dispute._id, { ruling, settledAt: now });
    }),
  );
}

/**
 * Settlement: applies every valid answer, Call Slop delta, refund, and hidden
 * ladder update exactly once through the unique-key score-event ledger, then
 * shows round results. `round.settledAt` is the transaction-level guard.
 */
async function settleRoundAndShowResults(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  if (round.settledAt === undefined) {
    const assignments = await listRoundAssignments(ctx, round._id);
    const integrity = await auditQuestionGroups(
      ctx,
      bundle.game._id,
      round,
      assignments,
      round.revealQuestionIds ?? [],
    );
    const systemVoid = new Set([
      ...(round.systemVoidQuestionIds ?? []),
      ...integrity.systemVoidQuestionIds,
    ]);
    if (systemVoid.size !== (round.systemVoidQuestionIds?.length ?? 0)) {
      await ctx.db.patch("quizSlopRounds", round._id, {
        systemVoidQuestionIds: [...systemVoid],
      });
    }
    await settleOpenDisputes(ctx, bundle, round._id, systemVoid, now);

    const [calls, disputes, participants] = await Promise.all([
      listRoundCalls(ctx, round._id),
      listRoundDisputes(ctx, round._id),
      listQuizslopParticipants(ctx, bundle.game._id),
    ]);
    const distinctQuestionIds = [...new Set(assignments.map((entry) => entry.questionId))];
    const rulingByQuestion: Record<string, QuizslopQuestionRuling> = {};
    for (const questionId of distinctQuestionIds) {
      if (systemVoid.has(questionId)) {
        rulingByQuestion[questionId] = "SYSTEM_VOID";
        continue;
      }
      const dispute = disputes.find((entry) => entry.questionId === questionId);
      rulingByQuestion[questionId] =
        dispute?.ruling === "PLAYER_VOIDED"
          ? "PLAYER_VOIDED"
          : dispute?.ruling === "UPHELD"
            ? "UPHELD"
            : "UNCHALLENGED_VALID";
    }

    const settlementInput: RoundSettlementInput<Id<"players">, Id<"quizSlopQuestions">> = {
      isFinalRound: round.kind === "HOUSE_CHOICE",
      assignments: assignments.map(
        (assignment): SettlementAssignment<Id<"players">, Id<"quizSlopQuestions">> => ({
          playerId: assignment.playerId,
          questionId: assignment.questionId,
          selectedIndex:
            assignment.lockedAt !== undefined ? (assignment.selectedIndex ?? null) : null,
          correctIndex: integrity.questionById.get(assignment.questionId)?.correctIndex ?? -1,
        }),
      ),
      rulings: rulingByQuestion,
      calls: calls.flatMap((call) =>
        call.targetId === undefined ? [] : [{ callerId: call.callerId, targetId: call.targetId }],
      ),
    };
    const settlement = settleRound(settlementInput);

    const participantByPlayer = new Map(
      participants.map((participant) => [participant.playerId, participant]),
    );
    const writeScoreEvent = async (
      playerId: Id<"players">,
      key: string,
      kind: "QUIZ" | "CALL",
      delta: number,
    ): Promise<void> => {
      const existing = await ctx.db
        .query("quizSlopScoreEvents")
        .withIndex("by_gameId_and_key", (index) =>
          index.eq("gameId", bundle.game._id).eq("key", key),
        )
        .unique();
      if (existing) return;
      await ctx.db.insert("quizSlopScoreEvents", {
        gameId: bundle.game._id,
        playerId,
        roundId: round._id,
        key,
        kind,
        delta,
        createdAt: now,
      });
    };

    await Promise.all(
      settlement.players.map(async (playerResult) => {
        const participant = participantByPlayer.get(playerResult.playerId);
        if (!participant) return;
        const scoreEventWrites: Promise<void>[] = [];
        if (playerResult.quizDelta !== 0) {
          scoreEventWrites.push(
            writeScoreEvent(
              participant.playerId,
              `quiz:${round._id}:${participant.playerId}`,
              "QUIZ",
              playerResult.quizDelta,
            ),
          );
        }
        if (playerResult.callDelta !== 0) {
          scoreEventWrites.push(
            writeScoreEvent(
              participant.playerId,
              `call:${round._id}:${participant.playerId}`,
              "CALL",
              playerResult.callDelta,
            ),
          );
        }
        await Promise.all(scoreEventWrites);
        const quizSubtotal = participant.quizSubtotal + playerResult.quizDelta;
        const callSubtotal = participant.callSubtotal + playerResult.callDelta;
        await Promise.all([
          ctx.db.patch("quizSlopParticipants", participant._id, {
            hiddenTier: applyLadderResult(participant.hiddenTier, playerResult.ladderResult),
            quizSubtotal,
            callSubtotal,
            total: quizSubtotal + callSubtotal,
            callTokens: participant.callTokens + playerResult.tokensRefunded,
            ...(playerResult.answeredCorrectly === true
              ? { correctAnswers: participant.correctAnswers + 1 }
              : {}),
          }),
          // Mirror the mode total to the shared score for platform compatibility;
          // the ledger and subtotals remain the scoring authority.
          ctx.db.patch("players", participant.playerId, {
            score: quizSubtotal + callSubtotal,
          }),
        ]);
      }),
    );

    await Promise.all(
      settlement.calls.map(async (callResult) => {
        const row = calls.find(
          (call) => call.callerId === callResult.callerId && call.targetId === callResult.targetId,
        );
        if (!row || row.settledAt !== undefined) return;
        const caller = participantByPlayer.get(callResult.callerId);
        const callerUpdate =
          caller && callResult.outcome !== "REFUNDED"
            ? ctx.db.patch(
                "quizSlopParticipants",
                caller._id,
                callResult.outcome === "WON"
                  ? { successfulCalls: caller.successfulCalls + 1 }
                  : { incorrectCalls: caller.incorrectCalls + 1 },
              )
            : Promise.resolve();
        await Promise.all([
          ctx.db.patch("quizSlopCalls", row._id, {
            outcome: callResult.outcome,
            callDelta: callResult.callDelta,
            tokenRefunded: callResult.tokenRefunded,
            settledAt: now,
          }),
          callerUpdate,
        ]);
      }),
    );

    const resultByPlayer = new Map(settlement.players.map((result) => [result.playerId, result]));
    await Promise.all([
      ...assignments.map((assignment) => {
        const playerResult = resultByPlayer.get(assignment.playerId);
        return ctx.db.patch("quizSlopAssignments", assignment._id, {
          ...(playerResult !== undefined && playerResult.answeredCorrectly !== null
            ? { correct: playerResult.answeredCorrectly }
            : {}),
          quizDelta: playerResult?.quizDelta ?? 0,
        });
      }),
      ctx.db.patch("quizSlopRounds", round._id, {
        rulings: distinctQuestionIds.map((questionId) => ({
          questionId,
          ruling: rulingByQuestion[questionId] ?? "UNCHALLENGED_VALID",
        })),
        settledAt: now,
      }),
    ]);
  }

  await transitionQuizslopPhase(ctx, bundle, {
    phase: "ROUND_RESULTS",
    now,
    deadlineSeconds: ROUND_RESULTS_SECONDS,
    roundKind: round.kind,
  });
}

async function openNextRound(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const nextDeckPosition = bundle.state.deckPosition + 1;
  const nextRound = await loadQuizslopRoundByOrdinal(ctx, bundle.game._id, nextDeckPosition);
  if (!nextRound) throw new ConvexError("QuizSlop deck is missing the next round");
  if (nextRound.kind === "HOUSE_CHOICE") {
    // Snapshot the voter roster as the phase opens.
    await snapshotEligibility(ctx, bundle, nextRound, "HOUSE_VOTE", now);
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "HOUSE_VOTE",
      now,
      deadlineSeconds: HOUSE_VOTE_SECONDS,
      deckPosition: nextDeckPosition,
      currentRound: nextDeckPosition + 1,
      roundKind: nextRound.kind,
    });
    return;
  }
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "TOPIC_REVEAL",
    now,
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    deckPosition: nextDeckPosition,
    currentRound: nextDeckPosition + 1,
    roundKind: nextRound.kind,
  });
}

async function countBoundaryActiveParticipants(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<number> {
  const [boundaryActive, participants] = await Promise.all([
    listBoundaryActivePlayerIds(ctx, gameId),
    listQuizslopParticipants(ctx, gameId),
  ]);
  return participants.filter((participant) => boundaryActive.has(participant.playerId)).length;
}

async function closeRoundResults(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  const isFinalRound = round.deckOrdinal + 1 >= bundle.game.totalRounds;
  if (isFinalRound) {
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "FINAL_RESULTS",
      now,
      deadlineSeconds: null,
      roundKind: round.kind,
    });
    return;
  }
  const activeCount = await countBoundaryActiveParticipants(ctx, bundle.game._id);
  if (activeCount < MIN_CONTINUING_PLAYERS) {
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "CONTINUITY_GRACE",
      now,
      deadlineSeconds: CONTINUITY_GRACE_SECONDS,
      deadlineIgnoresTimersDisabled: true,
      roundKind: round.kind,
    });
    return;
  }
  await openNextRound(ctx, bundle, now);
}

async function recheckContinuity(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const activeCount = await countBoundaryActiveParticipants(ctx, bundle.game._id);
  if (activeCount >= MIN_CONTINUING_PLAYERS) {
    await openNextRound(ctx, bundle, now);
    return;
  }
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "ABANDONED",
    now,
    deadlineSeconds: null,
    roundKind: null,
  });
}

async function closeHouseVote(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  now: number,
): Promise<void> {
  const finalistIds = round.finalistTopicIds ?? [];
  const topics = await Promise.all(
    finalistIds.map((topicId) => ctx.db.get("quizSlopTopics", topicId)),
  );
  const slate: { topicId: Id<"quizSlopTopics">; tieBreakRank: number }[] = [];
  for (const [index, topicId] of finalistIds.entries()) {
    const topic = topics[index];
    if (!topic) throw new ConvexError("Finalist topic is missing");
    slate.push({ topicId, tieBreakRank: topic.tieBreakRank ?? 0 });
  }
  const votes = await listRoundHouseVotes(ctx, round._id);
  const winner = resolveHouseVote(
    slate,
    votes.map((vote) => ({ topicId: vote.topicId })),
  );
  if (!winner) throw new ConvexError("House vote could not resolve a topic");
  await ctx.db.patch("quizSlopRounds", round._id, {
    topicId: winner.topicId,
  });
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "HOUSE_VOTE_REVEAL",
    now,
    deadlineSeconds: HOUSE_VOTE_REVEAL_SECONDS,
    roundKind: round.kind,
  });
}

/**
 * Advances from the current phase applying documented timeout defaults. Used
 * by deadline enforcement and by the host's advance/close-phase action.
 * Returns the new phase, or null when the current phase cannot be advanced.
 */
export async function forceAdvanceQuizslop(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<QuizslopPhase | null> {
  const { state } = bundle;
  if (isTerminalQuizslopPhase(state.phase) || state.phase === "LOBBY_SETUP") return null;
  const round = await loadCurrentRound(ctx, bundle);
  switch (state.phase) {
    case "HOUSE_VOTE":
      await closeHouseVote(ctx, bundle, round, now);
      break;
    case "HOUSE_VOTE_REVEAL":
      await transitionQuizslopPhase(ctx, bundle, {
        phase: "TOPIC_REVEAL",
        now,
        deadlineSeconds: TOPIC_REVEAL_SECONDS,
        roundKind: round.kind,
      });
      break;
    case "TOPIC_REVEAL":
      await openSlopCall(ctx, bundle, round, now);
      break;
    case "SLOP_CALL":
      await closeSlopCall(ctx, bundle, round, now);
      break;
    case "SLOP_CALL_REVEAL":
      await openAnswer(ctx, bundle, round, now);
      break;
    case "ANSWER":
      await closeAnswer(ctx, bundle, round, now);
      break;
    case "QUESTION_REVEAL":
      await advanceQuestionReveal(ctx, bundle, round, now);
      break;
    case "DISPUTE_VOTE":
      await advanceDisputeVote(ctx, bundle, round, now);
      break;
    case "ROUND_RESULTS":
      await closeRoundResults(ctx, bundle, round, now);
      break;
    case "CONTINUITY_GRACE":
      await recheckContinuity(ctx, bundle, now);
      break;
    default:
      return null;
  }
  return bundle.state.phase;
}

/**
 * Early advancement for submission phases: closes the phase as soon as every
 * snapshotted eligible participant has explicitly resolved their action.
 * Tutorial Mode is deliberately host-paced, so it never advances on quorum.
 */
export async function settleQuizslopQuorum(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<QuizslopPhase | null> {
  if (bundle.game.timersDisabled) return null;
  const { state } = bundle;
  const round = await loadCurrentRound(ctx, bundle);
  if (state.phase === "SLOP_CALL") {
    const [eligibility, calls] = await Promise.all([
      listEligibility(ctx, round._id, "CALL"),
      listRoundCalls(ctx, round._id),
    ]);
    const resolved = new Set(calls.map((call) => call.callerId));
    if (eligibility.length > 0 && eligibility.every((entry) => resolved.has(entry.playerId))) {
      await closeSlopCall(ctx, bundle, round, now);
      return bundle.state.phase;
    }
    return null;
  }
  if (state.phase === "ANSWER") {
    const assignments = await listRoundAssignments(ctx, round._id);
    if (
      assignments.length > 0 &&
      assignments.every((assignment) => assignment.lockedAt !== undefined)
    ) {
      await closeAnswer(ctx, bundle, round, now);
      return bundle.state.phase;
    }
    return null;
  }
  if (state.phase === "HOUSE_VOTE") {
    const [eligibility, votes] = await Promise.all([
      listEligibility(ctx, round._id, "HOUSE_VOTE"),
      listRoundHouseVotes(ctx, round._id),
    ]);
    const voted = new Set(votes.map((vote) => vote.playerId));
    if (eligibility.length > 0 && eligibility.every((entry) => voted.has(entry.playerId))) {
      await closeHouseVote(ctx, bundle, round, now);
      return bundle.state.phase;
    }
    return null;
  }
  if (state.phase === "DISPUTE_VOTE") {
    const [eligibility, disputes] = await Promise.all([
      listEligibility(ctx, round._id, "DISPUTE_VOTE"),
      listRoundDisputes(ctx, round._id),
    ]);
    const openBallots = disputesInRulingOrder(disputes);
    if (eligibility.length === 0 || openBallots.length === 0) return null;
    const current = openBallots[state.revealOrdinal];
    if (!current) return null;
    const votes = await listDisputeVotes(ctx, current._id);
    const resolved = new Set(votes.map((vote) => vote.voterId));
    if (!eligibility.every((entry) => resolved.has(entry.playerId))) return null;
    await advanceDisputeVote(ctx, bundle, round, now);
    return bundle.state.phase;
  }
  return null;
}
