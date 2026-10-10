"use client";

import { motion, AnimatePresence } from "motion/react";
import { CrossIcon } from "@/components/icons";
import type { RoomPlayer } from "./context";
import { Avatar } from "./avatar";
import { useTwoTap } from "./host-actions";
import { enter, listParent, pop } from "@/lib/animations";

function TypeBadge({ label, variant }: { label: string; variant: "ai" | "host" | "offline" }) {
  const styles = {
    ai: "bg-ai-soft text-ai",
    host: "bg-gold/15 text-gold",
    offline: "bg-raised text-ink-dim",
  };
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider ${styles[variant]}`}
    >
      {label}
    </span>
  );
}

/**
 * The room's players as rows. With `onKick`, each row (except the host's) gets
 * a 44px remove control that needs two taps: the first turns it red and asks
 * "Remove?". `kickOnHover` hides the control until the row is hovered or
 * focused, for the big screen where the whole room can see it.
 */
export function PlayerList({
  players,
  showScores = false,
  onKick,
  hostPlayerId,
  kickOnHover = false,
}: {
  players: RoomPlayer[];
  showScores?: boolean;
  onKick?: (player: RoomPlayer) => void;
  hostPlayerId?: string | null;
  kickOnHover?: boolean;
}) {
  const { armed, press } = useTwoTap();
  return (
    <motion.ul
      className="space-y-2"
      variants={listParent(players.length)}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {players.map((player) => {
          const offline = !player.online;
          const isArmed = armed === player.id;
          return (
            <motion.li
              key={player.id}
              layout
              variants={enter}
              exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
              className={`group flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 border-edge bg-surface py-1.5 pl-3 pr-1.5 ${
                offline ? "opacity-60" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={player.name} modelId={player.modelId} size="1.75rem" />
                <span
                  className={`truncate text-base font-semibold ${offline ? "text-ink-dim" : "text-ink"}`}
                >
                  {player.name}
                </span>
                {player.id === hostPlayerId && <TypeBadge label="Host" variant="host" />}
                {player.type === "AI" && <TypeBadge label="AI" variant="ai" />}
                {offline && <TypeBadge label="Away" variant="offline" />}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {showScores && (
                  <motion.span
                    key={player.score}
                    className="px-1.5 font-mono text-base font-bold tabular-nums text-gold"
                    variants={pop}
                    initial="hidden"
                    animate="visible"
                  >
                    {player.score}
                  </motion.span>
                )}
                {onKick && player.id !== hostPlayerId && (
                  <button
                    type="button"
                    aria-label={
                      isArmed ? `Tap again to remove ${player.name}` : `Remove ${player.name}`
                    }
                    onClick={() => press(player.id, () => onKick(player))}
                    className={`flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-[color,background-color,opacity] ${
                      isArmed
                        ? "bg-fail text-accent-ink"
                        : `text-ink-dim hover:bg-raised hover:text-fail ${
                            kickOnHover
                              ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              : ""
                          }`
                    }`}
                  >
                    <CrossIcon />
                    {isArmed && <span>Remove?</span>}
                  </button>
                )}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
}
