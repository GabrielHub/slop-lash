const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 10_000,
): boolean {
  const now = Date.now();
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
