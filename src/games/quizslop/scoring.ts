import { CALL_SLOP_POINTS, FINAL_QUIZ_CORRECT_POINTS, QUIZ_CORRECT_POINTS } from "./game-constants";
import type { QuizslopAwardKind, QuizslopLadderResult, QuizslopQuestionRuling } from "./types";

/**
 * Exact round settlement. This module is pure so the Convex engine, the
 * fixture prototype, and the rules tests apply identical scoring. Settlement
 * runs once per round, only after the dispute window (and any batched vote)
 * closes, and must be idempotent at the persistence layer.
 */

export function quizPointsForRound(isFinalRound: boolean): number {
  return isFinalRound ? FINAL_QUIZ_CORRECT_POINTS : QUIZ_CORRECT_POINTS;
}

export function isValidRuling(ruling: QuizslopQuestionRuling): boolean {
  return ruling === "UNCHALLENGED_VALID" || ruling === "UPHELD";
}

/** One immutable answer assignment as seen at settlement time. */
export interface SettlementAssignment<
  PlayerId extends string = string,
  QuestionId extends string = string,
> {
  playerId: PlayerId;
  questionId: QuestionId;
  /** Null when the accountable player never locked an answer. */
  selectedIndex: number | null;
  correctIndex: number;
}

export interface SettlementCall<PlayerId extends string = string> {
  callerId: PlayerId;
  targetId: PlayerId;
}

export interface RoundSettlementInput<
  PlayerId extends string = string,
  QuestionId extends string = string,
> {
  isFinalRound: boolean;
  assignments: readonly SettlementAssignment<PlayerId, QuestionId>[];
  /** Post-dispute ruling for every question that received an assignment. */
  rulings: Readonly<Record<string, QuizslopQuestionRuling>>;
  calls: readonly SettlementCall<PlayerId>[];
}

export interface PlayerRoundSettlement<PlayerId extends string = string> {
  playerId: PlayerId;
  quizDelta: number;
  callDelta: number;
  /** Call Slop tokens returned to this caller by refunds this round. */
  tokensRefunded: number;
  /** Hidden-ladder effect of this round for the assigned player. */
  ladderResult: QuizslopLadderResult;
  /** Null when the player had no assignment or the question was voided. */
  answeredCorrectly: boolean | null;
}

export type CallOutcome = "WON" | "LOST" | "REFUNDED";

export interface CallRoundSettlement<PlayerId extends string = string> {
  callerId: PlayerId;
  targetId: PlayerId;
  outcome: CallOutcome;
  callDelta: number;
  tokenRefunded: boolean;
}

export interface RoundSettlement<PlayerId extends string = string> {
  players: readonly PlayerRoundSettlement<PlayerId>[];
  calls: readonly CallRoundSettlement<PlayerId>[];
}

function assignmentIsCorrect(assignment: SettlementAssignment): boolean {
  return assignment.selectedIndex !== null && assignment.selectedIndex === assignment.correctIndex;
}

/**
 * Applies quiz scoring, Call Slop settlement, refunds, and ladder results in
 * one pass. A voided question contributes no quiz points, causes no ladder
 * movement, neutralizes every call on its assigned players, and refunds those
 * tokens. A call on a player with no assignment (not answer-eligible when the
 * phase opened) is refunded. Being called never changes the target's score.
 */
