"use client";

import { useLocalTime } from "@/tutorial/clock";
import { Burst, Words, shakeOffset } from "@/tutorial/kit";
import { ease, progress } from "@/tutorial/timeline";
import { PixelText, pixelSize } from "../tutorial/pixel";
import { Audience, type StudioBeats } from "../tutorial/studio";
import { Beams } from "./beams";
import { BEATS, DURATION } from "./times";

/**
 * The end slate, in its Sequence's local time (0 = the cut): the LED
 * wordmark rains in pixel by pixel and locks with a flash and a hard shake,
 * the rig lights up, the crowd rises, and the brand line slams in under it.
 */

const WORD = "SLOPLASH";
const CELL = 29;
const GAP = 5;
const WORD_SIZE = pixelSize(WORD, CELL, GAP);
const WORD_Y = 390;

const local = (at: number) => at - BEATS.cut;
const LOCK = local(BEATS.lock);
const END = DURATION - BEATS.cut;

/** The crowd: up for the lock and cheering through the hold. */
const CROWD: StudioBeats = {
  signs: [],
  crowd: [{ at: LOCK - 0.05, until: END + 1, energy: 0.85 }],
  rows: [{ at: LOCK - 0.05, until: END + 1 }],
  laugh: 0,
  nice: 0,
  flawless: 0,
};

export function Slate() {
  const t = useLocalTime();
  const shake = shakeOffset(t, LOCK, 22, 0.5);
  const breathe = t > LOCK + 0.5 ? 1 + Math.sin((t - LOCK - 0.5) * 2.6) * 0.012 : 1;
  const lockPunch = t >= LOCK ? Math.exp(-(t - LOCK) * 7) * Math.sin((t - LOCK) * 30) : 0;
  const lights = 0.35 + progress(t, LOCK - 0.05, 0.4, ease.out) * 0.65;
  // The lock's gold blink: one lit copy of the wordmark fading over it, so the
  // flash moves a single layer instead of restyling every pixel.
  const flash = t >= LOCK ? 1 - progress(t, LOCK, 0.45, ease.out) : 0;
  return (
    <div className="absolute inset-0">
      <Beams amount={lights} />
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${shake.x}px, ${shake.y}px)` }}
      >
        <div
          className="pointer-events-none absolute left-1/2 h-[820px] w-[1900px] -translate-x-1/2 -translate-y-1/2"
          style={{
            top: WORD_Y,
            opacity: 0.45 + (t >= LOCK ? Math.exp(-(t - LOCK) * 3) : 0) * 0.55,
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--punch) 26%, transparent), transparent)",
          }}
        />
        <div
          className="absolute"
          style={{
            left: 960 - WORD_SIZE.width / 2,
            top: WORD_Y - WORD_SIZE.height / 2,
            transform: `scale(${breathe * (1 + lockPunch * 0.05)})`,
          }}
        >
          <PixelText
            text={WORD}
            cell={CELL}
            gap={GAP}
            grid={2}
            rain={{
              start: local(BEATS.rainStart),
              end: local(BEATS.rainEnd),
              drop: 900,
              speed: 3000,
              seed: 4,
            }}
            shimmer={LOCK + 0.7}
          />
          {flash > 0 && (
            <div className="absolute left-0 top-0" style={{ opacity: flash * 0.9 }}>
              <PixelText text={WORD} cell={CELL} gap={GAP} color="var(--gold)" />
            </div>
          )}
        </div>
        <div className="absolute" style={{ left: 960, top: WORD_Y }}>
          <Burst at={LOCK} count={22} speed={1400} gravity={1500} size={24} duration={1.3} seed={21} />
        </div>
        <div className="absolute inset-x-0 text-center" style={{ top: 640 }}>
          <Words
            text="Out-funny the AI."
            at={local(BEATS.tagline)}
            stagger={0.12}
            accent={["AI."]}
            accentClassName="text-ai"
            from={{ opacity: 0, y: 30, scale: 1.6, blur: 6 }}
            className="font-display text-[124px] font-black leading-none tracking-[-0.015em] text-ink"
          />
        </div>
      </div>
      <Audience studio={CROWD} />
      <div
        className="pointer-events-none absolute inset-0 bg-punch"
        style={{ opacity: t >= LOCK ? (1 - progress(t, LOCK, 0.45, ease.out)) * 0.34 : 0 }}
      />
    </div>
  );
}
