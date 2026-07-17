import { CANONICAL_KEY_LENGTH } from "./game-constants";

/**
 * Trusted canonicalization for topic deduplication. The model never authors
 * the key: backend code (and catalog validation) build the basis from the
 * confirmed display label, scope, and exclusions/time-boundary entries, then
 * store the SHA-256 hex digest. Exact key equality is authoritative for atomic
 * collision rejection; semantic equivalence stays with the bounded verifier.
 */

const PUNCTUATION_OR_SYMBOL = /[\p{P}\p{S}]+/gu;
const WHITESPACE_RUN = /\s+/gu;

/** NFKC, locale-stable lowercase, punctuation stripped, whitespace collapsed. */
export function canonicalizeTopicText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(PUNCTUATION_OR_SYMBOL, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Deterministic canonical basis for a confirmed topic. */
export function buildCanonicalTopicBasis(input: {
  label: string;
  scope: string;
  exclusions: readonly string[];
}): string {
  const parts = [
    canonicalizeTopicText(input.label),
    canonicalizeTopicText(input.scope),
    ...input.exclusions.map(canonicalizeTopicText).filter((entry) => entry.length > 0),
  ];
  return parts.join("\n");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The stored `canonicalKey` for a confirmed topic. */
export async function computeCanonicalTopicKey(input: {
  label: string;
  scope: string;
  exclusions: readonly string[];
}): Promise<string> {
  return sha256Hex(buildCanonicalTopicBasis(input));
}

export function isCanonicalTopicKey(value: string): boolean {
  return value.length === CANONICAL_KEY_LENGTH && /^[0-9a-f]+$/u.test(value);
}
