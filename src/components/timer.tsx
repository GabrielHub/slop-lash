"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { popIn } from "@/lib/animations";

interface TimerProps {
  deadline: string | null;
  disabled?: boolean;
  total?: number;
  serverNow?: string | null;
}

export function computeRemainingSeconds(deadline: string | null, nowMs: number): number {
  if (!deadline) return 0;
  const deadlineMs = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
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

export function Timer({ deadline, disabled, total: totalOverride, serverNow }: TimerProps) {
  const syncRef = useRef({ receivedAtMs: 0, serverNowMs: 0 });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [derivedTotal, setDerivedTotal] = useState(() => {
    if (totalOverride != null) return totalOverride;
    return Math.max(1, computeRemainingSeconds(deadline, Date.now()));
  });

  const readSyncedNowMs = useCallback(() => {
    const clientNowMs = Date.now();
    return syncRef.current.serverNowMs > 0
      ? syncRef.current.serverNowMs + (clientNowMs - syncRef.current.receivedAtMs)
      : clientNowMs;
  }, []);

  const syncClock = useCallback(() => {
    setNowMs(readSyncedNowMs());
  }, [readSyncedNowMs]);

  const syncPhase = useCallback(() => {
    const nextNowMs = readSyncedNowMs();
    setNowMs(nextNowMs);
    if (totalOverride == null) {
      setDerivedTotal(Math.max(1, computeRemainingSeconds(deadline, nextNowMs)));
    }
  }, [deadline, readSyncedNowMs, totalOverride]);

  const total = totalOverride ?? derivedTotal;

  useEffect(() => {
    const timer = setTimeout(() => {
      syncPhase();
    }, 0);
    if (!deadline || disabled) {
      return () => clearTimeout(timer);
    }

    const interval = setInterval(syncClock, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [deadline, disabled, syncClock, syncPhase]);

  useEffect(() => {
    if (!serverNow) return;

    const parsedServerNowMs = new Date(serverNow).getTime();
    if (Number.isNaN(parsedServerNowMs)) return;

    syncRef.current.receivedAtMs = Date.now();
    syncRef.current.serverNowMs = parsedServerNowMs;
  }, [serverNow]);

  if (disabled) {
    return (
      <div className="w-full" role="timer" aria-live="off" aria-label="Timer off">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium text-ui-muted">Timer</span>
          <span className="font-mono font-bold text-lg text-ui-faint">OFF</span>
        </div>
        <progress className="sr-only" aria-label="Timer off" max={1} value={0} />
        <div
          aria-hidden="true"
          className="h-3 bg-raised/80 backdrop-blur-sm rounded-full overflow-hidden border border-edge"
        >
          <div className="h-full rounded-full bg-ink-dim/20 w-full" />
        </div>
      </div>
    );
  }

  const remaining = computeRemainingSeconds(deadline, nowMs);
  const pct = computeTimerPercentage(remaining, total);
  const isAdvancing = remaining === 0 && deadline != null;
  const urgency = getTimerUrgency(pct, remaining);
  const accessibleTotal = Math.max(1, total);
  const accessibleRemaining = Math.min(accessibleTotal, remaining);

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
    <div
      className="w-full"
      role="timer"
      aria-live="off"
      aria-label={isAdvancing ? "Time expired; advancing" : `${remaining} seconds remaining`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ui-muted">Time remaining</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={isAdvancing ? "advancing" : urgency}
            className={`font-mono font-bold text-xl ${isAdvancing ? "text-ui-faint" : `tabular-nums ${style.text}`}`}
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {isAdvancing ? "Advancing..." : `${remaining}s`}
          </motion.span>
        </AnimatePresence>
      </div>
      <progress
        className="sr-only"
        aria-label="Time remaining"
        aria-valuetext={isAdvancing ? "Time expired; advancing" : `${remaining} seconds remaining`}
        max={accessibleTotal}
        value={accessibleRemaining}
      />
      <div
        aria-hidden="true"
        className={`h-3 bg-raised/80 backdrop-blur-sm rounded-full overflow-hidden border transition-colors duration-500 ${style.track}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${style.bar}`}
          style={{ width: `${pct}%`, boxShadow: style.glow }}
        />
      </div>
    </div>
  );
}
