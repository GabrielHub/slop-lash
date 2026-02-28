export const SSE_POLL_INTERVAL_MS = 2000;
export const SSE_KEEPALIVE_INTERVAL_MS = 15_000;
export const HEARTBEAT_MIN_INTERVAL_MS = 15_000;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
