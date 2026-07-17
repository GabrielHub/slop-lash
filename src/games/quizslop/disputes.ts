import type { QuizslopDisputeVoteChoice, QuizslopQuestionRuling } from "./types";

/**
 * Batched factual disputes. All distinct challenged questions share one frozen
 * voter roster and one deadline, and settle atomically. Voiding a question
 * requires a strict majority of the frozen roster; missing votes are
 * abstentions, and a tie or timeout upholds. Disconnecting after vote opening
 * never shrinks the denominator.
 */

export interface DisputeBallotTally {
  ballotId: string;
  votes: readonly QuizslopDisputeVoteChoice[];
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
