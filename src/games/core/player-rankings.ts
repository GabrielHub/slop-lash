type ScoredPlayer = {
  id: string;
  score: number;
};

export function comparePlayersByScore<T extends ScoredPlayer>(a: T, b: T): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

export function sortPlayersByScore<T extends ScoredPlayer>(players: readonly T[]): T[] {
  return [...players].sort(comparePlayersByScore);
}

export function pickTopScoringPlayer<T extends ScoredPlayer>(players: readonly T[]): T | null {
  return sortPlayersByScore(players)[0] ?? null;
}

export interface Ranked<T> {
  player: T;
  /** Competition rank: 1, 2, 2, 4. */
  rank: number;
}

/**
 * Highest `score` first. Ties share a competition rank (1, 2, 2, 4) and sort
 * by `tiebreak`, else keep their order in `players` (seat order).
 */
export function rankBy<T>(
  players: readonly T[],
  score: (player: T) => number,
  tiebreak?: (left: T, right: T) => number,
): Ranked<T>[] {
  const sorted = players
    .map((player, seat) => ({ player, seat, value: score(player) }))
    .toSorted(
      (a, b) => b.value - a.value || (tiebreak?.(a.player, b.player) ?? 0) || a.seat - b.seat,
    );
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry.value !== sorted[index - 1]!.value) rank = index + 1;
    return { player: entry.player, rank };
  });
}
