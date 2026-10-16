"use client";

import { useLocalTime } from "@/tutorial/clock";
import { STAMP_IMPACT } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring, wobble } from "@/tutorial/timeline";
import type { Beats } from "./beats";
import { ledGrid } from "./pixel";

/**
 * The live taping around the show: an on-air tally with a running timecode,
 * the studio's cue sign (APPLAUSE, LAUGH, OOOH), stage lights, and a studio
 * audience along the bottom that rises for the open and the close and peeks
 * in from the corners when the room reacts. Drawn over the shots in global
 * time; the audience keeps clear of the caption band while a line is up.
 */

export interface CueSign {
  text: string;
  at: number;
  until: number;
}

export interface CrowdMoment {
  at: number;
  until: number;
  /** How hard they bounce, 0..1. */
  energy: number;
}

/** Every studio beat on the global clock, from the voice and the shots' own beats. */
export function studioBeats(
  b: Beats,
  marks: { lock: number; flawless: number; sloppy: number },
) {
  const flawless = marks.flawless + STAMP_IMPACT;
  const laugh = b.wordEnd("robots", "robots.");
  const nice = b.word("self", "nice");
  const signs: CueSign[] = [
    { text: "Applause", at: marks.lock + 0.04, until: b.at("intro") - 0.15 },
    { text: "Applause", at: b.end("intro") - 0.1, until: b.at("robots") + 0.6 },
    { text: "Laugh", at: laugh, until: b.word("robots", "don't") + 0.35 },
    { text: "Laugh", at: nice + 0.3, until: b.at("react") + 0.5 },
    { text: "Oooh", at: flawless, until: flawless + 1.3 },
    { text: "Applause", at: marks.sloppy, until: b.cues.duration + 1 },
  ];
  const crowd: CrowdMoment[] = [
    { at: marks.lock - 0.1, until: b.at("intro") - 0.2, energy: 1 },
    { at: b.end("intro") - 0.15, until: b.at("robots") + 0.7, energy: 0.8 },
    { at: laugh, until: b.word("robots", "don't") + 0.4, energy: 0.55 },
    { at: nice + 0.25, until: b.at("react") + 0.5, energy: 0.55 },
    { at: flawless, until: flawless + 1.3, energy: 0.7 },
    { at: b.word("outro", "wins."), until: b.cues.duration + 1, energy: 0.9 },
  ];
  /** When the whole front row is up: the open, and the end card once the captions clear. */
  const rows = [
    { at: 0, until: b.at("intro") - 0.3 },
    { at: b.end("outro") + 1.15, until: b.cues.duration + 1 },
  ];
  return { signs, crowd, rows, laugh, nice, flawless };
}

export type StudioBeats = ReturnType<typeof studioBeats>;

// ---------------------------------------------------------------------------
// On air
// ---------------------------------------------------------------------------

