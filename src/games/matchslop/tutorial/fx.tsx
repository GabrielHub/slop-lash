"use client";

import type { CSSProperties, ReactNode } from "react";
import { Sequence, useTime } from "@/tutorial/clock";
import { BOARD } from "@/tutorial/kit";
import {
  SPRINGS,
  clamp,
  ease,
  hash01,
  progress,
  spring,
  wobble,
  type Easing,
  type SpringConfig,
} from "@/tutorial/timeline";

/**
 * MatchSlop's motion vocabulary: neon tubes that strike and hum, a heart iris
 * between chapters, and a few time helpers. Everything reads the global
 * playhead; a `Shot` resets its children's local time to global, so every
 * beat is written in the voice's own seconds (`cues.word(...)`).
 */

export const C = {
  rose: "var(--ms-rose)",
  coral: "var(--ms-coral)",
  violet: "var(--ms-violet)",
  mint: "var(--ms-mint)",
  red: "var(--ms-red)",
  ink: "var(--ms-ink)",
  dim: "var(--ms-ink-dim)",
  bg: "var(--bg)",
  surface: "var(--surface)",
  raised: "var(--raised)",
} as const;

/** `color` at `percent`% over transparent. */
export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${clamp(percent, 0, 100).toFixed(1)}%, transparent)`;
}

/** `a` blended toward `b` by `amount` (0..1), in oklab. */
export function blend(a: string, b: string, amount: number): string {
  const share = clamp(amount) * 100;
  if (share <= 0.1) return a;
  if (share >= 99.9) return b;
  return `color-mix(in oklab, ${b} ${share.toFixed(1)}%, ${a})`;
}

/** A shot: mounted only in its window, with local time equal to global time inside. */
export function Shot({
  from,
  to,
  pre = 0,
  post = 0,
  children,
}: {
  from: number;
  to: number;
  pre?: number;
  post?: number;
  children: ReactNode;
}) {
  return (
    <Sequence from={from} to={to} pre={pre} post={post}>
      <Sequence from={0}>{children}</Sequence>
    </Sequence>
  );
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** 0 → 1 from `at` over `d`. */
export const fin = (t: number, at: number, d = 0.25, e: Easing = ease.out) =>
  progress(t, at, d, e);
/** 1 → 0 from `at` over `d`. */
export const fout = (t: number, at: number, d = 0.25, e: Easing = ease.in) =>
  1 - progress(t, at, d, e);
/** A spring released at `at`. */
export const sp = (t: number, at: number, config: SpringConfig = SPRINGS.smooth) =>
  spring(t - at, config);

/** A value stepping through `steps`, each step springing in from its time. */
export function stepped(
  t: number,
  start: number,
  steps: readonly { at: number; to: number }[],
  config: SpringConfig = SPRINGS.gentle,
): number {
  let value = start;
  let previous = start;
  for (const step of steps) {
    value += (step.to - previous) * spring(t - step.at, config);
    previous = step.to;
  }
  return value;
}

/** A decaying side-to-side "nope" wiggle from `at`, in px. */
export function nope(t: number, at: number, strength = 18, duration = 0.5): number {
  const local = t - at;
  if (local < 0 || local > duration) return 0;
  return Math.sin(local * 48) * strength * (1 - local / duration);
}

/** A heartbeat: two quick bumps each `period` seconds (lub-dub), 0..1. */
export function heartbeat(t: number, period = 1.1, phase = 0): number {
  const p = (((t - phase) / period) % 1 + 1) % 1;
  const bump = (center: number, width: number) =>
    Math.max(0, 1 - Math.abs(p - center) / width) ** 2;
  return Math.max(bump(0.08, 0.08), bump(0.26, 0.08) * 0.6);
}

// ---------------------------------------------------------------------------
// Neon
// ---------------------------------------------------------------------------

/** When a tube strikes: on/off pairs (seconds, brightness) before it holds. */
const STRIKE: readonly (readonly [number, number])[] = [
  [0, 0.85],
  [0.05, 0.06],
  [0.1, 0.7],
  [0.15, 0.04],
  [0.27, 1],
  [0.31, 0.3],
  [0.37, 1],
];

/** A neon tube's brightness at `t`: dark before `at`, a stuttering strike, then a steady hum. */
export function neonLevel(t: number, at: number, seed = 0): number {
  const local = t - at;
  if (local < 0) return 0;
  const stretch = 0.8 + hash01(seed * 7.3 + 1) * 0.5;
  const s = local / stretch;
  if (s < 0.37) {
    let level = 0;
    for (const [time, value] of STRIKE) if (s >= time) level = value;
    return level;
  }
  const tick = Math.floor(t * 9);
  const dropout = hash01(tick * 3.1 + seed * 11) > 0.994 ? 0.6 : 1;
  return dropout * (0.95 + 0.05 * wobble(t * 3, seed));
}

/** The lit core of a tube: the colour washed toward the ink (white-hot on dark, deep on light). */
export function tubeCore(color: string, level: number): string {
  const lit = `color-mix(in oklab, ${color} 55%, var(--ms-ink))`;
  return blend(alpha(color, 24), lit, level);
}

/** A neon glow as a text-shadow, in em so it follows the type. */
export function neonShadow(color: string, level: number, strength = 1): string {
  const g = (percent: number) => alpha(color, percent * clamp(level) * strength);
  return [
    `0 0 0.02em ${g(100)}`,
    `0 0 0.07em ${g(90)}`,
    `0 0 0.18em ${g(70)}`,
    `0 0 0.42em ${g(45)}`,
    `0 0 0.9em ${g(28)}`,
  ].join(", ");
}

/** Text drawn as a lit neon tube at `level` (0 dark .. 1 lit). */
export function Neon({
  children,
  color = C.rose,
  level = 1,
  strength = 1,
  className = "",
  style,
}: {
  children: ReactNode;
  color?: string;
  level?: number;
  strength?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        color: tubeCore(color, level),
        textShadow: neonShadow(color, level, strength),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** The app's heart (`HeartIcon`), as a path in a 24-unit box. */
export const HEART_D =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

/** A solid heart, `currentColor` unless given. */
export function Heart({
  size,
  color,
  className = "",
  style,
}: {
  size: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={HEART_D} style={{ fill: color ?? "currentColor" }} />
    </svg>
  );
}

/** A heart bent from neon tube: an outline that strikes and glows, optionally filled. */
export function NeonHeart({
  size,
  color = C.rose,
  level = 1,
  fill = 0,
  stroke = 1.5,
  children,
  style,
}: {
  size: number;
  color?: string;
  level?: number;
  /** 0..1, a lit fill inside the tube. */
  fill?: number;
  stroke?: number;
  /** Drawn inside the heart's 24-unit box (a face, say). */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const lit = clamp(level);
  const glow = (px: number, percent: number) =>
    `drop-shadow(0 0 ${(size * px).toFixed(1)}px ${alpha(color, percent * lit)})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{
        overflow: "visible",
        filter: lit > 0.02 ? `${glow(0.02, 90)} ${glow(0.07, 60)} ${glow(0.16, 35)}` : undefined,
        ...style,
      }}
    >
      <path
        d={HEART_D}
        style={{
          fill: alpha(color, fill * 100 * (0.25 + 0.75 * lit)),
          stroke: tubeCore(color, lit),
          strokeWidth: stroke,
          strokeLinejoin: "round",
        }}
      />
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The heart iris
// ---------------------------------------------------------------------------

