import type { MatchSlopIdentity } from "./types";

export type { MatchSlopIdentity };

export const MATCHSLOP_IDENTITIES: readonly MatchSlopIdentity[] = [
  "MAN",
  "WOMAN",
  "NON_BINARY",
  "OTHER",
] as const;
