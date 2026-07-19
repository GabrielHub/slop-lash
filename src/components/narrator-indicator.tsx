"use client";

import { motion, AnimatePresence } from "motion/react";
import type { NarratorStatus } from "@/hooks/use-narrator";

interface NarratorIndicatorProps {
  state: NarratorStatus;
  detail?: string | null;
}

const BAR_COUNT = 4;
const BAR_HEIGHTS = [0.55, 0.9, 0.65, 0.8];
const BAR_DELAYS = [0, 0.12, 0.06, 0.18];

const STATE_LABELS: Record<Exclude<NarratorStatus, "off">, string> = {
  blocked: "Enable audio",
  error: "Narrator error",
  generating: "Generating",
  ready: "Armed",
  speaking: "Speaking",
};

const STATE_COLORS: Record<Exclude<NarratorStatus, "off">, string> = {
  blocked: "text-gold",
  error: "text-fail",
  generating: "text-teal",
  ready: "text-teal",
  speaking: "text-teal",
};

export function NarratorIndicator({ state, detail }: NarratorIndicatorProps) {
  if (state === "off") return null;
  const label = STATE_LABELS[state];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        className={`flex items-center gap-1.5 ${STATE_COLORS[state]}`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
        title={detail ?? label}
      >
        <output
          className="flex items-end gap-[2px]"
          style={{ height: 14, width: 16 }}
          aria-label={`Narrator: ${label}`}
        >
          {state === "speaking" ? (
            Array.from({ length: BAR_COUNT }, (_, i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-current"
                initial={{ height: "20%" }}
                animate={{
                  height: [
                    "20%",
                    `${BAR_HEIGHTS[i] * 100}%`,
                    "30%",
                    `${BAR_HEIGHTS[(i + 2) % BAR_COUNT] * 100}%`,
                    "20%",
                  ],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: BAR_DELAYS[i],
                  ease: "easeInOut",
                }}
              />
            ))
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <motion.div
                className="w-[6px] h-[6px] rounded-full bg-current"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}
        </output>

        <span className="hidden select-none text-[10px] font-bold uppercase tracking-wider sm:inline">
          {label}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
