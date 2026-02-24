"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { popIn } from "@/lib/animations";

interface TimerProps {
  deadline: string | null;
  disabled?: boolean;
}

function computeRemaining(deadline: string | null): number {
  if (!deadline) return 0;
  return Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000));
}

function getUrgency(pct: number): "urgent" | "warning" | "normal" {
  if (pct < 20) return "urgent";
  if (pct < 40) return "warning";
  return "normal";
}

export function Timer({ deadline, disabled }: TimerProps) {
  const total = useMemo(() => {
    const remaining = computeRemaining(deadline);
    return remaining > 45 ? 90 : 45;
  }, [deadline]);

  // A tick counter that forces re-render every second, letting us derive remaining
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadline || disabled) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, disabled]);

  if (disabled) {
    return (
      <div className="w-full">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium text-ink-dim">Timer</span>
          <span className="font-mono font-bold text-lg text-ink-dim/50">OFF</span>
        </div>
        <div className="h-3 bg-raised/80 backdrop-blur-sm rounded-full overflow-hidden border border-edge">
          <div className="h-full rounded-full bg-ink-dim/20 w-full" />
        </div>
      </div>
    );
  }

  const remaining = computeRemaining(deadline);
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const urgency = getUrgency(pct);

  const urgencyStyles = {
    urgent: { bar: "bg-fail", text: "text-fail animate-pulse-urgent" },
    warning: { bar: "bg-gold", text: "text-gold" },
    normal: { bar: "bg-teal", text: "text-teal" },
  } as const;

  const { bar, text } = urgencyStyles[urgency];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ink-dim">Time remaining</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={urgency}
            className={`font-mono font-bold text-lg tabular-nums ${text}`}
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {remaining}s
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="h-3 bg-raised/80 backdrop-blur-sm rounded-full overflow-hidden border border-edge">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
