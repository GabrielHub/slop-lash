import { CALL_SLOP_POINTS, FINAL_QUIZ_CORRECT_POINTS, QUIZ_CORRECT_POINTS } from "./game-constants";
import type { QuizslopAwardKind, QuizslopLadderResult } from "./types";

/**
 * Exact round settlement. This module is pure so the Convex engine, the
 * fixtures, and the rules tests apply identical scoring: answers and calls are
 * marked when answers lock, and the same settlement moves points, refunds, and
 * hidden ladders onto the seats once the reveal closes.
 */

export function quizPointsForRound(isFinalRound: boolean): number {
  return isFinalRound ? FINAL_QUIZ_CORRECT_POINTS : QUIZ_CORRECT_POINTS;
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
  /** Null when the player had no assignment. */
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
 * one pass. A call on a player with no assignment (not in the room when the
 * questions went out) is refunded. Being called never changes the target's score.
 */
export function settleRound<PlayerId extends string, QuestionId extends string>(
  input: RoundSettlementInput<PlayerId, QuestionId>,
): RoundSettlement<PlayerId> {
  const assignmentByPlayer = new Map<PlayerId, SettlementAssignment<PlayerId, QuestionId>>();
  for (const assignment of input.assignments) {
    assignmentByPlayer.set(assignment.playerId, assignment);
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
    const player = ensurePlayer(assignment.playerId);
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
    const caller = ensurePlayer(call.callerId);
    if (!targetAssignment) {
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

/** Competition rank for an already ordered standings row (1, 1, 3, ...). */
export function getFinalStandingRank(
  ordered: readonly FinalStanding[],
  index: number,
): number | null {
  const target = ordered[index];
  if (!target) return null;
  const firstMatchingIndex = ordered.findIndex(
    (entry) =>
      entry.total === target.total &&
      entry.quizSubtotal === target.quizSubtotal &&
      entry.successfulCalls === target.successfulCalls,
  );
  return firstMatchingIndex + 1;
}

export interface AwardStats<PlayerId extends string = string> {
  playerId: PlayerId;
  successfulCalls: number;
  incorrectCalls: number;
  correctAnswers: number;
}

export interface ComputedAward<PlayerId extends string = string> {
  kind: QuizslopAwardKind;
  /** Player ids; screens show names. */
  recipients: PlayerId[];
  stat: string;
}

function awardFor<PlayerId extends string>(
  kind: QuizslopAwardKind,
  stats: readonly AwardStats<PlayerId>[],
  count: (entry: AwardStats<PlayerId>) => number,
  describe: (max: number) => string,
): ComputedAward<PlayerId> | null {
  const max = Math.max(0, ...stats.map(count));
  if (max === 0) return null;
  return {
    kind,
    recipients: stats.filter((entry) => count(entry) === max).map((entry) => entry.playerId),
    stat: describe(max),
  };
}

/**
 * Deterministic, non-scoring comedy awards from visible facts only. An award
 * is omitted when its count is zero, ties share the award, and the underlying
 * stat always ships with the joke. Never derived from hidden tier.
 */
export function computeAwards<PlayerId extends string>(
  stats: readonly AwardStats<PlayerId>[],
): ComputedAward<PlayerId>[] {
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
  return awards.filter((award): award is ComputedAward<PlayerId> => award !== null);
}

/** Running totals a seat carries into the final results. */
export interface SeatTotals<PlayerId extends string = string> extends AwardStats<PlayerId> {
  quizPoints: number;
  callPoints: number;
}

/** Ranked standings (with competition rank and co-winners) plus the comedy awards. */
export function finalResults<PlayerId extends string>(seats: readonly SeatTotals<PlayerId>[]) {
  const { ordered, winnerIds } = rankFinalStandings(
    seats.map((seat) => ({
      playerId: seat.playerId,
      total: seat.quizPoints + seat.callPoints,
      quizSubtotal: seat.quizPoints,
      successfulCalls: seat.successfulCalls,
    })),
  );
  return {
    standings: ordered.map((entry, index) => ({
      ...entry,
      rank: getFinalStandingRank(ordered, index) ?? index + 1,
      winner: winnerIds.includes(entry.playerId),
    })),
    awards: computeAwards(seats),
  };
}
