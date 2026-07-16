/** Every supported mode needs two distinct competitors to form a valid next round. */
export const MIN_CONTINUING_PLAYERS = 2;

/** Canonical roster rule used by every game mode and room mutation. */
export function isActiveCompetitor<
  T extends {
    participationStatus: "ACTIVE" | "DISCONNECTED";
    type: "AI" | "HUMAN" | "SPECTATOR";
  },
>(player: T): player is T & { participationStatus: "ACTIVE"; type: "AI" | "HUMAN" } {
  return player.type !== "SPECTATOR" && player.participationStatus === "ACTIVE";
}
