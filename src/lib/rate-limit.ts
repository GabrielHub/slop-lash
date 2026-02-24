const buckets = new Map<string, number[]>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

/** Remove buckets with no timestamps within the last 2 minutes. */
function cleanupStale(now: number): void {
  const cutoff = now - 120_000;
  for (const [key, timestamps] of buckets) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 10_000,
): boolean {
  const now = Date.now();

  // Periodic cleanup of stale entries
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    cleanupStale(now);
  }

  const timestamps = buckets.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= limit) {
    buckets.set(key, valid);
    return false;
  }

  valid.push(now);
  buckets.set(key, valid);
  return true;
}
