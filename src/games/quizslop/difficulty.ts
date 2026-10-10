import type { QuizslopLadderResult, QuizslopTier } from "./types";
import { QUIZSLOP_TIERS } from "./types";

/**
 * Hidden adaptive difficulty. One ladder per player for the entire game,
 * regardless of topic or category. The tier is server-only calibration state:
 * it never reaches a stage or controller view, and no difficulty state
 * persists into a new game.
 */

export const INITIAL_TIER: QuizslopTier = "EASY";

export function tierIndex(tier: QuizslopTier): number {
  return QUIZSLOP_TIERS.indexOf(tier);
}

/**
 * Applies one settled result: a valid correct answer moves up one step, a
 * valid incorrect answer (including an accountable timeout) moves down one
 * step, and a voided question, pre-answer exemption, or system fault leaves
 * the ladder unchanged. Bounds clamp at EASY and INSANE.
 */
export function applyLadderResult(tier: QuizslopTier, result: QuizslopLadderResult): QuizslopTier {
  if (result === "NEUTRAL") return tier;
  const index = tierIndex(tier);
  const nextIndex =
    result === "CORRECT" ? Math.min(index + 1, QUIZSLOP_TIERS.length - 1) : Math.max(index - 1, 0);
  const next = QUIZSLOP_TIERS[nextIndex];
  return next ?? tier;
}

/**
 * The question a player gets from a topic: the one at their tier. A question
 * this room already saw in its previous game is skipped for the nearest tier
 * that is fresh (easier first on a tie); when every question is stale the
 * tier's own question is used anyway.
 */
export function pickQuestion<Question extends { id: string; tier: QuizslopTier }>(
  questions: readonly Question[],
  tier: QuizslopTier,
  asked: ReadonlySet<string> = new Set(),
): Question | null {
  const target = tierIndex(tier);
  const byDistance = (left: Question, right: Question) =>
    Math.abs(tierIndex(left.tier) - target) - Math.abs(tierIndex(right.tier) - target) ||
    tierIndex(left.tier) - tierIndex(right.tier);
  const fresh = questions.filter((question) => !asked.has(question.id)).toSorted(byDistance);
  return fresh[0] ?? questions.toSorted(byDistance)[0] ?? null;
}
