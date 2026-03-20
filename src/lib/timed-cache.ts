type TimedCacheEntry = {
  expiresAt: number;
  value: unknown;
};

export function createTimedCache(maxEntries = 200) {
  const entries = new Map<string, TimedCacheEntry>();
  const inflight = new Map<string, Promise<unknown>>();

  function trim(now: number) {
    if (entries.size <= maxEntries) return;

    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (typeof oldestKey !== "string") break;
      entries.delete(oldestKey);
    }
  }

  return {
    async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now) {
        entries.delete(key);
        entries.set(key, cached);
        return cached.value as T;
      }

      if (cached) {
        entries.delete(key);
      }

      const pending = inflight.get(key);
      if (pending) {
        return pending as Promise<T>;
      }

      const promise = (async () => {
        const value = await load();
        entries.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
        });
        trim(Date.now());
        return value;
      })();

      inflight.set(key, promise);
      try {
        return await promise;
      } finally {
        inflight.delete(key);
      }
    },
  };
}
