/** Human-only games have no lineup to pick, just a reminder of who plays. */
export function HumanPlayerGuidance({
  minPlayers,
  maxPlayers,
}: {
  minPlayers: number;
  maxPlayers: number;
}) {
  return (
    <p className="text-sm text-ink-dim">
      {minPlayers}–{maxPlayers} players, each on their own phone
    </p>
  );
}
