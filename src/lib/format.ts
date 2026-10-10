/** 1st, 2nd, 3rd, 4th, ... 11th, 12th, 13th, 21st. */
export function ordinal(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;
  const suffix = ["th", "st", "nd", "rd"][place % 10] ?? "th";
  return `${place}${suffix}`;
}

const MINUS = "−";

/** "1,250", and "−150" with a true minus sign. */
export function formatPoints(n: number): string {
  // Round first, so a count passing through -0.3 reads "0", not "−0".
  const rounded = Math.round(n);
  const body = Math.abs(rounded).toLocaleString("en-US");
  return rounded < 0 ? `${MINUS}${body}` : body;
}

/** "+250", "−150" or "0". */
export function formatDelta(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : MINUS}${formatPoints(Math.abs(rounded))}`;
}
