"use client";

import { motion, AnimatePresence } from "motion/react";

type NarratorState = "speaking" | "connected" | "off";

interface NarratorIndicatorProps {
  state: NarratorState;
}

const BAR_COUNT = 4;
const BAR_HEIGHTS = [0.55, 0.9, 0.65, 0.8];
const BAR_DELAYS = [0, 0.12, 0.06, 0.18];

export function NarratorIndicator({ state }: NarratorIndicatorProps) {
  if (state === "off") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        className="flex items-center gap-1.5"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="flex items-end gap-[2px]"
          style={{ height: 14, width: 16 }}
          role="status"
          aria-label={state === "speaking" ? "Narrator is speaking" : "Narrator connected"}
        >
          {state === "speaking" ? (
            Array.from({ length: BAR_COUNT }, (_, i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-teal"
                initial={{ height: "20%" }}
                animate={{
                  height: ["20%", `${BAR_HEIGHTS[i] * 100}%`, "30%", `${BAR_HEIGHTS[(i + 2) % BAR_COUNT] * 100}%`, "20%"],
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
                className="w-[6px] h-[6px] rounded-full bg-teal"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}
        </div>

        <span className="text-[10px] font-bold uppercase tracking-wider text-teal select-none hidden sm:inline">
          {state === "speaking" ? "Live" : "On Air"}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
