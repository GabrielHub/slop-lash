"use client";

import { motion } from "motion/react";
import { GameState } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { springGentle } from "@/lib/animations";

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
        const model = player.modelId
          ? getModelByModelId(player.modelId)
          : null;

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
              className={`w-6 text-center font-mono font-bold text-sm shrink-0 ${
                isWinner ? "text-gold" : "text-ink-dim"
              }`}
            >
              {idx + 1}
            </span>

            {/* Icon */}
            <div className="shrink-0">
              {model ? (
                <ModelIcon model={model} size={22} />
              ) : (
                <span className="w-[22px] h-[22px] flex items-center justify-center rounded-sm bg-human-soft text-human text-xs font-bold">
                  H
                </span>
              )}
            </div>

            {/* Name */}
            <span
              className={`w-20 sm:w-28 text-sm font-semibold truncate shrink-0 ${
                isWinner ? "text-gold" : "text-ink"
              }`}
            >
              {player.name}
            </span>

            {/* Bar track */}
            <div className="flex-1 h-8 rounded-lg bg-edge/40 relative overflow-hidden">
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-lg ${
                  isWinner
                    ? "bg-gold/80"
                    : "bg-teal/40"
                }`}
                initial={{ width: "0%" }}
                animate={{ width: `${Math.max(pct, 4)}%` }}
                transition={{ ...springGentle, delay: 0.2 + idx * 0.1 }}
                style={
                  isWinner
                    ? { boxShadow: "0 0 12px var(--gold)" }
                    : undefined
                }
              />
            </div>

            {/* Score */}
            <motion.span
              className={`font-mono font-bold text-sm tabular-nums shrink-0 w-10 text-right ${
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
