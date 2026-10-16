"use client";

import { useTime } from "@/tutorial/clock";
import { hash01, wobble } from "@/tutorial/timeline";
import { Backdrop, C, alpha } from "../tutorial/fx";
import { DURATION } from "./beatsheet";

const TINTS = [C.rose, C.violet, C.coral] as const;

/** Soft bokeh drifting up; each completes whole laps per loop, so the field is seamless. */
const BOKEH = Array.from({ length: 9 }, (_, index) => ({
  x: 90 + hash01(index * 3.1 + 1) * 1740,
  size: 90 + hash01(index * 5.7 + 2) * 190,
  phase: hash01(index * 7.3 + 3),
  laps: 1 + (index % 2),
  tint: TINTS[index % TINTS.length],
  strength: 9 + hash01(index * 2.9 + 4) * 9,
}));

/**
 * The bar behind the date: the page's plum (or blush) under a rose stage light,
 * drifting bokeh, and a vignette. `warm` turns the light up; `mint` washes in
 * the date's mint.
 */
export function Room({
  warm = 0,
  mint = 0,
  hit = 0,
  hitColor = C.rose,
}: {
  warm?: number;
  mint?: number;
  /** 0..1, a stamp's impact flash. */
  hit?: number;
  hitColor?: string;
}) {
  const t = useTime();
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: C.bg }}>
      {BOKEH.map((dot, index) => {
        const lap = (dot.phase + (dot.laps * t) / DURATION) % 1;
        const y = 1240 - lap * 1520;
        const x = dot.x + wobble(t * 0.6, index) * 40;
        return (
          <div
            key={index}
            className="absolute left-0 top-0 rounded-full"
            style={{
              width: dot.size,
              height: dot.size,
              transform: `translate(${(x - dot.size / 2).toFixed(1)}px, ${(y - dot.size / 2).toFixed(1)}px)`,
              background: `radial-gradient(circle, ${alpha(dot.tint, dot.strength)} 0%, ${alpha(dot.tint, dot.strength * 0.45)} 45%, transparent 70%)`,
            }}
          />
        );
      })}
      {warm > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: warm,
            background: `radial-gradient(70% 70% at 50% 55%, ${alpha(C.rose, 22)}, ${alpha(C.coral, 6)} 60%, transparent 80%)`,
          }}
        />
      )}
      <Backdrop mint={mint} />
      {hit > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: hit,
            background: `radial-gradient(60% 60% at 50% 45%, ${alpha(hitColor, 34)}, ${alpha(hitColor, 10)} 55%, transparent 80%)`,
          }}
        />
      )}
    </div>
  );
}
