"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCues, useLocalTime, useTime } from "@/tutorial/clock";
import { BOARD } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring } from "@/tutorial/timeline";
import { DRAWING_CANVAS_HEX, TOY_COLOR_VALUES } from "../vocab";

// SlopFight's tutorial look: "Dusk Arena" pieces every shot shares. Fredoka
// slam titles with a toy extrusion, letterbox bars, the dusk spotlight, the
// slash transition, and the beat helper that keys shots on the voice.

// ---------------------------------------------------------------------------
// Type and colour
// ---------------------------------------------------------------------------

const FAMILY = "SF Tutorial Fredoka";
export const FREDOKA = `"${FAMILY}", "Fredoka", ui-rounded, system-ui, sans-serif`;

const FONT_FILES = [
  ["700", "/fonts/slopfight/fredoka-latin-700-normal.woff"],
  ["600", "/fonts/slopfight/fredoka-latin-600-normal.woff"],
] as const;
let fontsAdded = false;

/** Registers the game's Fredoka with the document and starts loading it. */
export function loadFonts(): void {
  if (fontsAdded || typeof document === "undefined" || typeof FontFace === "undefined") return;
  fontsAdded = true;
  for (const [weight, url] of FONT_FILES) {
    const face = new FontFace(FAMILY, `url(${url}) format("woff")`, { weight, display: "block" });
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
}

/** Toy colours (soft vinyl) and the drawing canvas cream: the game's fixed art palette. */
export const TOY = TOY_COLOR_VALUES;
export const CREAM = DRAWING_CANVAS_HEX;
/** Letterbox bars and stage black: a warm aubergine night, never pure black. */
export const NIGHT = "#140B10";
/** The ink every toy and doodle is outlined in. */
export const INK = "#2A1A1F";
/** Slam title faces. */
export const FACE = "#FFF4DC";

/** Mixes two #rrggbb colours. */
export function mixHex(a: string, b: string, amount: number): string {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x: number, y: number) =>
    Math.round(mix(x, y, amount))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

/**
 * Scene-scoped tokens that follow the theme (light is the default unless the
 * root says dark, as in slopfight-theme.css).
 */
export function SceneTokens() {
  return (
    <style>{`
[data-sft] {
  --sft-beam: rgba(255, 206, 150, 0.17);
  --sft-beam-core: rgba(255, 226, 180, 0.22);
  --sft-pool: rgba(255, 170, 100, 0.20);
  --sft-vignette: rgba(10, 4, 8, 0.62);
  --sft-crowd: rgba(14, 7, 11, 0.92);
  --sft-prop: color-mix(in srgb, var(--sf-ink) 9%, transparent);
  --sft-prop-strong: color-mix(in srgb, var(--sf-ink) 16%, transparent);
  --sft-ground: rgba(8, 3, 6, 0.38);
}
:root:not([data-theme="dark"]) [data-sft] {
  --sft-beam: rgba(255, 150, 70, 0.13);
  --sft-beam-core: rgba(255, 190, 120, 0.16);
  --sft-pool: rgba(240, 120, 50, 0.14);
  --sft-vignette: rgba(217, 80, 26, 0.10);
  --sft-crowd: rgba(42, 26, 31, 0.88);
  --sft-prop: color-mix(in srgb, var(--sf-ink) 7%, transparent);
  --sft-prop-strong: color-mix(in srgb, var(--sf-ink) 12%, transparent);
  --sft-ground: rgba(42, 26, 31, 0.20);
}
`}</style>
  );
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

export interface Beat {
  /** Local seconds in the enclosing Sequence. */
  t: number;
  /** A global time (a cue) in local seconds. */
  local: (global: number) => number;
  at: (id: string, offset?: number) => number;
  end: (id: string, offset?: number) => number;
  word: (id: string, word: string, nth?: number) => number;
  wordEnd: (id: string, word: string, nth?: number) => number;
}

/** The voice's cues, in the local time of the enclosing Sequence. */
export function useBeat(): Beat {
  const cues = useCues();
  const global = useTime();
  const t = useLocalTime();
  const origin = global - t;
  return {
    t,
    local: (time) => time - origin,
    at: (id, offset = 0) => cues.at(id, offset) - origin,
    end: (id, offset = 0) => cues.end(id, offset) - origin,
    word: (id, word, nth) => cues.word(id, word, nth) - origin,
    wordEnd: (id, word, nth) => cues.wordEnd(id, word, nth) - origin,
  };
}

/** A bump that peaks at `at` and decays like a struck jelly: for squash on impact. */
export function jiggle(t: number, at: number, decay = 8, frequency = 24): number {
  if (t < at) return 0;
  const local = t - at;
  return Math.exp(-local * decay) * Math.cos(local * frequency);
}

// ---------------------------------------------------------------------------
// Slam titles
// ---------------------------------------------------------------------------

export type SlamTone = "tangerine" | "gold" | "teal" | "tomato";

const SLAM_SIDE: Record<SlamTone, { face: [string, string]; side: string }> = {
  tangerine: { face: ["#FFFBF2", "#FFE2BC"], side: "#E2601F" },
  gold: { face: ["#FFF1B8", "#FFC94A"], side: "#B57A0C" },
  teal: { face: ["#F2FFFB", "#C9F2EA"], side: "#16867A" },
  tomato: { face: ["#FFF6EE", "#FFD9CC"], side: "#C93A26" },
};

/** Extruded toy lettering: a cream face, a chunky ink outline and a coloured side. */
export function SlamText({
  text,
  size,
  tone = "tangerine",
  depth = 0.1,
  className = "",
  style,
}: {
  text: string;
  size: number;
  tone?: SlamTone;
  /** Extrusion depth in ems. */
  depth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { face, side } = SLAM_SIDE[tone];
  const stroke = size * 0.11;
  const rim = size * 0.05;
  const deep = size * depth;
  const steps = 5;
  const layer: CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "nowrap" };
  const offsets = Array.from({ length: steps + 1 }, (_, index) => (deep * index) / steps);
  return (
    <div
      className={`relative whitespace-nowrap uppercase ${className}`}
      style={{
        fontFamily: FREDOKA,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "0.035em",
        paddingInline: stroke * 0.6,
        ...style,
      }}
      aria-label={text}
    >
      {offsets.map((y) => (
        <span
          key={`rim${y}`}
          aria-hidden="true"
          style={{
            ...layer,
            paddingInline: stroke * 0.6,
            color: INK,
            WebkitTextStroke: `${stroke + rim * 2}px ${INK}`,
            transform: `translateY(${y}px)`,
          }}
        >
          {text}
        </span>
      ))}
      {offsets.map((y) => (
        <span
          key={`side${y}`}
          aria-hidden="true"
          style={{
            ...layer,
            paddingInline: stroke * 0.6,
            color: side,
            WebkitTextStroke: `${stroke}px ${side}`,
            transform: `translateY(${y}px)`,
          }}
        >
          {text}
        </span>
      ))}
      <span
        aria-hidden="true"
        style={{ ...layer, paddingInline: stroke * 0.6, color: INK, WebkitTextStroke: `${stroke}px ${INK}` }}
      >
        {text}
      </span>
      <span
        aria-hidden="true"
        className="relative"
        style={{
          backgroundImage: `linear-gradient(180deg, ${face[0]} 30%, ${face[1]} 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** A jagged comic starburst, for behind a slam. */
export function StarBurst({
  size,
  color,
  points = 14,
  seed = 3,
  rotate = 0,
  style,
}: {
  size: number;
  color: string;
  points?: number;
  seed?: number;
  rotate?: number;
  style?: CSSProperties;
}) {
  const coords: string[] = [];
  for (let index = 0; index < points * 2; index++) {
    const angle = (index / (points * 2)) * Math.PI * 2;
    const outer = index % 2 === 0;
    const radius = outer ? 0.92 + hash01(seed * 17 + index) * 0.08 : 0.58 + hash01(seed * 5 + index) * 0.12;
    coords.push(`${(Math.cos(angle) * radius * 50 + 50).toFixed(2)},${(Math.sin(angle) * radius * 50 + 50).toFixed(2)}`);
  }
  return (
    <svg
      viewBox="-4 -4 108 108"
      width={size}
      height={size}
      className="absolute left-1/2 top-1/2"
      style={{ transform: `translate(-50%, -50%) rotate(${rotate}deg)`, overflow: "visible", ...style }}
      aria-hidden="true"
    >
      <polygon points={coords.join(" ")} fill={color} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A slam title: drops from 2.8x on the slam spring, squashes on impact like
 * rubber, optionally over a starburst. `at` is the frame it appears; the
 * impact lands at `at + SLAM_IMPACT`.
 */
export function Slam({
  text,
  at,
  out,
  x = BOARD.width / 2,
  y = BOARD.height / 2,
  size = 200,
  tone = "tangerine",
  rotate = -4,
  burst,
  burstSize = 1.5,
  settle,
}: {
  text: string;
  at: number;
  out?: number;
  x?: number;
  y?: number;
  size?: number;
  tone?: SlamTone;
  rotate?: number;
  /** Starburst colour behind the title; none when omitted. */
  burst?: string;
  /** Starburst size relative to the title's width estimate. */
  burstSize?: number;
  /** Optional move after landing: where it settles and when. */
  settle?: { at: number; x: number; y: number; scale: number };
}) {
  const t = useLocalTime();
  if (t < at) return null;
  if (out !== undefined && t > out + 0.35) return null;
  const drop = mix(2.8, 1, spring(t - at, SPRINGS.slam));
  const k = jiggle(t, at + SLAM_IMPACT, 7, 22);
  const leave = out === undefined ? 0 : progress(t, out, 0.3, ease.in);
  const blur = Math.max(0, (drop - 1.15) * 6);
  const move = settle ? spring(t - settle.at, SPRINGS.smooth) : 0;
  const px = settle ? mix(x, settle.x, move) : x;
  const py = settle ? mix(y, settle.y, move) : y;
  const scale = drop * (settle ? mix(1, settle.scale, move) : 1) * (1 + leave * 0.35);
  const width = text.length * size * 0.68;
  const burstIn = spring(t - at - 0.06, SPRINGS.pop);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: px,
        top: py,
        transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale * (1 + 0.14 * k)}, ${scale * (1 - 0.18 * k)})`,
        opacity: progress(t, at, 0.05) * (1 - leave),
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      }}
    >
      {burst && (
        <StarBurst
          size={width * burstSize * burstIn}
          color={burst}
          rotate={(t - at) * 14}
          seed={text.length}
        />
      )}
      <SlamText text={text} size={size} tone={tone} />
    </div>
  );
}

/** Seconds from a slam appearing to its impact frame. */
export const SLAM_IMPACT = 0.1;

// ---------------------------------------------------------------------------
// Letterbox, spotlight, backdrop
// ---------------------------------------------------------------------------

/** Cinematic bars: they slam closed at `at` and open at `out`. */
export function Letterbox({
  at,
  out,
  height = 130,
  edge = true,
}: {
  at: number;
  out?: number;
  height?: number;
  edge?: boolean;
}) {
  const t = useLocalTime();
  const closing = progress(t, at, 0.32, ease.outExpo);
  const opening = out === undefined ? 0 : progress(t, out, 0.45, ease.inOut);
  const h = height * closing * (1 - opening);
  if (h <= 0.5) return null;
  const bar: CSSProperties = { background: NIGHT, height: h };
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-x-0 top-0" style={bar}>
        {edge && <div className="absolute inset-x-0 bottom-0 h-[5px] bg-punch" />}
      </div>
      <div className="absolute inset-x-0 bottom-0" style={bar}>
        {edge && <div className="absolute inset-x-0 top-0 h-[5px] bg-punch" />}
      </div>
    </div>
  );
}

/** The dusk spotlight: a soft cone from above and a pool on the floor. */
export function Spotlight({
  x = BOARD.width / 2,
  floor = 860,
  width = 980,
  intensity = 1,
  sway = 0,
}: {
  x?: number;
  floor?: number;
  /** Width of the pool on the floor. */
  width?: number;
  intensity?: number;
  /** Degrees the beam swings either side over time. */
  sway?: number;
}) {
  const t = useTime();
  if (intensity <= 0.01) return null;
  const tilt = sway * Math.sin(t * 0.8);
  const top = 70;
  const half = width / 2;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ opacity: clamp(intensity), transform: `rotate(${tilt}deg)`, transformOrigin: `${x}px -60px` }}
    >
      <svg width={BOARD.width} height={BOARD.height} className="absolute inset-0" aria-hidden="true">
        <defs>
          <linearGradient id="sft-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sft-beam-core)" />
            <stop offset="1" stopColor="var(--sft-beam)" />
          </linearGradient>
          <radialGradient id="sft-pool">
            <stop offset="0" stopColor="var(--sft-pool)" />
            <stop offset="0.7" stopColor="var(--sft-pool)" stopOpacity={0.5} />
            <stop offset="1" stopColor="var(--sft-pool)" stopOpacity={0} />
          </radialGradient>
        </defs>
        <polygon
          points={`${x - top * 1.3},-60 ${x + top * 1.3},-60 ${x + half * 1.08},${floor} ${x - half * 1.08},${floor}`}
          fill="url(#sft-beam)"
          opacity={0.55}
        />
        <polygon
          points={`${x - top},-60 ${x + top},-60 ${x + half * 0.8},${floor} ${x - half * 0.8},${floor}`}
          fill="url(#sft-beam)"
        />
        <ellipse cx={x} cy={floor} rx={half * 1.05} ry={half * 0.16} fill="url(#sft-pool)" />
      </svg>
    </div>
  );
}

