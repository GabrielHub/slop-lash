"use client";

import { useTime } from "@/tutorial/clock";
import { BOARD } from "@/tutorial/kit";
import { hash01 } from "@/tutorial/timeline";
import { ledGrid } from "../tutorial/pixel";
import { BEATS, DURATION } from "./times";

/**
 * The set behind the spot: the canvas colour, a warm punch glow from the rig,
 * a faint LED wall, and a few columns of the house pixel rain stepping down
 * it. Opaque, and a pure function of the loop's time.
 */

const PITCH = 30;
const TRAIL_CELLS = 6;
const RAIN_TONES = ["var(--ink-dim)", "var(--teal)", "var(--ink-dim)", "var(--punch)", "var(--gold)"];

/** Each column falls a whole number of times per loop, so the rain is seamless too. */
const RAIN = Array.from({ length: 11 }, (_, index) => {
  const laps = 2 + Math.floor(hash01(index * 5.1 + 2) * 3);
  return {
    x: Math.round((90 + hash01(index * 3.7 + 1) * 1740) / PITCH) * PITCH,
    laps,
    phase: hash01(index * 9.3 + 3),
    trail: trail(RAIN_TONES[index % RAIN_TONES.length]!),
  };
});
const SPAN = BOARD.height + PITCH * (TRAIL_CELLS + 2);

export function Backdrop() {
  const t = useTime();
  // The LED wall stutters on with the hook.
  const lit = t < BEATS.promptOn ? 0.4 : t < BEATS.promptLock ? (Math.floor(t * 30) % 3 === 0 ? 0.3 : 1) : 1;
  return (
    <div className="absolute inset-0 bg-canvas">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, color-mix(in srgb, var(--punch) 16%, transparent), transparent 70%), radial-gradient(ellipse 60% 50% at 12% 100%, color-mix(in srgb, var(--teal) 9%, transparent), transparent 70%), radial-gradient(ellipse 60% 50% at 88% 100%, color-mix(in srgb, var(--ai-badge) 8%, transparent), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          ...ledGrid(PITCH - 8, 8, "color-mix(in srgb, var(--ink) 6%, transparent)"),
          opacity: lit,
          maskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, black 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, black 35%, transparent 100%)",
        }}
      />
      {RAIN.map((column, index) => {
        const lap = (t / DURATION) * column.laps + column.phase;
        const head = (lap - Math.floor(lap)) * SPAN - PITCH * 2;
        const y = Math.round(head / PITCH) * PITCH;
        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: column.x,
              top: y - PITCH * TRAIL_CELLS,
              width: PITCH - 8,
              height: PITCH * (TRAIL_CELLS + 1),
              background: column.trail,
              opacity: 0.42,
            }}
          />
        );
      })}
      <LightStage />
    </div>
  );
}

/**
 * Shows its element only in the light theme. Light-only layers give the cream
 * set the depth the dark one gets for free, without touching the dark theme.
 */
export const LIGHT_ONLY = "hidden [[data-theme=light]_&]:block";

/**
 * The light theme's stage: a deeper, warmer floor under the cream, the rig's
 * shadow across the top, saturated colour pools, and a vignette into the wings.
 */
function LightStage() {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${LIGHT_ONLY}`}
      style={{
        background: [
          "radial-gradient(ellipse 80% 75% at 50% 44%, transparent 38%, color-mix(in srgb, var(--ink) 30%, transparent) 100%)",
          "linear-gradient(to bottom, color-mix(in srgb, var(--ink) 14%, transparent), transparent 30%)",
          "radial-gradient(ellipse 60% 45% at 50% 0%, color-mix(in srgb, var(--punch) 20%, transparent), transparent 75%)",
          "radial-gradient(ellipse 55% 50% at 6% 100%, color-mix(in srgb, var(--teal) 15%, transparent), transparent 70%)",
          "radial-gradient(ellipse 55% 50% at 94% 100%, color-mix(in srgb, var(--ai-badge) 15%, transparent), transparent 70%)",
          "color-mix(in srgb, var(--edge-strong) 38%, transparent)",
        ].join(", "),
      }}
    />
  );
}

/** A head pixel with its trail fading up behind it. */
function trail(tone: string): string {
  const stops: string[] = [];
  const cell = PITCH - 8;
  for (let step = 0; step <= TRAIL_CELLS; step++) {
    const top = step * PITCH;
    const alpha = step === TRAIL_CELLS ? 100 : Math.round(((step + 1) / (TRAIL_CELLS + 1)) ** 1.6 * 70);
    stops.push(`transparent ${top}px`);
    stops.push(`color-mix(in srgb, ${tone} ${alpha}%, transparent) ${top}px`);
    stops.push(`color-mix(in srgb, ${tone} ${alpha}%, transparent) ${top + cell}px`);
    stops.push(`transparent ${top + cell}px`);
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}
