"use client";

import { motion, AnimatePresence } from "motion/react";
import { popIn } from "@/lib/animations";
import { useRoom, useServerNow } from "@/room/context";

export function computeRemainingSeconds(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs === null || !Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function computeTimerPercentage(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / total) * 100));
}

export function getTimerUrgency(pct: number, remaining: number): "urgent" | "warning" | "normal" {
  if (remaining <= 5 || pct < 20) return "urgent";
  if (remaining <= 10 || pct < 40) return "warning";
  return "normal";
}

export type PhaseCountdown = {
  /** The room has timers off, or this phase waits for players. */
  untimed: boolean;
  remaining: number;
  total: number;
  pct: number;
  urgency: "urgent" | "warning" | "normal";
  /** The deadline passed and the server is moving the room on. */
  expired: boolean;
};

/** The current phase's countdown on the server's clock. */
export function usePhaseCountdown(): PhaseCountdown {
  const { room } = useRoom().view;
  const now = useServerNow();
  const deadline = room.phaseDeadline;
  if (deadline === null) {
    return { untimed: true, remaining: 0, total: 0, pct: 0, urgency: "normal", expired: false };
  }
  const total = Math.max(1, Math.round((deadline - room.phaseStartedAt) / 1000));
  const remaining = computeRemainingSeconds(deadline, now);
  const pct = computeTimerPercentage(remaining, total);
  return {
    untimed: false,
    remaining,
    total,
    pct,
    urgency: getTimerUrgency(pct, remaining),
    expired: remaining === 0,
  };
}

const URGENCY_STYLES = {
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

/** A countdown bar for the current phase. Renders nothing for untimed phases. */
export function Timer({ label = "Time remaining" }: { label?: string }) {
  const countdown = usePhaseCountdown();
  if (countdown.untimed) return null;
  const { remaining, total, pct, urgency, expired } = countdown;
  const style = URGENCY_STYLES[urgency];
  const spoken = expired ? "Time is up" : `${remaining} seconds remaining`;

  return (
    <div className="w-full" role="timer" aria-live="off" aria-label={spoken}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ui-muted">{label}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={expired ? "expired" : urgency}
            className={`font-mono font-bold text-xl ${expired ? "text-ui-faint" : `tabular-nums ${style.text}`}`}
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {expired ? "Time!" : `${remaining}s`}
          </motion.span>
        </AnimatePresence>
      </div>
      <progress
        className="sr-only"
        aria-label={label}
        max={total}
        value={Math.min(total, remaining)}
      />
      <div
        aria-hidden="true"
        className={`h-3 bg-raised/80 backdrop-blur-sm rounded-full overflow-hidden border transition-colors duration-500 ${style.track}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${style.bar}`}
          style={{ width: `${pct}%`, boxShadow: style.glow }}
        />
      </div>
    </div>
  );
}
