/**
 * SlopLash scoring: every vote is worth 100 points times the round
 * multiplier. Pure, so the server and every screen agree on the numbers.
 */

export type PlayerType = "HUMAN" | "AI";

export const POINTS_PER_VOTE = 100;
/** A unanimous win (every cast vote, at least two) earns +50%. */
export const UNANIMOUS_BONUS = 0.5;

/** ×1, ×2, ×4, … uncapped. */
export const roundMultiplier = (round: number): number => 2 ** (round - 1);

/** What one vote is worth this round. */
export const pointsPerVote = (round: number): number => POINTS_PER_VOTE * roundMultiplier(round);

/**
 * How a matchup plays out from how many answers are present: two go to a
 * vote, one wins by walkover, none is void (skipped entirely).
 */
export type MatchupKind = "vote" | "walkover" | "void";

export const matchupKind = (present: number): MatchupKind =>
  present >= 2 ? "vote" : present === 1 ? "walkover" : "void";

/** Walkovers first, then contested matchups, each in input order; voids dropped. Stable. */
export function orderMatchups<T>(
  items: readonly { item: T; present: number }[],
): { item: T; kind: "vote" | "walkover" }[] {
  const walkovers: { item: T; kind: "walkover" }[] = [];
  const votes: { item: T; kind: "vote" }[] = [];
  for (const { item, present } of items) {
    const kind = matchupKind(present);
    if (kind === "walkover") walkovers.push({ item, kind });
    else if (kind === "vote") votes.push({ item, kind });
  }
  return [...walkovers, ...votes];
}

export type MatchupOutcome = "win" | "tie" | "noVotes" | "walkover" | "void";

export interface MatchupScore {
  outcome: MatchupOutcome;
  /** 100 × multiplier. */
  unit: number;
  /** Ballots naming a present answer. */
  cast: number;
  /** The winning answer id (`win` and `walkover` only). */
  winnerId: string | null;
  /** A `win` with at least 2 cast votes, all for the winner. */
  unanimous: boolean;
  /** Votes per answer id. */
  votes: Record<string, number>;
  /** Points per answer id. */
  points: Record<string, number>;
}

/**
 * Scores one matchup. Ballots name an answer id; null (abstain or timeout)
 * and unknown ids are ignored, as is who cast them. A walkover pays a flat
 * unit, which equals the smallest real win, so it never pays more.
 */
export function scoreMatchup(
  answers: readonly { id: string; forfeited: boolean }[],
  ballots: readonly (string | null)[],
  round: number,
): MatchupScore {
  const unit = pointsPerVote(round);
  const present = answers.filter((answer) => !answer.forfeited);
  const votes: Record<string, number> = {};
  const points: Record<string, number> = {};
  for (const answer of answers) {
    votes[answer.id] = 0;
    points[answer.id] = 0;
  }
  const base = { unit, votes, points, unanimous: false };

  const kind = matchupKind(present.length);
  if (kind === "void") return { ...base, outcome: "void", cast: 0, winnerId: null };
  if (kind === "walkover") {
    const winner = present[0]!;
    points[winner.id] = unit;
    return { ...base, outcome: "walkover", cast: 0, winnerId: winner.id };
  }

  const presentIds = new Set(present.map((answer) => answer.id));
  let cast = 0;
  for (const ballot of ballots) {
    if (ballot === null || !presentIds.has(ballot)) continue;
    votes[ballot] = (votes[ballot] ?? 0) + 1;
    cast += 1;
  }
  if (cast === 0) return { ...base, outcome: "noVotes", cast, winnerId: null };

  const counts = present.map((answer) => votes[answer.id] ?? 0);
  const top = Math.max(...counts);
  const leaders = present.filter((answer) => votes[answer.id] === top);
  const winnerId = leaders.length === 1 ? leaders[0]!.id : null;
  const unanimous = winnerId !== null && cast >= 2 && top === cast;
  for (const answer of present) {
    const earned = (votes[answer.id] ?? 0) * unit;
    points[answer.id] =
      unanimous && answer.id === winnerId ? Math.round(earned * (1 + UNANIMOUS_BONUS)) : earned;
  }
  return {
    ...base,
    outcome: winnerId === null ? "tie" : "win",
    cast,
    winnerId,
    unanimous,
  };
}
