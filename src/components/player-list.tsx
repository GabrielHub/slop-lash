"use client";

import { motion, AnimatePresence } from "motion/react";
import { GamePlayer } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { getPlayerColor } from "@/lib/player-colors";
import { staggerContainer, fadeInUp, popIn } from "@/lib/animations";
import { HumorBadge } from "@/components/humor-badge";

function TypeBadge({ label, variant }: { label: string; variant: "ai" | "spectator" | "afk" | "disconnected" }) {
  const styles = {
    ai: "bg-ai-soft text-ai",
    spectator: "bg-surface text-ink-dim",
    afk: "bg-fail-soft text-fail",
    disconnected: "bg-surface text-ink-dim",
  };
  return (
    <span className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${styles[variant]}`}>
      {label}
    </span>
  );
}

export function PlayerList({
  players,
  showScores = false,
  onKick,
  hostPlayerId,
}: {
  players: GamePlayer[];
  showScores?: boolean;
  onKick?: (playerId: string) => void;
  hostPlayerId?: string;
}) {
  return (
    <motion.div
      className="space-y-2"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout">
        {players.map((player) => {
          const model = player.modelId
            ? getModelByModelId(player.modelId)
            : null;
          const isAfk = player.idleRounds >= 1 && player.type === "HUMAN";
          const isDisconnected = player.participationStatus === "DISCONNECTED";

          return (
            <motion.div
              key={player.id}
              className={`flex items-center justify-between p-3 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge${isDisconnected ? " opacity-50" : ""}`}
              style={{ boxShadow: "var(--shadow-card)" }}
              variants={fadeInUp}
              layout
              exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {model ? (
                  <ModelIcon model={model} size={24} className="shrink-0" />
                ) : (
                  <span
                    className="w-6 h-6 flex items-center justify-center rounded-sm text-sm font-bold shrink-0"
                    style={{
                      color: getPlayerColor(player.name),
                      backgroundColor: `${getPlayerColor(player.name)}20`,
                    }}
                  >
                    {player.name[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <span className={`font-semibold text-base truncate${isDisconnected ? " text-ink-dim line-through" : " text-ink"}`}>
                  {player.name}
                </span>
                {isDisconnected && <TypeBadge label="LEFT" variant="disconnected" />}
                {player.type === "AI" && !isDisconnected && <TypeBadge label="AI" variant="ai" />}
                {player.type === "SPECTATOR" && <TypeBadge label="SPECTATOR" variant="spectator" />}
                {isAfk && !isDisconnected && <TypeBadge label="AFK" variant="afk" />}
                {!isDisconnected && <HumorBadge humorRating={player.humorRating} />}
              </div>
              <div className="flex items-center gap-2">
                {showScores && (
                  <motion.span
                    key={player.score}
                    className="font-mono font-bold text-gold text-base tabular-nums"
                    variants={popIn}
                    initial="hidden"
                    animate="visible"
                  >
                    {player.score}
                  </motion.span>
                )}
                {onKick && player.id !== hostPlayerId && !isDisconnected && (
                  <button
                    onClick={() => onKick(player.id)}
                    className="text-xs text-ink-dim hover:text-fail transition-colors cursor-pointer px-1.5 py-0.5 rounded"
                    title="Kick player"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
