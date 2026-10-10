// The stage text sanitizer (pure): what StageText and TitleText draw.

/**
 * Text the stage's font can draw. Fredoka here is the Latin subset, and
 * troika fetches fallback fonts from a CDN for any glyph it lacks (emoji in a
 * player's name), so everything drawn in the scene goes through this:
 * accents fold to their base letter where Unicode allows, smart quotes and
 * dashes become plain ones, anything else outside Latin-1 is dropped, and
 * whitespace collapses. Never returns an empty string for non-empty input
 * that had no drawable characters ("?").
 */
export function sanitizeStageText(text: string): string {
  if (!text) return "";
  const folded = text
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2026\u22ef]/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  let out = "";
  for (const char of folded) {
    const code = char.codePointAt(0)!;
    if (char === "\n") out += "\n";
    else if (code < 0x20 || code === 0x7f) out += " ";
    else if (code <= 0xff) out += char;
  }
  const cleaned = out
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
  return cleaned || (text.trim() ? "?" : "");
}
