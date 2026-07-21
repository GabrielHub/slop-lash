import type { QuizslopDisputeVoteChoice, QuizslopQuestionRuling } from "./types";

/**
 * Ordered factual disputes. All distinct challenged questions share one frozen
 * voter roster, receive separate ruling turns, and settle atomically. Voiding a question
 * requires a strict majority of the frozen roster; missing votes are
 * abstentions, and a tie or timeout upholds. Disconnecting after vote opening
 * never shrinks the denominator.
 */

export interface DisputeBallotTally {
  ballotId: string;
  votes: readonly QuizslopDisputeVoteChoice[];
}

/**
 * Authoritative ruling order for challenged questions: earliest challenge
 * first, with the id as a deterministic tiebreak. The engine advances through
 * disputes in this order and the vote guard validates against it, so all
 * callers must share this comparator rather than re-inlining it.
 */
export function compareDisputeRulingOrder(
  left: { createdAt: number; _id: string },
  right: { createdAt: number; _id: string },
): number {
  return left.createdAt - right.createdAt || left._id.localeCompare(right._id);
}

/** Open (not-yet-ruled) disputes in the order they come up for ruling. */
export function disputesInRulingOrder<
  T extends { createdAt: number; _id: string; ruling?: unknown },
>(disputes: readonly T[]): T[] {
  return disputes
    .filter((dispute) => dispute.ruling === undefined)
    .toSorted(compareDisputeRulingOrder);
}

export function resolveDisputeBallot(
  votes: readonly QuizslopDisputeVoteChoice[],
  frozenVoterCount: number,
): Extract<QuizslopQuestionRuling, "UPHELD" | "PLAYER_VOIDED"> {
  const voidVotes = votes.filter((vote) => vote === "VOID").length;
  return voidVotes * 2 > frozenVoterCount ? "PLAYER_VOIDED" : "UPHELD";
}

export function resolveDisputeBallots(
  ballots: readonly DisputeBallotTally[],
  frozenVoterCount: number,
): ReadonlyMap<string, Extract<QuizslopQuestionRuling, "UPHELD" | "PLAYER_VOIDED">> {
  return new Map(
    ballots.map((ballot) => [
      ballot.ballotId,
      resolveDisputeBallot(ballot.votes, frozenVoterCount),
    ]),
  );
}