function timecode(t: number): string {
  const frames = Math.floor(t * 30);
  const ff = frames % 30;
  const ss = Math.floor(frames / 30) % 60;
  const mm = Math.floor(frames / 1800);
  return [mm, ss, ff].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The tally: a blinking red light, LIVE, and the tape's timecode. */
export function OnAir() {
  const t = useLocalTime();
  const shown = progress(t, 0.15, 0.35, ease.out);
  const blink = Math.floor(t / 0.6) % 2 === 0;
  return (
    <div
      className="pointer-events-none absolute right-[64px] top-[48px] z-30 flex items-center gap-[16px] rounded-full border border-edge px-[24px] py-[11px]"
      style={{
        opacity: shown,
        background: "color-mix(in srgb, var(--surface) 82%, transparent)",
        transform: `translateY(${(1 - shown) * -16}px)`,
      }}
    >
      <span
        className="size-[18px] rounded-full bg-punch"
        style={{
          opacity: blink ? 1 : 0.3,
          boxShadow: blink ? "0 0 14px var(--punch)" : undefined,
        }}
      />
      <span className="font-display text-[26px] font-black uppercase leading-none tracking-[0.16em] text-punch">
        Live
      </span>
      <span className="h-[26px] w-[2px] bg-edge-strong" />
      <span className="font-mono text-[24px] font-bold leading-none tabular-nums text-ink-dim">
        {timecode(t)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The cue sign
// ---------------------------------------------------------------------------

/**
 * The studio's lightbox, hung in the top bar beside the tally (clear of every
 * shot's headline): it drops in on its cables, buzzes on, swings, lifts away.
 */
export function Sign({ signs }: { signs: readonly CueSign[] }) {
  const t = useLocalTime();
  const sign = signs.find((candidate) => t >= candidate.at - 0.05 && t < candidate.until + 0.4);
  if (!sign) return null;
  const local = t - sign.at;
  const drop = spring(local + 0.05, SPRINGS.smooth);
  const lift = progress(t, sign.until, 0.35, ease.in);
  const swing = Math.sin(local * 7.5) * Math.exp(-local * 2.4) * 5;
  // A neon buzz as it lights: on, off, on.
  const lit = local < 0 ? 0 : local < 0.06 ? 1 : local < 0.11 ? 0.15 : local < 0.16 ? 1 : 1;
  const flicker = lit * (1 - lift * 0.6) * (0.92 + Math.sin(t * 40) * 0.04);
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        right: 424,
        top: 32,
        transformOrigin: "50% -30px",
        transform: `translateY(${mix(-200, 0, drop) - lift * 220}px) rotate(${swing}deg)`,
      }}
    >
      <div className="absolute -top-[30px] left-[24%] h-[30px] w-[3px] bg-edge-strong" />
      <div className="absolute -top-[30px] right-[24%] h-[30px] w-[3px] bg-edge-strong" />
      <div
        className="relative rounded-[18px] border-[4px] px-[34px] py-[12px]"
        style={{
          background: "#15121b",
          borderColor: "#2e2a38",
          boxShadow: `0 18px 40px -16px rgba(0,0,0,0.6), 0 0 ${Math.round(flicker * 40)}px color-mix(in srgb, var(--punch) ${Math.round(flicker * 45)}%, transparent)`,
        }}
      >
        <div className="absolute inset-[6px] rounded-[10px]" style={ledGrid(5, 3, "rgba(255,255,255,0.05)")} />
        <span
          className="relative block font-display text-[44px] font-black uppercase leading-none tracking-[0.16em]"
          style={{
            color: `color-mix(in srgb, var(--punch) ${Math.round(25 + flicker * 75)}%, #3a2a2e)`,
            textShadow:
              flicker > 0.5
                ? "0 0 12px color-mix(in srgb, var(--punch) 80%, transparent), 0 0 30px color-mix(in srgb, var(--punch) 45%, transparent)"
                : undefined,
          }}
        >
          {sign.text}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

/** Stage beams from the rig above, swaying; `amount` 0..1 fades them. */
export function StageLights({ amount }: { amount: number }) {
  const t = useLocalTime();
  if (amount <= 0.01) return null;
  const beams = [
    { x: 260, tone: "var(--punch)", seed: 1, base: 18 },
    { x: 760, tone: "var(--gold)", seed: 2, base: 6 },
    { x: 1160, tone: "var(--teal)", seed: 3, base: -6 },
    { x: 1660, tone: "var(--punch)", seed: 4, base: -18 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: amount }}>
      {beams.map((beam) => (
        <div
          key={beam.seed}
          className="absolute top-[-80px] h-[1300px] w-[420px]"
          style={{
            left: beam.x - 210,
            transformOrigin: "50% 0",
            transform: `rotate(${beam.base + wobble(t * 0.9, beam.seed) * 9}deg)`,
            clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0 100%)",
            background: `linear-gradient(to bottom, color-mix(in srgb, ${beam.tone} 30%, transparent), transparent 80%)`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The audience
// ---------------------------------------------------------------------------

interface Head {
  x: number;
  back: boolean;
  size: number;
  phase: number;
  arms: boolean;
}

const HEADS: Head[] = (() => {
  const heads: Head[] = [];
  for (let index = 0; index < 22; index++) {
    heads.push({
      x: 20 + index * 90 + (hash01(index * 3.3) - 0.5) * 30,
      back: index % 2 === 1,
      size: 0.85 + hash01(index * 7.1) * 0.3,
      phase: hash01(index * 1.9) * Math.PI * 2,
      arms: index % 3 === 0,
    });
  }
  return heads;
})();

/** Silhouette tones from the theme: near black on the dark set, soft graphite on the light one. */
const FRONT = "color-mix(in srgb, var(--bg) 50%, #000)";
const BACK = "color-mix(in srgb, var(--raised) 78%, #000)";

/** In the corners the crowd can peek up without touching the captions. */
const CORNER = (x: number) => x < 260 || x > 1660;

function windowAmount(t: number, at: number, until: number, rise = 0.3, fall = 0.4) {
  return progress(t, at, rise, ease.out) * (1 - progress(t, until, fall, ease.in));
}

/** A row of silhouettes along the bottom: they bob, and cheer on the room's moments. */
export function Audience({ studio }: { studio: StudioBeats }) {
  const t = useLocalTime();
  const row = Math.max(...studio.rows.map((w) => windowAmount(t, w.at, w.until, 0.5, 0.35)));
  let cheer = 0;
  let corner = 0;
  for (const moment of studio.crowd) {
    const amount = windowAmount(t, moment.at, moment.until, 0.25, 0.5);
    cheer = Math.max(cheer, amount * moment.energy);
    corner = Math.max(corner, amount);
  }
  if (row <= 0.01 && corner <= 0.01) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[300px] overflow-hidden">
      {HEADS.map((head, index) => {
        const up = Math.max(row, CORNER(head.x) ? corner : 0);
        if (up <= 0.01) return null;
        const bob =
          Math.sin(t * 2.2 + head.phase) * 3 -
          Math.abs(Math.sin(t * 8.5 + head.phase)) * 26 * cheer;
        const scale = head.size * (head.back ? 0.86 : 1);
        const sink = (1 - up) * 300 + (head.back ? -34 : 0);
        const armsUp = head.arms && cheer > 0.3;
        const armSwing = Math.sin(t * 8.5 + head.phase) * 12;
        return (
          <div
            key={index}
            className="absolute bottom-0"
            style={{
              left: head.x - 80,
              width: 160,
              height: 230,
              transformOrigin: "50% 100%",
              transform: `translateY(${sink + bob}px) scale(${scale})`,
              zIndex: head.back ? 1 : 2,
            }}
          >
            {armsUp &&
              [-1, 1].map((side) => (
                <div
                  key={side}
                  className="absolute bottom-[86px] h-[130px] w-[30px] rounded-full"
                  style={{
                    left: 65 + side * 52,
                    background: head.back ? BACK : FRONT,
                    transformOrigin: "50% 100%",
                    transform: `rotate(${side * (24 + armSwing)}deg) scaleY(${clamp(cheer * 1.4)})`,
                  }}
                />
              ))}
            <div
              className="absolute bottom-0 left-[10px] h-[120px] w-[140px] rounded-t-[70px]"
              style={{
                background: head.back ? BACK : FRONT,
                boxShadow: `inset 0 3px 0 color-mix(in srgb, var(--punch) ${head.back ? 25 : 45}%, transparent)`,
              }}
            />
            <div
              className="absolute bottom-[104px] left-[38px] size-[84px] rounded-full"
              style={{
                background: head.back ? BACK : FRONT,
                boxShadow: `inset 0 4px 0 color-mix(in srgb, var(--teal) ${head.back ? 20 : 40}%, transparent)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
