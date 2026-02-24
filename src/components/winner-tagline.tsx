"use client";

import { motion } from "motion/react";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { popIn } from "@/lib/animations";
import type { GamePlayer } from "@/lib/types";

interface WinnerTaglineProps {
  winner: GamePlayer;
  tagline: string;
  isStreaming: boolean;
}

export function WinnerTagline({ winner, tagline, isStreaming }: WinnerTaglineProps) {
  const model = winner.modelId ? getModelByModelId(winner.modelId) : null;

  if (!tagline && !isStreaming) return null;

  return (
    <motion.div
      className="w-full max-w-lg mx-auto mb-8"
      variants={popIn}
      initial="hidden"
      animate="visible"
    >
      <div
        className="relative p-4 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-gold/40 icon-glow-gold"
      >
        <div className="flex items-center gap-2 mb-2">
          {model && <ModelIcon model={model} size={20} />}
          <span className="text-sm font-medium text-gold">
            {model?.shortName ?? winner.name} says:
          </span>
        </div>

        <p className="text-base font-semibold text-ink leading-relaxed">
          {tagline && <>&ldquo;</>}{tagline}
          {isStreaming && (
            <span className="inline-block w-[2px] h-[1em] bg-gold ml-0.5 align-middle animate-blink-cursor" />
          )}
          {!isStreaming && tagline && <>&rdquo;</>}
        </p>
      </div>
    </motion.div>
  );
}
