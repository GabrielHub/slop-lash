export function PlayerCountHint({
  total,
  minPlayers,
  maxPlayers,
  humanOnly = false,
}: {
  total: number;
  minPlayers: number;
  maxPlayers: number;
  humanOnly?: boolean;
}) {
  const remaining = maxPlayers - total;
  if (remaining <= 0) return null;

  if (humanOnly) {
    const needed = minPlayers - total;
    if (needed > 0) {
      return (
        <p className="mb-3 text-xs text-gold/85">
          {needed} more human {needed === 1 ? "needs" : "players need"} to join before starting
        </p>
      );
    }
  } else {
    if (total > 0 && total % 2 !== 0) {
      return (
        <p className="mb-3 text-xs text-gold/85">1 more player needs to join for even teams</p>
      );
    }
    if (total < minPlayers) return null;
  }

  return (
    <p className="mb-3 text-xs text-ink-dim/50">
      {remaining} open {remaining === 1 ? "slot" : "slots"} for more players
    </p>
  );
}

export function HumanPlayerGuidance({
  displayName,
  minPlayers,
  maxPlayers,
  quizSlop,
}: {
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  quizSlop: boolean;
}) {
  return (
    <div className="rounded-xl border-2 border-edge bg-surface/80 p-5 text-sm text-ink-dim">
      <p className="font-semibold text-ink">
        {displayName} is for {minPlayers}–{maxPlayers} humans.
      </p>
      <p className="mt-2 leading-relaxed">
        Create the room, put the stage on the shared screen, then have everyone join on their own
        device.
        {quizSlop
          ? " Every section, each candidate gets a different question and answers for somebody else. One candidate is catastrophically unhelpful."
          : " Private controls stay on each player’s device."}
      </p>
    </div>
  );
}