export function settleRound<PlayerId extends string, QuestionId extends string>(
  input: RoundSettlementInput<PlayerId, QuestionId>,
): RoundSettlement<PlayerId> {
  const assignmentByPlayer = new Map<PlayerId, SettlementAssignment<PlayerId, QuestionId>>();
  for (const assignment of input.assignments) {
    assignmentByPlayer.set(assignment.playerId, assignment);
  }

  const missingRuling = input.assignments.find(
    (assignment) => input.rulings[assignment.questionId] === undefined,
  );
  if (missingRuling) {
    throw new Error(`Settlement is missing a ruling for question ${missingRuling.questionId}`);
  }

  const points = quizPointsForRound(input.isFinalRound);
  const players = new Map<PlayerId, PlayerRoundSettlement<PlayerId>>();
  const ensurePlayer = (playerId: PlayerId): PlayerRoundSettlement<PlayerId> => {
    const existing = players.get(playerId);
    if (existing) return existing;
    const created: PlayerRoundSettlement<PlayerId> = {
      playerId,
      quizDelta: 0,
      callDelta: 0,
      tokensRefunded: 0,
      ladderResult: "NEUTRAL",
      answeredCorrectly: null,
    };
    players.set(playerId, created);
    return created;
  };

  for (const assignment of input.assignments) {
    const ruling = input.rulings[assignment.questionId];
    const player = ensurePlayer(assignment.playerId);
    // Every questionId is guaranteed a ruling by the missingRuling guard above.
    if (!isValidRuling(ruling)) continue;
    const correct = assignmentIsCorrect(assignment);
    players.set(assignment.playerId, {
      ...player,
      quizDelta: correct ? points : 0,
      ladderResult: correct ? "CORRECT" : "INCORRECT",
      answeredCorrectly: correct,
    });
  }

  const calls: CallRoundSettlement<PlayerId>[] = [];
  for (const call of input.calls) {
    const targetAssignment = assignmentByPlayer.get(call.targetId);
    const targetRuling = targetAssignment ? input.rulings[targetAssignment.questionId] : undefined;
    const refunded =
      !targetAssignment || targetRuling === undefined || !isValidRuling(targetRuling);
    const caller = ensurePlayer(call.callerId);
    if (refunded) {
      calls.push({
        callerId: call.callerId,
        targetId: call.targetId,
        outcome: "REFUNDED",
        callDelta: 0,
        tokenRefunded: true,
      });
      players.set(call.callerId, {
        ...caller,
        tokensRefunded: caller.tokensRefunded + 1,
      });
      continue;
    }
    const targetCorrect = assignmentIsCorrect(targetAssignment);
    const outcome: CallOutcome = targetCorrect ? "LOST" : "WON";
    const callDelta = targetCorrect ? -CALL_SLOP_POINTS : CALL_SLOP_POINTS;
    calls.push({
      callerId: call.callerId,
      targetId: call.targetId,
      outcome,
      callDelta,
      tokenRefunded: false,
    });
    players.set(call.callerId, {
      ...caller,
      callDelta: caller.callDelta + callDelta,
    });
  }

  return { players: [...players.values()], calls };
}

/** Final ranking facts for one frozen participant. */
export interface FinalStanding<PlayerId extends string = string> {
  playerId: PlayerId;
  total: number;
  quizSubtotal: number;
  successfulCalls: number;
}

/**
 * Orders standings by the documented tie chain: highest total, then highest
 * quiz subtotal before Call Slop adjustments, then most successful calls.
 * Players still tied after all three are co-winners; the returned order breaks
 * remaining ties by stable player ID for deterministic display only.
 */
export function rankFinalStandings<PlayerId extends string>(
  standings: readonly FinalStanding<PlayerId>[],
): {
  ordered: readonly FinalStanding<PlayerId>[];
  winnerIds: readonly PlayerId[];
} {
  const ordered = [...standings].sort(
    (left, right) =>
      right.total - left.total ||
      right.quizSubtotal - left.quizSubtotal ||
      right.successfulCalls - left.successfulCalls ||
      left.playerId.localeCompare(right.playerId),
  );
  const top = ordered[0];
  if (!top) return { ordered, winnerIds: [] };
  const winnerIds = ordered
    .filter(
      (entry) =>
        entry.total === top.total &&
        entry.quizSubtotal === top.quizSubtotal &&
        entry.successfulCalls === top.successfulCalls,
    )
    .map((entry) => entry.playerId);
  return { ordered, winnerIds };
}

export interface AwardStats {
  playerId: string;
  name: string;
  successfulCalls: number;
  incorrectCalls: number;
  correctAnswers: number;
}

export interface ComputedAward {
  kind: QuizslopAwardKind;
  recipients: readonly string[];
  stat: string;
}

function awardFor(
  kind: QuizslopAwardKind,
  stats: readonly AwardStats[],
  count: (entry: AwardStats) => number,
  describe: (max: number) => string,
): ComputedAward | null {
  const max = Math.max(0, ...stats.map(count));
  if (max === 0) return null;
  return {
    kind,
    recipients: stats.filter((entry) => count(entry) === max).map((entry) => entry.name),
    stat: describe(max),
  };
}

/**
 * Deterministic, non-scoring comedy awards from visible facts only. An award
 * is omitted when its count is zero, ties share the award, and the underlying
 * stat always ships with the joke. Never derived from hidden tier.
 */
export function computeAwards(stats: readonly AwardStats[]): readonly ComputedAward[] {
  const awards = [
    awardFor(
      "CALLED_IT",
      stats,
      (entry) => entry.successfulCalls,
      (max) => `${max} correct call${max === 1 ? "" : "s"}`,
    ),
    awardFor(
      "FALSE_ALARM_DEPARTMENT",
      stats,
      (entry) => entry.incorrectCalls,
      (max) => `${max} missed call${max === 1 ? "" : "s"}`,
    ),
    awardFor(
      "SUSPICIOUSLY_WELL_READ",
      stats,
      (entry) => entry.correctAnswers,
      (max) => `${max} correct answer${max === 1 ? "" : "s"}`,
    ),
  ];
  return awards.filter((award): award is ComputedAward => award !== null);
}
