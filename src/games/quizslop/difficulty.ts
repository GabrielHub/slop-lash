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
