/** 1st, 2nd, 3rd, 4th, ... 11th, 12th, 13th, 21st. */
export function ordinal(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;
  const suffix = ["th", "st", "nd", "rd"][place % 10] ?? "th";
  return `${place}${suffix}`;
}

/** Points with an explicit sign: +100, -150, 0. */
export function formatSigned(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}
