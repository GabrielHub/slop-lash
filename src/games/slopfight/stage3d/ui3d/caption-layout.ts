// Caption layout (pure): how The Voice's line breaks onto the lower third,
// and which part of the bottom of the frame its slab takes (the one clear of
// the fighters).

/** About this many characters per caption line. */
export const CHARS_PER_LINE = 40;

/** Word-wrap a caption into at most two lines of about `width` characters. */
export function wrapCaption(text: string, width = CHARS_PER_LINE): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.join(" ").length <= width) return [words.join(" ")];
  // Break where the two halves are most even, so the slab stays compact.
  let best = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const score = Math.max(a, b) + (a < b ? 0.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** An axis-aligned box in NDC (-1..1 both ways). */
export interface CaptionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Where along the bottom the slab sits: -1 left, 0 centre, 1 right. */
export type CaptionSlot = -1 | 0 | 1;

/** NDC of the slab's lower edge with no letterbox (above a TV's overscan). */
export const CAPTION_BOTTOM_NDC = -0.86;
/** Gap (NDC) between the slab and a letterbox bar, or a side of the frame. */
export const CAPTION_GAP_NDC = 0.03;
const SIDE_MARGIN_NDC = 0.07;

/** The slab's lower edge (NDC) above a letterbox bar `barFraction` of the frame tall. */
export function captionBottom(barFraction: number): number {
  return Math.max(CAPTION_BOTTOM_NDC, -1 + 2 * barFraction + CAPTION_GAP_NDC);
}

/** The slab's centre x (NDC) in `slot`, for a slab `width` NDC wide. */
export function captionX(slot: CaptionSlot, width: number): number {
  return slot === 0 ? 0 : slot * Math.max(0, 1 - SIDE_MARGIN_NDC - width / 2);
}

function overlap(a: CaptionBox, b: CaptionBox): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The slot keeps the slab unless another covers this much less of the fighters (NDC area)... */
const SLOT_SWAP_GAIN = 0.02;
/** ...and, during a line, only once the slab covers this much of them. */
const SLOT_MOVE_OVERLAP = 0.03;

/**
 * The slot for a slab `width` x `height` (NDC) whose lower edge is at
 * `bottom`: the one covering the least of `subjects` (the fighters' box on
 * screen), keeping `current` unless another is clearly better. A slab already
 * showing a line (`fresh` false) moves only once it covers the fighters.
 * Ties go to the centre.
 */
export function chooseCaptionSlot(
  subjects: readonly CaptionBox[],
  width: number,
  height: number,
  bottom: number,
  current: CaptionSlot,
  fresh: boolean,
): CaptionSlot {
  const covered = (slot: CaptionSlot) => {
    const x = captionX(slot, width);
    const rect = { minX: x - width / 2, maxX: x + width / 2, minY: bottom, maxY: bottom + height };
    let sum = 0;
    for (const box of subjects) {
      sum += overlap(rect, { minX: Math.max(-1, box.minX), maxX: Math.min(1, box.maxX), minY: Math.max(-1, box.minY), maxY: Math.min(1, box.maxY) });
    }
    return sum;
  };
  const now = covered(current);
  if (!fresh && now < SLOT_MOVE_OVERLAP) return current;
  let best = current;
  let bestCovered = now;
  for (const slot of [0, -1, 1] as const) {
    if (slot === current) continue;
    const c = covered(slot);
    if (c < bestCovered - SLOT_SWAP_GAIN || (c === 0 && bestCovered === 0 && slot === 0 && fresh)) {
      best = slot;
      bestCovered = c;
    }
  }
  return best;
}
