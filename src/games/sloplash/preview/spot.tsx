"use client";

import { Sequence, useTime } from "@/tutorial/clock";
import type { PreviewSpot } from "@/tutorial/preview";
import { hash01, progress } from "@/tutorial/timeline";
import { PixelSweep } from "../tutorial/pixel";
import { Backdrop } from "./backdrop";
import { Slate } from "./slate";
import { Story } from "./story";
import { BEATS, DURATION, POSTER, SWEEP } from "./times";

/**
 * SlopLash's host-page spot: the prompt hits the LED wall, two answers go
 * head to head with their authors hidden, the room sweeps one, and the loser
 * turns out to be the AI. The AI's glitch cuts to the wordmark, and a pixel
 * sweep carries the loop back to the top.
 */
function Scene() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Backdrop />
      <Sequence from={0} to={BEATS.cut}>
        <Story />
      </Sequence>
      <Sequence from={BEATS.cut}>
        <Slate />
      </Sequence>
      <GlitchCut />
      {/* The seam: one sweep split across the wrap, fully covering at DURATION (= 0). */}
      <PixelSweep at={DURATION - SWEEP / 2} duration={SWEEP} cell={160} seed={5} />
      <PixelSweep at={-SWEEP / 2} duration={SWEEP} cell={160} seed={5} />
    </div>
  );
}

const BAR_TONES = ["var(--punch)", "var(--teal)", "var(--gold)", "var(--ai-badge)", "var(--ink)"];

/** The AI's crash, torn across the whole screen: bands of colour flicker, peak on the cut, and clear. */
function GlitchCut() {
  const t = useTime();
  const from = BEATS.glitch + 0.08;
  const until = BEATS.cut + 0.16;
  if (t < from || t > until) return null;
  const amount =
    t < BEATS.cut ? progress(t, from, BEATS.cut - from) : 1 - progress(t, BEATS.cut, until - BEATS.cut);
  const frame = Math.floor(t * 30);
  const bars = Math.round(3 + amount * 6);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {Array.from({ length: bars }, (_, index) => {
        const r = (k: number) => hash01(frame * 3.71 + index * 11.3 + k);
        const height = 20 + r(1) * 140 * amount;
        return (
          <div
            key={index}
            className="absolute"
            style={{
              top: r(2) * 1080 - height / 2,
              left: (r(3) - 0.5) * 600,
              width: 1920 * (0.5 + r(4)),
              height,
              background: BAR_TONES[Math.floor(r(5) * BAR_TONES.length)],
              opacity: 0.5 + r(6) * 0.5,
            }}
          />
        );
      })}
      <div
        className="absolute inset-0 bg-canvas"
        style={{ opacity: t >= BEATS.cut - 0.04 && t < BEATS.cut + 0.06 ? 0.85 : 0 }}
      />
    </div>
  );
}

export const spot: PreviewSpot = { Scene, duration: DURATION, poster: POSTER };
