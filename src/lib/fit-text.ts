/**
 * Shortens over-long text (usually model output) so the cut reads as intended
 * rather than mid-thought. In order of preference:
 * 1. the last whole sentence that fits, when it keeps at least 60% of the room;
 * 2. the last word boundary, minus dangling function words ("…that now has a"
 *    becomes "…"), never dropping below half the room;
 * 3. a hard cut, when no word boundary falls in the second half.
 * Trailing commas, colons and dashes go. With `ellipsis`, a cut that is not a
 * whole sentence ends in "…" and the result, ellipsis included, fits `max`.
 */
export function fitText(text: string, max: number, ellipsis = false): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;

  let sentenceEnd = -1;
  for (const match of clean.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    if (end > max) break;
    sentenceEnd = end;
  }
  if (sentenceEnd >= max * 0.6) return clean.slice(0, sentenceEnd);

  const budget = ellipsis ? max - 1 : max;
  const space = clean.lastIndexOf(" ", budget);
  let cut: string;
  if (space < budget / 2) {
    cut = clean.slice(0, budget);
  } else {
    const words = clean.slice(0, space).split(" ");
    while (
      words.length > 1 &&
      isDangling(words.at(-1)!) &&
      words.slice(0, -1).join(" ").length >= budget / 2
    ) {
      words.pop();
    }
    cut = words.join(" ");
  }
  cut = cut.replace(TRAILING_JOINERS, "");
  return ellipsis ? `${cut}…` : cut;
}

/** A sentence end: terminal punctuation (plus closing quotes) before a space or the end. */
const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s|$)/gu;
const TRAILING_JOINERS = /(?:[\s,;:–—-]|\u200D)+$/u;

/** Words that leave a cut hanging when they come last. */
const DANGLING = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "so", "yet", "if", "as", "than", "then",
  "of", "to", "in", "on", "at", "by", "for", "from", "with", "into", "onto", "about",
  "over", "under", "like", "that", "which", "who", "whose", "what", "when", "where",
  "my", "your", "his", "her", "its", "our", "their", "this", "these", "those",
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does", "did",
  "will", "would", "can", "could", "should", "just", "very", "now", "i", "i'll", "i'm",
  "i'd", "you'll", "you're", "it's", "we", "they", "not",
]);

function isDangling(word: string): boolean {
  return DANGLING.has(word.toLowerCase().replace(/[’]/gu, "'").replace(/[^a-z']/gu, ""));
}
