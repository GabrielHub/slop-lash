"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { DUR, EASE, SPRING } from "@/lib/animations";
import { useRoom, useServerNow } from "./context";

export function computeRemainingSeconds(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs === null || !Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function computeTimerPercentage(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / total) * 100));
}

export type PhaseCountdown = {
  /** The room has timers off, or this phase waits for players. */
  untimed: boolean;
  remaining: number;
  total: number;
  pct: number;
  /** The deadline passed and the server is moving the room on. */
  expired: boolean;
};

/** The current phase's countdown on the server's clock. */
export function usePhaseCountdown(): PhaseCountdown {
  const { room } = useRoom().view;
  const now = useServerNow();
  const deadline = room.phaseDeadline;
  if (deadline === null) {
    return { untimed: true, remaining: 0, total: 0, pct: 0, expired: false };
  }
  const total = Math.max(1, Math.round((deadline - room.phaseStartedAt) / 1000));
  const remaining = computeRemainingSeconds(deadline, now);
  const pct = computeTimerPercentage(remaining, total);
  return { untimed: false, remaining, total, pct, expired: remaining === 0 };
}

/**
 * The colour every shell countdown uses, by seconds left: teal, then gold at
 * 10s, then red at 5s. Seconds, not percent, so a 90s and a 20s phase warn
 * at the same moment.
 */
export type CountdownTone = "normal" | "warning" | "urgent";

export function countdownTone(remaining: number): CountdownTone {
  if (remaining <= 5) return "urgent";
  if (remaining <= 10) return "warning";
  return "normal";
}

/** Tailwind classes per tone, for countdowns drawn outside this file. */
export const TONE_CLASSES: Record<CountdownTone, { text: string; bg: string; stroke: string }> = {
  normal: { text: "text-teal-ink", bg: "bg-teal", stroke: "stroke-teal" },
  warning: { text: "text-gold-ink", bg: "bg-gold", stroke: "stroke-gold" },
  urgent: { text: "text-fail", bg: "bg-fail", stroke: "stroke-fail" },
};

const RING_RADIUS = 19;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Drains the current phase's countdown on the compositor: `scaleX` for a bar,
 * the dash offset for a ring. One Web Animation per deadline, so nothing
 * stair-steps once a second and re-renders never restart it. Under reduced
 * motion the element keeps the per-second inline value instead.
 */
export function usePhaseDrain<E extends HTMLElement | SVGElement>(kind: "bar" | "ring") {
  const { view, clockOffsetMs } = useRoom();
  const { phaseDeadline: deadline, phaseStartedAt: startedAt } = view.room;
  const reduced = useReducedMotion();
  const ref = useRef<E>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || deadline === null || reduced || typeof element.animate !== "function") return;
    const total = Math.max(1, deadline - startedAt);
    const left = Math.max(0, deadline - (Date.now() + clockOffsetMs));
    const from = Math.min(1, left / total);
    const frames =
      kind === "bar"
        ? [{ transform: `scaleX(${from})` }, { transform: "scaleX(0)" }]
        : [
            { strokeDashoffset: `${-(1 - from) * RING_LENGTH}` },
            { strokeDashoffset: `${-RING_LENGTH}` },
          ];
    const animation = element.animate(frames, {
      duration: Math.max(1, left),
      easing: "linear",
      fill: "forwards",
    });
    return () => animation.cancel();
  }, [deadline, startedAt, clockOffsetMs, reduced, kind]);

  return ref;
}

function spokenCountdown({ expired, remaining }: PhaseCountdown) {
  return expired ? "Time is up" : `${remaining} seconds remaining`;
}

/**
 * The seconds left as text in a fixed-width slot, so "Time!" replaces the
 * digits instead of overlapping them. Ticks once a second in the last five.
 */
export function CountdownDigits({
  countdown,
  className = "",
}: {
  countdown: PhaseCountdown;
  className?: string;
}) {
  const { remaining, expired } = countdown;
  const tone = TONE_CLASSES[countdownTone(remaining)];
  return (
    <motion.span
      key={expired ? "expired" : remaining <= 5 ? remaining : "steady"}
      className={`inline-block min-w-[3ch] text-center font-mono font-bold tabular-nums ${
        expired ? "text-fail" : tone.text
      } ${className}`}
      initial={remaining <= 5 ? { scale: 1.18 } : false}
      animate={{ scale: 1 }}
      transition={SPRING.snappy}
    >
      {expired ? "Time!" : `${remaining}s`}
    </motion.span>
  );
}

/**
 * The stage's countdown: a ring that drains clockwise, gold at 10s, red with a
 * per-second pulse at 5s, and a "TIME!" stamp at zero. Size it with
 * `className` (e.g. `size-[2.75rem]`); the digits scale with the font size.
 */
export function CountdownRing({ className = "" }: { className?: string }) {
  const countdown = usePhaseCountdown();
  const ring = usePhaseDrain<SVGCircleElement>("ring");
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const { remaining, expired, untimed, pct } = countdown;
  const tone = countdownTone(remaining);
  const previous = useRef(remaining);

  useEffect(() => {
    const before = previous.current;
    previous.current = remaining;
    if (reduced || untimed || expired || tone !== "urgent" || before === remaining) return;
    if (!scope.current) return;
    void animate(scope.current, { scale: [1.12, 1] }, { duration: 0.35, ease: EASE.out });
  }, [remaining, tone, reduced, untimed, expired, animate, scope]);

  if (untimed) return null;
  const classes = TONE_CLASSES[tone];

  return (
    <div
      ref={scope}
      role="timer"
      aria-label={spokenCountdown(countdown)}
      className={`relative grid shrink-0 place-items-center ${className}`}
    >
      <AnimatePresence initial={false}>
        {!expired && (
          <motion.svg
            key="ring"
            viewBox="0 0 44 44"
            className="absolute inset-0 size-full -rotate-90"
            aria-hidden="true"
            exit={{ opacity: 0, transition: { duration: DUR.slow, delay: 0.5 } }}
          >
            <circle
              cx="22"
              cy="22"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3.5"
              className="stroke-edge"
            />
            <circle
              ref={ring}
              cx="22"
              cy="22"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={-(1 - pct / 100) * RING_LENGTH}
              className={`transition-[stroke] duration-500 ${classes.stroke}`}
            />
          </motion.svg>
        )}
      </AnimatePresence>
      {expired ? (
        <motion.span
          key="time"
          className="relative whitespace-nowrap font-display text-[0.9em] font-extrabold uppercase tracking-wide text-fail"
          initial={{ opacity: 0, scale: 1.6, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: -8 }}
          transition={{ ...SPRING.slam, opacity: { duration: 0.06 } }}
        >
          Time!
        </motion.span>
      ) : (
        <span className={`relative font-mono font-bold tabular-nums ${classes.text}`}>
          {remaining}
        </span>
      )}
    </div>
  );
}
