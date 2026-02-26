import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function createHostControlToken(): string {
  return randomBytes(18).toString("base64url");
}

export function hashHostControlToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseHostToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function matchesHostControlToken(
  expectedHash: string | null | undefined,
  token: string | null | undefined,
): boolean {
  if (!expectedHash || !token) return false;
  const actual = Buffer.from(hashHostControlToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
