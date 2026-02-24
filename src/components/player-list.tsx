"use client";

import { motion, AnimatePresence } from "motion/react";
import { GamePlayer } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { getPlayerColor } from "@/lib/player-colors";
import { staggerContainer, fadeInUp, popIn } from "@/lib/animations";

export function PlayerList({
  players,
  showScores = false,
}: {
  players: GamePlayer[];
  showScores?: boolean;
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

          return (
            <motion.div
              key={player.id}
              className="flex items-center justify-between p-3 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge"
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
                <span className="font-semibold text-base truncate text-ink">
                  {player.name}
                </span>
                {player.type === "AI" && (
                  <span className="text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-ai-soft text-ai shrink-0">
                    AI
                  </span>
                )}
              </div>
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
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