/** The board's ground: the live ambient field shows through, edges sink into a dusk vignette. */
export function Backdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(115% 95% at 50% 42%, transparent 46%, var(--sft-vignette) 100%)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The signature transition
// ---------------------------------------------------------------------------

/**
 * The slash: letterbox bars snap shut, a tangerine slash (gold lead, teal
 * tail) whips across and covers the board at `at + duration / 2` (cut
 * there), then carries on and the bars open. Its chapter name rides the band.
 */
export function SlashWipe({ at, duration = 0.8, label }: { at: number; duration?: number; label?: string }) {
  const t = useLocalTime();
  if (t < at || t > at + duration) return null;
  const half = duration / 2;
  const main = 2700;
  const skew = 18;
  const start = -main - 700;
  const middle = (BOARD.width - main) / 2;
  const finish = BOARD.width + 700;
  const position =
    t < at + half
      ? mix(start, middle, progress(t, at, half, ease.outQuint))
      : mix(middle, finish, progress(t, at + half, half, ease.inExpo));
  const bars = progress(t, at, 0.14, ease.out) * (1 - progress(t, at + duration - 0.18, 0.18, ease.in));
  const band = (left: number, width: number, background: string, children?: ReactNode) => (
    <div
      className="absolute top-[-240px] h-[1560px]"
      style={{ left, width, background, transform: `skewX(-${skew}deg)` }}
    >
      {children}
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <div className="absolute inset-x-0 top-0" style={{ height: 120 * bars, background: NIGHT }} />
      <div className="absolute inset-x-0 bottom-0" style={{ height: 120 * bars, background: NIGHT }} />
      {band(position + main + 40, 110, TOY.butter.hex)}
      {band(position + main + 170, 36, CREAM)}
      {band(
        position,
        main,
        "linear-gradient(90deg, #D9501A 0%, #FF7A3D 40%, #FF8A4C 60%, #E2601F 100%)",
        label && (
          <div
            className="absolute left-1/2 top-1/2 whitespace-nowrap uppercase"
            style={{
              transform: `translate(-50%, -50%) skewX(${skew}deg)`,
              fontFamily: FREDOKA,
              fontWeight: 700,
              fontSize: 260,
              letterSpacing: "0.06em",
              color: "rgba(42, 26, 31, 0.16)",
            }}
          >
            {label}
          </div>
        ),
      )}
      {band(position - 200, 150, TOY.teal.hex)}
      {band(position - 250, 30, NIGHT)}
    </div>
  );
}

/** A full-board white-hot flash for big impacts (brief, cheap). */
export function Flash({ at, duration = 0.22, strength = 0.55 }: { at: number; duration?: number; strength?: number }) {
  const t = useLocalTime();
  if (t < at || t > at + duration) return null;
  const amount = (1 - progress(t, at, duration, ease.out)) * strength;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      style={{ background: "#FFF6E6", opacity: amount, mixBlendMode: "screen" }}
    />
  );
}

