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

export function pickTopScoringPlayer<T extends ScoredPlayer>(
  players: readonly T[],
): T | null {
  return sortPlayersByScore(players)[0] ?? null;
}
