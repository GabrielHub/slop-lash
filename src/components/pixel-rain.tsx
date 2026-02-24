"use client";

import { useState } from "react";
import { useTheme } from "@/components/theme-provider";

const RAIN_COLORS = ["punch", "teal", "gold"] as const;

interface RainParticle {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  color: (typeof RAIN_COLORS)[number];
  opacity: number;
}

export function PixelRain() {
  const { mounted } = useTheme();

  // Lazy-init avoids setState-in-effect; rendered only after mount to dodge hydration mismatch
  const [particles] = useState<RainParticle[]>(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 2 + Math.random() * 3,
      duration: 10 + Math.random() * 15,
      delay: Math.random() * 12,
      color: RAIN_COLORS[Math.floor(Math.random() * RAIN_COLORS.length)],
      opacity: 0.15 + Math.random() * 0.35,
    }))
  );

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-pixel-rain"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              backgroundColor: `var(--${p.color})`,
              boxShadow: `0 0 ${p.size * 3}px var(--${p.color}), 0 0 ${p.size * 6}px var(--${p.color})`,
              "--rain-opacity": p.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
