"use client";

import { useState, useEffect, useRef } from "react";

interface TimerProps {
  seconds: number;
  onComplete?: () => void;
}

export function Timer({ seconds, onComplete }: TimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (remaining <= 0) {
      onCompleteRef.current?.();
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const pct = seconds > 0 ? (remaining / seconds) * 100 : 0;
  const isUrgent = pct < 20;
  const isWarning = pct < 40;

  const barColor = isUrgent
    ? "bg-fail"
    : isWarning
      ? "bg-gold"
      : "bg-teal";

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ink-dim">Time remaining</span>
        <span
          className={`font-mono font-bold text-lg tabular-nums ${
            isUrgent
              ? "text-fail animate-pulse-urgent"
              : isWarning
                ? "text-gold"
                : "text-teal"
          }`}
        >
          {remaining}s
        </span>
      </div>
      <div className="h-3 bg-raised rounded-full overflow-hidden border border-edge">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
