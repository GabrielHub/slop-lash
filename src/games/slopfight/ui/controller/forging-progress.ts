// The Forging screen's progress bar. The view tells the owner how many parts
// the forge has streamed and a soft target (`forgeParts`), so the bar follows
// the real forge. Haiku thinks before its first part (p50 12 s), so until one
// arrives the bar only creeps through a small thinking share; then the parts
// drive it. It never claims to be done: the card lands when the sheet is READY.

/** Never past this until the champion is READY. */
export const PROGRESS_CAP = 0.95;
/** The share of the bar the wait before the first part may fill. */
export const THINKING_SHARE = 0.15;
/** First visible part, typical (Haiku p50 12 s). */
const TYPICAL_FIRST_PART_MS = 12_000;
/** Typical full forge, for the time-only fallback (Haiku p50 13 s, p90 22 s). */
const TYPICAL_FORGE_MS = 16_000;

export interface ForgeParts {
  streamed: number;
  target: number;
}

/**
 * Progress 0..PROGRESS_CAP for a forge `elapsedMs` old. With part counts, the
 * thinking creep until the first part, then streamed / target over the rest.
 * Without them (an older view), a curve paced on the measured forge latency.
 */
export function forgeProgress(elapsedMs: number, parts: ForgeParts | null = null): number {
  const elapsed = Math.max(0, elapsedMs);
  if (!parts) return PROGRESS_CAP * (1 - Math.exp((-1.4 * elapsed) / TYPICAL_FORGE_MS));
  const thinking = THINKING_SHARE * (1 - Math.exp(-elapsed / TYPICAL_FIRST_PART_MS));
  if (parts.streamed <= 0) return thinking;
  const share = Math.min(1, parts.streamed / Math.max(1, parts.target));
  return Math.min(PROGRESS_CAP, Math.max(thinking, THINKING_SHARE + (PROGRESS_CAP - THINKING_SHARE) * share));
}

/**
 * Keeps one forge's bar from sliding back (a fallback model streams its parts
 * from scratch): the highest progress seen for the same forge, reset when a
 * new forge starts.
 */
export function holdProgress(
  held: { forge: number | null; value: number },
  forge: number | null,
  value: number,
): { forge: number | null; value: number } {
  if (held.forge !== forge) return { forge, value };
  return { forge, value: Math.max(held.value, value) };
}
