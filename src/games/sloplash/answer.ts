import { fitText } from "../../lib/fit-text";

/**
 * Fits an answer (or tagline) into `max` characters on the server, for humans
 * and AI alike. Whitespace collapses to single spaces; an over-long text is
 * cut by `fitText` (a whole sentence, else a word boundary without dangling
 * words, else a hard cut), with trailing punctuation and dashes stripped.
 * Never adds an ellipsis. Lengths count UTF-16 units, so a cut can land inside an emoji:
 * lone surrogate halves (from this cut or an earlier one, such as `sanitize`)
 * and a dangling zero-width joiner are dropped, keeping the text well formed.
 */
export function capAnswer(text: string, max: number): string {
  const clean = dropLoneSurrogates(text).replace(/\s+/gu, " ").trim();
  if (clean.length <= max) return clean;
  return dropLoneSurrogates(fitText(clean, max)).replace(/(?:[\s,;:–—-]|\u200D)+$/u, "");
}

/** Removes unpaired UTF-16 surrogates. */
function dropLoneSurrogates(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    // Array.from splits by code point, so a lone surrogate is a 1-unit item in the surrogate range.
    return character.length === 1 && code >= 0xd800 && code <= 0xdfff ? "" : character;
  }).join("");
}

/**
 * Drops a fill-in-the-blank prompt's lead-in when an answer repeats it word
 * for word ("My greatest regret is ______" answered "My greatest regret is
 * Beanie Babies" becomes "Beanie Babies"), so the TV shows only the joke.
 * Leaves the answer alone when the prompt has no blank, the lead-in is too
 * short to be a real echo, or nothing would be left.
 */
export function dropEchoedPrompt(prompt: string, answer: string): string {
  const blank = prompt.search(/_{2,}/u);
  if (blank === -1) return answer;
  const lead = normalizeEcho(prompt.slice(0, blank)).replace(/[\s:,'"“”‘’-]+$/u, "");
  if (lead.length < 8) return answer;
  const trimmed = answer.trim();
  const words = trimmed.split(/\s+/u);
  // Find how many of the answer's words spell out the lead-in.
  for (let count = 1; count < words.length; count += 1) {
    const head = normalizeEcho(words.slice(0, count).join(" ")).replace(/[\s:,'"“”‘’-]+$/u, "");
    if (head.length > lead.length) break;
    if (head === lead) {
      const rest = words.slice(count).join(" ").replace(/^[\s:,–—-]+/u, "");
      return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : answer;
    }
  }
  return answer;
}

function normalizeEcho(text: string): string {
  return text.toLowerCase().replace(/[’‘]/gu, "'").replace(/\s+/gu, " ").trim();
}
