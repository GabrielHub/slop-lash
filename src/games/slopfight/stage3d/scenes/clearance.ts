// Keeping a hanging card clear of text already in the shot (pure): the
// podium slides each runner-up's card outward until, seen from the final
// framing, it no longer covers the marquee's lines or another card.

/** A screen rectangle (NDC or any 2D space): x0 < x1, y0 < y1. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The area two rectangles share (0 when they do not touch). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** A rectangle grown by `margin` on every side. */
export function grow(rect: Rect, margin: number): Rect {
  return { x0: rect.x0 - margin, y0: rect.y0 - margin, x1: rect.x1 + margin, y1: rect.y1 + margin };
}

/** How far a rectangle pokes out of the frame (area outside it). */
function outside(rect: Rect, frame: Rect): number {
  const area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
  return area - overlapArea(rect, frame);
}

/**
 * The first shift (in the given order) whose rectangle clears every zone and
 * stays inside the frame; if none does, the one with the least overlap
 * (counting any part outside the frame as overlap), earliest on a tie.
 */
export function clearShift(shifts: readonly number[], rectAt: (shift: number) => Rect, zones: readonly Rect[], frame: Rect): number {
  let best = shifts[0] ?? 0;
  let bestCost = Infinity;
  for (const shift of shifts) {
    const rect = rectAt(shift);
    const cost = zones.reduce((sum, zone) => sum + overlapArea(rect, zone), 0) + outside(rect, frame);
    if (cost <= 0) return shift;
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = shift;
    }
  }
  return best;
}
