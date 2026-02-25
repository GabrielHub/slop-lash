"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { playSound } from "@/lib/sounds";

interface PromptOutcomeStampProps {
  isUnanimous: boolean;
  aiBeatsHuman: boolean;
  allPassed: boolean;
  /** Staggered animation delay based on prompt position */
  delay: number;
}

/**
 * Renders the outcome stamp for a prompt result card:
 * ALL PASSED, SLOPPED!, FLAWLESS!, or "Lost to the slop".
 * Shared between results.tsx and recap-shell.tsx.
 */
export function PromptOutcomeStamp({
  isUnanimous,
  aiBeatsHuman,
  allPassed,
  delay,
}: PromptOutcomeStampProps): React.ReactNode {
  // Play stamp-slam sound for stamp variants (allPassed, SLOPPED!, FLAWLESS!)
  const hasStamp = allPassed || isUnanimous;
  const stampFired = useRef(false);
  useEffect(() => {
    if (!hasStamp) {
      stampFired.current = false;
      return;
    }
    if (stampFired.current) return;
    stampFired.current = true;

    const timer = setTimeout(() => playSound("stamp-slam"), delay * 1000);
    return () => clearTimeout(timer);
  }, [hasStamp, delay]);

  if (allPassed) {
    return (
      <motion.div
        className="mt-4 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay }}
      >
        <div
          className="animate-stamp-slam inline-flex flex-col items-center gap-0.5 px-5 py-2 rounded-lg border-2 border-ink-dim/40 bg-ink/5"
          style={{ boxShadow: "0 0 16px rgba(0, 0, 0, 0.08)" }}
        >
          <span className="font-display font-black text-lg tracking-[0.15em] uppercase text-ink-dim">
            ALL PASSED
          </span>
          <span className="text-[10px] font-bold text-ink-dim/60 uppercase tracking-wider">
            Penalty applied
          </span>
        </div>
      </motion.div>
    );
  }

  if (isUnanimous && aiBeatsHuman) {
    return (
      <motion.div
        className="mt-4 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay }}
      >
        <div
          className="animate-stamp-slam inline-flex flex-col items-center gap-0.5 px-5 py-2 rounded-lg border-2 border-punch bg-punch/15"
          style={{
            boxShadow: "0 0 20px rgba(255, 86, 71, 0.2)",
            textShadow: "0 0 12px rgba(255, 86, 71, 0.3)",
          }}
        >
          <span className="font-display font-black text-lg tracking-[0.15em] uppercase text-punch">
            SLOPPED!
          </span>
          <span className="text-[10px] font-bold text-punch/60 uppercase tracking-wider">
            Lost to the machine
          </span>
        </div>
      </motion.div>
    );
  }

  if (isUnanimous) {
    return (
      <motion.div
        className="mt-4 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay }}
      >
        <div
          className="animate-stamp-slam inline-flex items-center gap-1.5 px-5 py-2 rounded-lg border-2 border-teal bg-teal/15"
          style={{
            boxShadow: "0 0 20px rgba(45, 212, 184, 0.2)",
            textShadow: "0 0 12px rgba(45, 212, 184, 0.3)",
          }}
        >
          <span className="font-display font-black text-lg tracking-[0.15em] uppercase text-teal">
            FLAWLESS!
          </span>
        </div>
      </motion.div>
    );
  }

  if (aiBeatsHuman) {
    return (
      <motion.div
        className="mt-4 flex justify-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.1 }}
      >
        <div
          className="animate-slop-drip inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border-2 border-punch/30 bg-gradient-to-b from-punch/10 to-punch/5"
          style={{ boxShadow: "0 4px 12px rgba(255, 86, 71, 0.1)" }}
        >
          <span className="font-display font-bold text-sm text-punch uppercase tracking-wider">
            Lost to the slop
          </span>
        </div>
      </motion.div>
    );
  }

  return null;
}
