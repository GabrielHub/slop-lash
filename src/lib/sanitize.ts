export function sanitize(input: string, maxLength: number): string {
  const withoutTags = input.replace(/<[^>]*>/gu, "");
  const withoutControlCharacters = Array.from(withoutTags, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) ? "" : character;
  }).join("");

  return withoutControlCharacters.trim().slice(0, maxLength);
}
