// Caption layout (pure): how The Voice's line breaks onto the lower third.

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
