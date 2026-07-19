import { MATCHSLOP_IDENTITIES, type MatchSlopIdentity } from "@/games/matchslop/identities";

export { getCostTier } from "@/lib/models";

export const MATCHSLOP_IDENTITY_OPTIONS: { id: MatchSlopIdentity; label: string }[] =
  MATCHSLOP_IDENTITIES.map((id) => ({
    id,
    label: id === "NON_BINARY" ? "Non-binary" : id.charAt(0) + id.slice(1).toLowerCase(),
  }));
