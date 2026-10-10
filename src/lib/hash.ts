/**
 * Stable string hashes, the same on every runtime, for anything that must not
 * change between renders, servers or replays.
 */

/**
 * FNV-1a 32-bit. Fine for picking from a list or ordering, but its low bit is
 * only the XOR of the input characters' low bits: use `mixedHash` for a coin flip.
 */
export function stableHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * FNV-1a followed by the Murmur3 finalizer, which mixes every input bit into
 * every output bit, so any bit of the result is a fair coin.
 */
export function mixedHash(text: string): number {
  let value = stableHash(text);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

/** A value in [-1, 1] from a string. */
export function spreadOf(text: string): number {
  return (stableHash(text) % 2001) / 1000 - 1;
}

/**
 * A copy of `items` in a fixed order for `seed`: Fisher-Yates driven by a
 * `stableHash` chain, so every runtime gets the same permutation.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const order = [...items];
  let state = stableHash(seed);
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = stableHash(`${seed}:${state}`);
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}
