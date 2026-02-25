"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HR_HOT_THRESHOLD, HR_COLD_THRESHOLD } from "@/lib/game-constants";

interface HumorBadgeProps {
  humorRating: number;
}

export function HumorBadge({ humorRating }: HumorBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isHot = humorRating >= HR_HOT_THRESHOLD;
  const isCold = humorRating <= HR_COLD_THRESHOLD;

  if (!isHot && !isCold) return null;
  const emoji = isHot ? "\u{1F525}" : "\u2744\uFE0F";
  const label = isHot ? "Hot" : "Cold";

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md cursor-pointer select-none ${
          isHot
            ? "bg-punch/15 text-punch animate-heat-pulse"
            : "bg-human-soft text-human"
        }`}
      >
        {emoji} {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 p-3 rounded-xl bg-surface/95 backdrop-blur-md border-2 border-edge shadow-lg z-50"
          >
            <p className="font-display font-bold text-sm mb-1">
              {emoji} {isHot ? "On Fire!" : "Ice Cold"}
            </p>
            <p className="text-xs text-ink-dim leading-relaxed">
              Humor Rating: <span className="font-mono font-bold text-ink">{humorRating.toFixed(1)}</span>
            </p>
            <p className="text-xs text-ink-dim/80 leading-relaxed mt-1">
              {isHot
                ? "Winning prompts boost your humor rating. Funny players' votes carry more weight!"
                : "Losing prompts lowers your humor rating. Win some prompts to heat back up!"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
