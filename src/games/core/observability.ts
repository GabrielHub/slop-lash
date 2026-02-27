/** Structured observability helpers for game lifecycle events. */

type GameEventContext = {
  gameType: string;
  gameId: string;
  roomCode: string;
};

type EventFields = Record<string, string | number | boolean | null | undefined>;

function sanitizeValue(v: string | number | boolean): string {
  return String(v).replace(/[\r\n\t]/g, " ");
}

function formatFields(fields: EventFields): string {
  return Object.entries(fields)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${sanitizeValue(v!)}`)
    .join(" ");
}

/** Format: `[game:{event}] gameType={T} gameId={id} roomCode={code} ...extra` */
function formatMessage(event: string, ctx: GameEventContext, extra?: EventFields): string {
  const base = `gameType=${ctx.gameType} gameId=${ctx.gameId} roomCode=${ctx.roomCode}`;
  const suffix = extra ? ` ${formatFields(extra)}` : "";
  return `[game:${event}] ${base}${suffix}`;
}

export function logGameEvent(event: string, ctx: GameEventContext, extra?: EventFields): void {
  console.log(formatMessage(event, ctx, extra));
}

export function warnGameEvent(event: string, ctx: GameEventContext, extra?: EventFields): void {
  console.warn(formatMessage(event, ctx, extra));
}

export function errorGameEvent(event: string, ctx: GameEventContext, extra?: EventFields): void {
  console.error(formatMessage(event, ctx, extra));
}

/** Per-gameType counts for cleanup summary logging. */
export type CleanupBreakdown = Record<string, number>;

/**
 * Log a structured cleanup summary with per-gameType breakdowns.
 */
export function logCleanupSummary(summary: {
  autoFinalizedAbandonedActive: number;
  deletedTransientCompleted: number;
  deletedFinalOrOld: number;
  deletedIncomplete: number;
  totalDeleted: number;
  abandonedByGameType?: CleanupBreakdown;
}): void {
  const parts = [
    `autoFinalized=${summary.autoFinalizedAbandonedActive}`,
    `deletedTransient=${summary.deletedTransientCompleted}`,
    `deletedOld=${summary.deletedFinalOrOld}`,
    `deletedIncomplete=${summary.deletedIncomplete}`,
    `total=${summary.totalDeleted}`,
  ];
  if (summary.abandonedByGameType) {
    const breakdown = Object.entries(summary.abandonedByGameType)
      .map(([gt, n]) => `${gt}=${n}`)
      .join(",");
    parts.push(`abandonedByType={${breakdown}}`);
  }
  console.log(`[game:cleanup] ${parts.join(" ")}`);
}
