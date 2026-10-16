"use client";

import type { ReactNode } from "react";
import { useLocalTime } from "@/tutorial/clock";
import { hash01 } from "@/tutorial/timeline";

/**
 * SlopLash's pixel glitch, for anything: `amount` 0..1 splits the content
 * into punch and teal ghosts and tears two bands of it sideways, re-rolled
 * every frame from a hash of the time. `children` draws the content, tinted
 * flat with `tone` for a ghost (null for the real thing).
 */
export function Glitch({
  amount,
  seed = 1,
  split = 16,
  tear = 40,
  children,
}: {
  amount: number;
  seed?: number;
  /** Ghost offset at full glitch, px. */
  split?: number;
  /** How far a torn band slides at full glitch, px. */
  tear?: number;
  children: (tone: string | null) => ReactNode;
}) {
  const t = useLocalTime();
  const on = amount > 0.02;
  const frame = Math.floor(t * 24);
  const jitter = (k: number) => (hash01(frame * 7.31 + seed * 17.9 + k * 3.7) - 0.5) * 2;
  const offset = amount * split;
  return (
    <div
      className="relative"
      style={{ transform: on ? `translateX(${jitter(1) * amount * 10}px)` : undefined }}
    >
      {on && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              transform: `translate(${-offset + jitter(2) * 4}px, ${jitter(3) * 3}px)`,
              opacity: 0.8,
            }}
          >
            {children("var(--punch)")}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              transform: `translate(${offset + jitter(4) * 4}px, ${jitter(5) * 3}px)`,
              opacity: 0.8,
            }}
          >
            {children("var(--teal)")}
          </div>
        </>
      )}
      <div className="relative">{children(null)}</div>
      {on &&
        [0, 1].map((band) => {
          const top = hash01(frame * 1.7 + band * 9 + seed) * 0.85;
          const height = 0.07 + hash01(frame * 2.9 + band + seed * 3) * 0.16;
          return (
            <div
              key={band}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                clipPath: `inset(${top * 100}% 0 ${Math.max(0, (1 - top - height) * 100)}% 0)`,
                transform: `translateX(${jitter(10 + band) * amount * tear}px)`,
              }}
            >
              {children(null)}
            </div>
          );
        })}
    </div>
  );
}

/** A glitch amount: bursts that decay over `length` seconds after each time in `at`. */
export function glitchBursts(t: number, at: readonly number[], length = 0.4): number {
  let amount = 0;
  for (const time of at) {
    const local = t - time;
    if (local >= 0 && local < length) amount = Math.max(amount, 1 - local / length);
  }
  return amount;
}

/** Whether an LED flickering on is lit at `t`: off, a few stutters, then steady from `until`. */
export function flickerOn(t: number, from: number, until: number, seed: number): boolean {
  if (t < from) return false;
  if (t >= until) return true;
  const frame = Math.floor(t * 30);
  return hash01(frame * 1.31 + seed * 7.7) > 0.38;
}
