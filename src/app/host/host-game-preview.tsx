"use client";

import { motion } from "motion/react";
import type { GameType } from "@/games/core/types";
import { PreviewPlayer } from "@/tutorial/preview";

/**
 * The picked game's preview spot on a 16:9 screen. Picking another game cuts
 * to its spot from the top, like changing the channel: the old spot leaves at
 * once (SlopLash has no theme of its own, so it would repaint in the next game's palette as it faded).
 */
export function HostGamePreview({ gameType }: { gameType: GameType }) {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-video overflow-hidden rounded-2xl border-2 border-(--host-accent)/45 bg-canvas shadow-[0_18px_48px_-24px_var(--host-accent)] transition-[border-color,box-shadow] duration-300"
    >
      <motion.div
        key={gameType}
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <PreviewPlayer game={gameType} />
      </motion.div>
    </div>
  );
}
