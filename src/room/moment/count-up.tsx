"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { EASE } from "@/lib/animations";
import { useReducedAfterMount } from "./use-reduced";

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

/**
 * A number that counts to `value`: from `from` on mount, then from wherever
 * it is to each new value. Driven by a MotionValue, so it never re-renders
 * React per frame. Tabular figures keep the width steady. Under reduced
 * motion it is plain text showing `value` from the frame it mounts (after
 * hydration, so the server's markup still matches).
 */
export function CountUp({
  value,
  from = 0,
  duration = 0.8,
  delay = 0,
  format = defaultFormat,
  className = "",
}: {
  value: number;
  from?: number;
  /** Seconds. */
  duration?: number;
  /** Seconds. */
  delay?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const instant = useReducedAfterMount();
  const count = useMotionValue(from);
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });
  const text = useTransform(count, (n) => formatRef.current(n));

  // A layout effect, so a count that starts at once (no delay) never paints its `from` first.
  useLayoutEffect(() => {
    if (instant) {
      count.jump(value);
      return;
    }
    const controls = animate(count, value, { duration, delay, ease: EASE.inOut });
    return () => controls.stop();
  }, [count, value, duration, delay, instant]);

  if (instant) return <span className={`tabular-nums ${className}`}>{format(value)}</span>;
  return <motion.span className={`tabular-nums ${className}`}>{text}</motion.span>;
}
