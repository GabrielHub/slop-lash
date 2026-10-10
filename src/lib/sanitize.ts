/**
 * Cleans single-line player text: strips tags and control characters,
 * collapses line breaks (and the spaces around them) to one space, trims,
 * and caps the length. Every caller stores a one-line answer, chat line or
 * reply, and screens render them without preserving line breaks anyway. A
 * newline in a reply could also pose as a new transcript line in a prompt.
 */
export function sanitize(input: string, maxLength: number): string {
  const withoutTags = input.replace(/<[^>]*>/gu, "");
  const withoutControlCharacters = Array.from(withoutTags, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) ? "" : character;
  }).join("");
  const singleLine = withoutControlCharacters.replace(/\s*[\r\n\u2028\u2029]+\s*/gu, " ");

  return singleLine.trim().slice(0, maxLength);
}
