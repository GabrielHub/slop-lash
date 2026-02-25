"use client";

import { motion } from "motion/react";
import { GameState } from "@/lib/types";
import { springGentle } from "@/lib/animations";
import { PlayerAvatar } from "@/components/player-avatar";
import { HumorBadge } from "@/components/humor-badge";

export function ScoreBarChart({ game }: { game: GameState }) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const maxScore = sorted[0]?.score || 1;

  return (
    <motion.div
      className="space-y-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1 } },
      }}
    >
      {sorted.map((player, idx) => {
        const pct = (player.score / maxScore) * 100;
        const isWinner = idx === 0;

        return (
          <motion.div
            key={player.id}
            className="flex items-center gap-3"
            variants={{
              hidden: { opacity: 0, x: -20 },
              visible: { opacity: 1, x: 0, transition: springGentle },
            }}
          >
            {/* Rank */}
            <span
              className={`w-6 text-center font-mono font-bold text-base shrink-0 ${
                isWinner ? "text-gold" : "text-ink-dim"
              }`}
              style={isWinner ? { textShadow: "0 0 8px rgba(255, 214, 68, 0.3)" } : undefined}
            >
              {idx + 1}
            </span>

            {/* Icon */}
            <PlayerAvatar name={player.name} modelId={player.modelId} size={24} />

            {/* Name */}
            <span
              className={`w-20 sm:w-28 text-base font-semibold truncate shrink-0 ${
                isWinner ? "text-gold" : "text-ink"
              }`}
            >
              {player.name}
            </span>

            <HumorBadge humorRating={player.humorRating} />

            {/* Bar track */}
            <div className="flex-1 h-8 rounded-lg bg-edge/40 relative overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-lg"
                initial={{ width: "0%" }}
                animate={{ width: `${Math.max(pct, 4)}%` }}
                transition={{ ...springGentle, delay: 0.2 + idx * 0.1 }}
                style={
                  isWinner
                    ? {
                        background: "linear-gradient(90deg, var(--gold) 0%, color-mix(in srgb, var(--gold) 70%, var(--punch) 30%) 100%)",
                        boxShadow: "0 0 14px color-mix(in srgb, var(--gold) 40%, transparent), 0 0 4px color-mix(in srgb, var(--gold) 20%, transparent) inset",
                      }
                    : {
                        background: "linear-gradient(90deg, var(--teal) 30%, color-mix(in srgb, var(--teal) 50%, transparent) 100%)",
                        opacity: 0.45,
                      }
                }
              />
            </div>

            {/* Score */}
            <motion.span
              className={`font-mono font-bold text-base tabular-nums shrink-0 w-12 text-right ${
                isWinner ? "text-gold" : "text-ink-dim"
              }`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + idx * 0.1 }}
            >
              {player.score}
            </motion.span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
