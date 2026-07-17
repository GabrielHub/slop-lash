/**
 * Deterministic voice-line selection. Server code picks the line at a phase
 * transition from a stable hash of game ID, phase generation, and event tag,
 * excludes the immediately prior line when at least two are eligible, and
 * persists the chosen ID. Clients never randomize independently.
 */

/** FNV-1a 32-bit; stable across runtimes for the same seed string. */
export function stableHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function selectVoiceLineId(
  eligibleLineIds: readonly string[],
  seed: string,
  previousLineId: string | null,
): string | null {
  const pool =
    eligibleLineIds.length >= 2 && previousLineId !== null
      ? eligibleLineIds.filter((id) => id !== previousLineId)
      : eligibleLineIds;
  if (pool.length === 0) return null;
  return pool[stableHash(seed) % pool.length] ?? null;
}
