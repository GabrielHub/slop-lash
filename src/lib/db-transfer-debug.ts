type RouteHitCounter = {
  second: number;
  count: number;
};

const globalDebugState = globalThis as typeof globalThis & {
  __dbTransferHitCounters?: Map<string, RouteHitCounter>;
};

function isEnabled(): boolean {
  return process.env.DEBUG_DB_TRANSFER === "1";
}

function getCounters(): Map<string, RouteHitCounter> {
  if (!globalDebugState.__dbTransferHitCounters) {
    globalDebugState.__dbTransferHitCounters = new Map();
  }
  return globalDebugState.__dbTransferHitCounters;
}

export function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function recordRouteHit(route: string): void {
  if (!isEnabled()) return;

  const nowSecond = Math.floor(Date.now() / 1000);
  const counters = getCounters();
  const prev = counters.get(route);

  if (!prev || prev.second !== nowSecond) {
    if (prev) {
      console.info(`[db-transfer] hits route=${route} second=${prev.second} count=${prev.count}`);
    }
    counters.set(route, { second: nowSecond, count: 1 });
    return;
  }

  prev.count += 1;
}

export function logDbTransfer(route: string, fields: Record<string, unknown>): void {
  if (!isEnabled()) return;
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${String(v)}`);
  console.info(`[db-transfer] ${route} ${parts.join(" ")}`);
}

