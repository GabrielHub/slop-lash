"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { popIn } from "@/lib/animations";

interface TimerProps {
  deadline: string | null;
  disabled?: boolean;
  total?: number;
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

export function Timer({ deadline, disabled, total: totalOverride }: TimerProps) {
  const total = useMemo(() => {
    if (totalOverride != null) return totalOverride;
    const remaining = computeRemaining(deadline);
    return remaining > 45 ? 90 : 45;
  }, [deadline, totalOverride]);

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
          <span className="text-sm font-medium text-ui-muted">Timer</span>
          <span className="font-mono font-bold text-lg text-ui-faint">OFF</span>
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
    urgent: {
      bar: "timer-bar-urgent",
      text: "text-fail animate-pulse-urgent",
      track: "border-fail/20",
      glow: "0 0 10px color-mix(in srgb, var(--fail) 30%, transparent)",
    },
    warning: {
      bar: "timer-bar-warning",
      text: "text-gold",
      track: "border-gold/15",
      glow: "0 0 8px color-mix(in srgb, var(--gold) 20%, transparent)",
    },
    normal: {
      bar: "timer-bar-normal",
      text: "text-teal",
      track: "border-edge",
      glow: "none",
    },
  } as const;

  const style = urgencyStyles[urgency];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ui-muted">Time remaining</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={urgency}
            className={`font-mono font-bold text-xl tabular-nums ${style.text}`}
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {remaining}s
          </motion.span>
        </AnimatePresence>
      </div>
      <div className={`h-3 bg-raised/80 backdrop-blur-sm rounded-full overflow-hidden border transition-colors duration-500 ${style.track}`}>
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${style.bar}`}
          style={{ width: `${pct}%`, boxShadow: style.glow }}
        />
      </div>
    </div>
  );
}
