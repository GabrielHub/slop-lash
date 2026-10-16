"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLocalTime, useTime } from "@/tutorial/clock";
import { BOARD } from "@/tutorial/kit";
import { clamp, ease, mix, progress } from "@/tutorial/timeline";
import { Drapes, OnAirSign, VELVET, Valance } from "../tutorial/parts";
import { AT, DURATION } from "./times";

/**
 * The spot's studio: the backdrop, the curtain that is the loop's seam, the
 * ON AIR light, and the broadcast wipes QuizSlop moves with.
 */

/** The studio: a deep stage wall, a warm key light, a darker floor. Opaque. */
export function Backdrop() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: [
          "radial-gradient(ellipse 58% 52% at 50% 44%, color-mix(in srgb, var(--gold) 9%, transparent), transparent 72%)",
          "radial-gradient(ellipse 90% 34% at 50% 104%, color-mix(in srgb, var(--raised) 85%, transparent), transparent 70%)",
          "linear-gradient(180deg, color-mix(in srgb, var(--raised) 45%, var(--bg)) 0%, var(--bg) 58%, color-mix(in srgb, var(--raised) 35%, var(--bg)) 100%)",
        ].join(", "),
      }}
    />
  );
}

/**
 * A broadcast wipe-on: its children are revealed by a clean edge sweeping
 * across (from the left, or out from the centre), led by a bright bar, and
 * wiped off to the right at `out`. Reads local time.
 */
export function WipeIn({
  at,
  duration = 0.3,
  out,
  outDuration = 0.22,
  from = "left",
  edge = "var(--gold)",
  className = "",
  style,
  children,
}: {
  at: number;
  duration?: number;
  out?: number;
  outDuration?: number;
  from?: "left" | "centre";
  edge?: string | null;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const t = useLocalTime();
  const shown = progress(t, at, duration, ease.out);
  const gone = out === undefined ? 0 : progress(t, out, outDuration, ease.in);
  const wiping = (shown > 0 && shown < 1) || (gone > 0 && gone < 1);
  // Generous top and bottom so glows and descenders never clip.
  const clip =
    from === "centre"
      ? `inset(-30% ${(1 - shown) * 50}% -30% ${(1 - shown) * 50}%)`
      : `inset(-30% ${(1 - shown) * 100}% -30% ${gone * 100}%)`;
  const bar = gone > 0 ? gone : shown;
  return (
    <div className={`relative ${className}`} style={{ visibility: shown <= 0 || gone >= 1 ? "hidden" : undefined, ...style }}>
      <div style={{ clipPath: wiping ? clip : undefined }}>{children}</div>
      {edge && wiping && from === "left" && (
        <span
          className="pointer-events-none absolute -bottom-[6%] -top-[6%] w-[10px] -translate-x-1/2 rounded-full"
          style={{
            left: `${bar * 100}%`,
            background: edge,
            opacity: Math.sin(bar * Math.PI) * 1.4,
            boxShadow: `0 0 18px 2px ${edge}`,
          }}
        />
      )}
    </div>
  );
}

/** A diagonal sheen sweeping once across its parent (which must clip), from `at`. */
export function Glint({ at, duration = 0.5, width = 160 }: { at: number; duration?: number; width?: number }) {
  const t = useLocalTime();
  const p = progress(t, at, duration, ease.inOut);
  if (p <= 0 || p >= 1) return null;
  return (
    <span
      className="pointer-events-none absolute -top-[20%] h-[140%]"
      style={{
        left: `${mix(-30, 130, p)}%`,
        width,
        transform: "skewX(-20deg)",
        background:
          "linear-gradient(90deg, transparent, color-mix(in srgb, #fffbea 45%, transparent), transparent)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The curtain: the loop's seam
// ---------------------------------------------------------------------------

/** Valance bulbs chase about twice a second, a whole number of cycles per loop, so the seam can't blink. */
const VALANCE_CHASE = Math.round(2 * DURATION) / DURATION;

/** How shut the curtain is at `t`: shut at 0, parted by 0.65 s, shut again by the loop's end. */
export function curtainCover(t: number) {
  return t < DURATION / 2
    ? 1 - progress(t, AT.open, 0.6, ease.inOut)
    : progress(t, AT.close, 0.46, ease.inOut);
}

/** The studio's velvet curtain under a bulb-lit valance (as the tutorial's), keyed to the loop. */
export function StageCurtain() {
  const t = useTime();
  const cover = curtainCover(t);
  if (cover <= 0.001) return null;
  const closing = t > DURATION / 2;
  // The hems trail the leading edges, so the drapes swing rather than slide.
  const sway = (closing ? -1 : 1) * (1 - cover) * 6;
  const valance = closing
    ? progress(t, AT.close - 0.06, 0.3, ease.out)
    : 1 - progress(t, AT.open + 0.28, 0.34, ease.in);
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <Drapes cover={cover} sway={sway} />
      <Valance drop={valance} bulb={20} chase={VALANCE_CHASE} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ON AIR, broadcast wipe
// ---------------------------------------------------------------------------

/** The ON AIR light: it stutters on as the curtain parts and holds through the show; the slate is clean. */
export function OnAirBug() {
  const t = useTime();
  if (t >= AT.slate) return null;
  const flicker = [0.3, 0.38, 0.44, 0.5, 0.6];
  let lit = 0;
  for (let index = 0; index < flicker.length; index++) if (t >= flicker[index]) lit = index % 2 === 0 ? 1 : 0.15;
  return (
    <div className="pointer-events-none absolute" style={{ left: 1700, top: 132, transform: "translate(-50%, -50%)" }}>
      <OnAirSign lit={lit} size={46} />
    </div>
  );
}

/**
 * QuizSlop's channel change: a punch-red slab with gold rails sweeps across,
 * covering the whole board from about `at + 0.28` to `at + 0.42`. Cut under it
 * at `at + 0.35`.
 */
export function BroadcastWipe({ at, duration = 0.7 }: { at: number; duration?: number }) {
  const t = useTime();
  const p = progress(t, at, duration, ease.inOut);
  if (p <= 0 || p >= 1) return null;
  const width = 3400;
  const left = mix(-width - 300, BOARD.width + 300, p);
  const rail = "var(--gold)";
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <div
        className="absolute top-[-200px] h-[1480px]"
        style={{
          left,
          width,
          transform: "skewX(-18deg)",
          background: `linear-gradient(90deg, ${rail} 0 46px, transparent 46px 70px, ${VELVET} 70px calc(100% - 70px), transparent calc(100% - 70px) calc(100% - 46px), ${rail} calc(100% - 46px))`,
        }}
      />
    </div>
  );
}

/** 0 to 1 and back over `[at, at + duration]`: a one-shot pulse for impact frames. */
export function pulse(t: number, at: number, duration: number) {
  if (t < at || t > at + duration) return 0;
  return Math.sin(clamp((t - at) / duration) * Math.PI);
}
