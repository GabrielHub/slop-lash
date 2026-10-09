"use client";

import type { ReactNode } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { usePlayers } from "./context";

/**
 * Building blocks every game can use. They draw with the base tokens
 * (`surface`, `edge`, `ink`, `win`, ...), which each game's theme remaps, so
 * the same component takes on SlopLash, MatchSlop, or QuizSlop colors.
 */

/** A quiet card for "waiting on the room" and similar status lines. */
export function StatusCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-surface/70 p-5 text-center text-ink-dim">
      {children}
    </div>
  );
}

/** Who is in and who the room is still waiting on, for submission phases. */
export function PlayerProgress({
  label,
  doneIds,
  aside,
}: {
  label: string;
  doneIds: readonly string[];
  /** Shown beside the count, e.g. a timer. */
  aside?: ReactNode;
}) {
  const { players } = usePlayers();
  const done = new Set(doneIds);
  const count = players.filter((player) => done.has(player.id)).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {aside && <div className="flex-1 min-w-0">{aside}</div>}
        <p className="font-display text-sm font-bold text-ink">
          {label}{" "}
          <span className="font-mono tabular-nums text-ink-dim">
            {count}/{players.length}
          </span>
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {players.map((player) => {
          const isDone = done.has(player.id);
          return (
            <li
              key={player.id}
              className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-xs font-semibold transition-colors ${
                isDone
                  ? "border-win/40 bg-win-soft text-ink"
                  : "border-edge bg-raised text-ink-dim opacity-60"
              }`}
            >
              <PlayerAvatar name={player.name} modelId={player.modelId} size={18} />
              {player.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
