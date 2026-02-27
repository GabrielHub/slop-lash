"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/* ─────────────────────────────────────────────
   Chat Particle System

   Each message IS a single particle in the rain.
   Incoming → a particle falls from above and "lands"
   Outgoing → a particle rises up into the rain
   ───────────────────────────────────────────── */

const PARTICLE_COLORS = [
  "var(--cs-accent)",   // brass gold
  "var(--cs-violet)",   // rosewood
  "var(--gold)",        // global gold (bridges to pixel rain)
  "var(--teal)",        // global teal (bridges to pixel rain)
  "var(--punch)",       // global punch (bridges to pixel rain)
] as const;

let particleCounter = 0;

interface ChatParticle {
  id: number;
  type: "incoming" | "outgoing";
  /** Horizontal position as percentage (0–100) */
  x: number;
  /** Vertical start position in px (relative to container) */
  startY: number;
  /** Vertical end position in px (relative to container) */
  endY: number;
  /** Particle size in px */
  size: number;
  /** CSS color value */
  color: string;
  /** Animation duration in ms */
  duration: number;
  /** Slight horizontal drift in px (negative = left, positive = right) */
  drift: number;
  /** Glow intensity multiplier */
  glow: number;
}

function pickColor(): string {
  return PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
}

export function useChatParticles() {
  const [particles, setParticles] = useState<ChatParticle[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** A single particle falls from above → lands at targetY */
  const emitIncoming = useCallback((targetY: number, fromRight: boolean) => {
    if (reducedMotion.current) return;
    const container = containerRef.current;
    if (!container) return;

    const id = ++particleCounter;
    const size = 3 + Math.random() * 3;
    // Particle falls from just above the viewport into the container
    const startY = -20;
    // Horizontal: slightly randomized around the message side
    const x = fromRight
      ? 65 + Math.random() * 25   // right side for "me" messages
      : 10 + Math.random() * 25;  // left side for others
    const drift = (Math.random() - 0.5) * 30;
    const duration = 400 + Math.random() * 200; // 400–600ms

    const particle: ChatParticle = {
      id,
      type: "incoming",
      x,
      startY,
      endY: targetY,
      size,
      color: pickColor(),
      duration,
      drift,
      glow: 1.5 + Math.random() * 1.5,
    };

    setParticles((prev) => {
      // Cap at 6 active particles
      const trimmed = prev.length >= 6 ? prev.slice(-5) : prev;
      return [...trimmed, particle];
    });

    setTimeout(() => removeParticle(id), duration + 50);
  }, [removeParticle]);

  /** A single particle rises from originY → up into the rain above */
  const emitOutgoing = useCallback((originY: number, fromRight: boolean) => {
    if (reducedMotion.current) return;
    const container = containerRef.current;
    if (!container) return;

    const id = ++particleCounter;
    const size = 3 + Math.random() * 2;
    const x = fromRight
      ? 65 + Math.random() * 25
      : 10 + Math.random() * 25;
    const drift = (Math.random() - 0.5) * 40;
    const duration = 500 + Math.random() * 300; // 500–800ms

    const particle: ChatParticle = {
      id,
      type: "outgoing",
      x,
      startY: originY,
      endY: -30,
      size,
      color: pickColor(),
      duration,
      drift,
      glow: 2 + Math.random() * 1.5,
    };

    setParticles((prev) => {
      const trimmed = prev.length >= 6 ? prev.slice(-5) : prev;
      return [...trimmed, particle];
    });

    setTimeout(() => removeParticle(id), duration + 50);
  }, [removeParticle]);

  return { particles, containerRef, emitIncoming, emitOutgoing };
}

/* ─── Particle Layer (rendered inside the chat feed) ─── */

export function ChatParticleLayer({
  particles,
  containerRef,
}: {
  particles: ChatParticle[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none z-10"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <SingleParticle key={p.id} particle={p} />
      ))}
    </div>
  );
}

function SingleParticle({ particle: p }: { particle: ChatParticle }) {
  const travelY = p.endY - p.startY;
  const isIncoming = p.type === "incoming";

  return (
    <div
      className={isIncoming ? "animate-cs-particle-fall" : "animate-cs-particle-rise"}
      style={{
        position: "absolute",
        left: `${p.x}%`,
        top: p.startY,
        width: p.size,
        height: p.size,
        borderRadius: "50%",
        backgroundColor: p.color,
        boxShadow: `0 0 ${p.size * p.glow}px ${p.color}, 0 0 ${p.size * p.glow * 2.5}px ${p.color}`,
        // CSS custom properties drive the keyframe
        "--particle-travel-y": `${travelY}px`,
        "--particle-drift": `${p.drift}px`,
        animationDuration: `${p.duration}ms`,
        animationFillMode: "forwards",
      } as React.CSSProperties}
    />
  );
}
