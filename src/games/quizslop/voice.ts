/** FNV-1a 32-bit; stable across runtimes for the same seed string. */
export function stableHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The same pick on every screen for the same seed, so clients never disagree. */
export function pickStable<T>(items: readonly T[], seed: string): T | null {
  return items.length > 0 ? (items[stableHash(seed) % items.length] ?? null) : null;
}
