"use client";

import { AnimatePresence, motion } from "motion/react";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{
            background: "var(--ms-rose)",
            animation: `ms-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function ProgressCount({
  count,
  total,
  label,
}: {
  count: number;
  total: number;
  label: string;
}) {
  return (
    <motion.div
      className="flex items-center gap-1.5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      <span
        className="font-mono font-bold tabular-nums"
        style={{
          fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
          color: count >= total ? "var(--ms-mint)" : "var(--ms-ink-dim)",
        }}
      >
        {count}/{total}
      </span>
      <span
        className="font-display uppercase tracking-wider"
        style={{
          fontSize: "clamp(0.45rem, 0.6vw, 0.55rem)",
          color: "var(--ms-ink-dim)",
          opacity: 0.7,
        }}
      >
        {label}
      </span>
    </motion.div>
  );
}

export function DeltaBadge({
  moodDelta,
  badgeKey,
}: {
  moodDelta?: number | null;
  badgeKey?: string;
}) {
  return (
    <AnimatePresence mode="popLayout">
      {moodDelta != null && moodDelta !== 0 && (
        <motion.span
          key={badgeKey ?? `delta-${moodDelta}`}
          className="font-mono font-bold tabular-nums"
          style={{
            fontSize: "clamp(0.5rem, 0.65vw, 0.6rem)",
            color: moodDelta > 0 ? "var(--ms-mint)" : "var(--ms-red)",
          }}
          initial={{ opacity: 0, y: moodDelta > 0 ? 6 : -6, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
        >
          {moodDelta > 0 ? `+${moodDelta}` : moodDelta}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