const HEART_POINTS = 120;

/** The classic heart curve, unit-sized: x in [-1, 1], y in about [-0.9, 0.9], y down. */
const HEART_UNIT: readonly (readonly [number, number])[] = Array.from(
  { length: HEART_POINTS },
  (_, index) => {
    const theta = (index / HEART_POINTS) * Math.PI * 2;
    const x = 16 * Math.sin(theta) ** 3;
    const y =
      13 * Math.cos(theta) - 5 * Math.cos(2 * theta) - 2 * Math.cos(3 * theta) - Math.cos(4 * theta);
    return [x / 16, -(y + 2.5) / 16] as const;
  },
);

/** An SVG path of a heart of half-width `r` centred on (cx, cy). */
export function heartPath(cx: number, cy: number, r: number): string {
  return `M${HEART_UNIT.map(([x, y]) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`).join("L")}Z`;
}

/** Big enough that the heart's hole clears every corner of the board. */
const IRIS_MAX = 2700;

/**
 * The chapter transition: the board closes down to a heart-shaped window that
 * shrinks to a beat at `at` (cut there), then opens a new heart on the next
 * shot. Drawn under the captions and chapter rail.
 */
export function HeartIris({
  at,
  close = 0.5,
  open = 0.6,
  origin = { x: BOARD.width / 2, y: BOARD.height / 2 + 30 },
  to,
}: {
  /** The cut, fully closed. */
  at: number;
  close?: number;
  open?: number;
  /** Where the old shot closes on. */
  origin?: { x: number; y: number };
  /** Where the new shot opens from (default `origin`). */
  to?: { x: number; y: number };
}) {
  const t = useTime();
  if (t < at - close || t > at + open) return null;
  const closing = t < at;
  const k = closing ? 1 - progress(t, at - close, close) : progress(t, at, open);
  const r = IRIS_MAX * k ** 2.3;
  const center = closing ? origin : (to ?? origin);
  const hole = heartPath(center.x, center.y, r);
  const beat = 1 - clamp(Math.abs(t - at) / 0.24);
  const beatR = 64 * ease.outBack(beat);
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-30"
      width={BOARD.width}
      height={BOARD.height}
      viewBox={`0 0 ${BOARD.width} ${BOARD.height}`}
      aria-hidden="true"
    >
      <path
        d={`M-10 -10H${BOARD.width + 10}V${BOARD.height + 10}H-10Z${hole}`}
        fillRule="evenodd"
        style={{ fill: `color-mix(in oklab, ${C.rose} 14%, var(--bg))` }}
      />
      {r > 6 && (
        <>
          <path d={hole} style={{ fill: "none", stroke: alpha(C.rose, 28), strokeWidth: 26 }} />
          <path d={hole} style={{ fill: "none", stroke: tubeCore(C.rose, 1), strokeWidth: 6 }} />
        </>
      )}
      {beatR > 1 && (
        <path
          d={heartPath(center.x, center.y, beatR)}
          style={{ fill: C.rose, filter: `drop-shadow(0 0 18px ${alpha(C.rose, 70)})` }}
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The room behind it all
// ---------------------------------------------------------------------------

/**
 * A soft stage light and vignette over the page's live "bubbles" field.
 * `mint`/`cold` (0..1) shift the light toward the date's mint or the
 * unmatch's chill.
 */
export function Backdrop({ mint = 0, cold = 0, flash = 0 }: { mint?: number; cold?: number; flash?: number }) {
  const t = useTime();
  const sway = wobble(t * 0.4, 3) * 4;
  const warm = 1 - Math.max(mint, cold);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(58% 62% at ${50 + sway}% 46%, ${alpha(C.rose, 15 * warm + 4)}, transparent 72%)`,
        }}
      />
      {mint > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: mint,
            background: `radial-gradient(60% 65% at 50% 55%, ${alpha(C.mint, 20)}, transparent 75%)`,
          }}
        />
      )}
      {cold > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: cold,
            background: `radial-gradient(70% 70% at 50% 60%, ${alpha(C.violet, 10)}, transparent 70%), linear-gradient(${alpha(C.bg, 45)}, ${alpha(C.bg, 45)})`,
          }}
        />
      )}
      {flash > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: flash,
            background: `radial-gradient(75% 75% at 50% 50%, transparent 30%, ${alpha(C.red, 45)} 100%)`,
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(85% 85% at 50% 50%, transparent 55%, ${alpha(C.bg, 70)} 100%)`,
        }}
      />
    </div>
  );
}

/** A pose transform string. */
export function tf(x = 0, y = 0, scale = 1, rotate = 0): string {
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
}
