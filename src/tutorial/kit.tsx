"use client";

import type { CSSProperties, ReactNode } from "react";
import { STAMP_IMPACT_MS } from "@/lib/animations";
import { playSound, type SoundName } from "@/lib/sounds";
import { WORN_MASK } from "@/room/moment/stamp";
import { BOARD } from "./board";
import { useLocalTime } from "./clock";
import type { SoundCue } from "./spec";
import {
  SPRINGS,
  clamp,
  ease,
  hash01,
  interpolate,
  mix,
  normalWord,
  progress,
  spring,
  type Easing,
  type SpringConfig,
} from "./timeline";

/**
 * The tutorial motion kit. Every piece reads the local time of its enclosing
 * `Sequence` and draws one frame from it: no state, no timers, so any frame
 * can be rendered on its own. Sizes are artboard pixels (1920 x 1080); the
 * player scales the whole board to the screen.
 */

export { BOARD };

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/** A pose an element animates between. Omitted fields are the identity. */
export interface Pose {
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  opacity?: number;
  /** Blur in px. */
  blur?: number;
}

const IDENTITY: Required<Pose> = {
  x: 0,
  y: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  opacity: 1,
  blur: 0,
};

function full(pose: Pose | undefined): Required<Pose> {
  return { ...IDENTITY, ...pose };
}

/** The CSS for a pose. */
export function poseStyle(pose: Pose): CSSProperties {
  const p = full(pose);
  return {
    transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rotate}deg) scale(${p.scale * p.scaleX}, ${p.scale * p.scaleY})`,
    opacity: clamp(p.opacity),
    filter: p.blur > 0.05 ? `blur(${p.blur}px)` : undefined,
  };
}

function mixPose(a: Required<Pose>, b: Required<Pose>, amount: number): Required<Pose> {
  return {
    x: mix(a.x, b.x, amount),
    y: mix(a.y, b.y, amount),
    scale: mix(a.scale, b.scale, amount),
    scaleX: mix(a.scaleX, b.scaleX, amount),
    scaleY: mix(a.scaleY, b.scaleY, amount),
    rotate: mix(a.rotate, b.rotate, amount),
    opacity: mix(a.opacity, b.opacity, amount),
    blur: mix(a.blur, b.blur, amount),
  };
}

export interface EnterExit {
  /** Local seconds the entrance starts. */
  at?: number;
  /** Where it enters from. Default: faded and 40px low. */
  from?: Pose;
  /** Where it rests. Default: the identity. */
  to?: Pose;
  /** The entrance spring. Default `SPRINGS.smooth`. */
  spring?: SpringConfig;
  /** Local seconds the exit starts; no exit if omitted. */
  out?: number;
  /** Where it leaves to. Default: faded and 24px high. */
  exit?: Pose;
  /** Exit length in seconds. Default 0.3. */
  exitDuration?: number;
  /** Exit easing. Default `ease.in`. */
  exitEase?: Easing;
}

const DEFAULT_FROM: Pose = { opacity: 0, y: 40 };
const DEFAULT_EXIT: Pose = { opacity: 0, y: -24 };
/** Opacity rises over this long, so a bouncy spring never flickers it past 1. */
const FADE_IN = 0.18;

/** The pose of an `EnterExit` at local time `t`. */
export function enterExitPose(t: number, motion: EnterExit): Required<Pose> {
  const {
    at = 0,
    from = DEFAULT_FROM,
    to,
    spring: config = SPRINGS.smooth,
    out,
    exit = DEFAULT_EXIT,
    exitDuration = 0.3,
    exitEase = ease.in,
  } = motion;
  const start = full({ ...IDENTITY, ...to, ...from });
  const rest = full(to);
  const amount = spring(t - at, config);
  const pose = mixPose(start, rest, amount);
  pose.opacity = mix(start.opacity, rest.opacity, progress(t, at, FADE_IN, ease.out));
  if (out === undefined) return pose;
  const leaving = progress(t, out, exitDuration, exitEase);
  return mixPose(pose, full({ ...rest, ...exit }), leaving);
}

/** Absolutely places its children on the artboard, centred on (x, y) unless `anchor` says otherwise. */
export function Place({
  x,
  y,
  anchor = "center",
  className = "",
  style,
  children,
}: {
  x: number;
  y: number;
  anchor?: "center" | "top-left" | "top" | "left";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const shift =
    anchor === "center"
      ? "translate(-50%, -50%)"
      : anchor === "top"
        ? "translate(-50%, 0)"
        : anchor === "left"
          ? "translate(0, -50%)"
          : undefined;
  return (
    <div
      className={`absolute ${className}`}
      style={{ left: x, top: y, transform: shift, ...style }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera and shake
// ---------------------------------------------------------------------------

export interface CameraKey {
  /** Local seconds. */
  at: number;
  /** The board point (px) the camera centres on. Default: the board centre. */
  x?: number;
  y?: number;
  zoom?: number;
  rotate?: number;
}

/** Where a camera is: the board point it centres on, its zoom and roll. */
export interface CameraPose {
  x: number;
  y: number;
  zoom: number;
  rotate: number;
}

/** The pose of a camera on `keys` at local time `t`. */
export function cameraPose(
  t: number,
  keys: readonly CameraKey[],
  easing: Easing = ease.inOut,
): CameraPose {
  const times = keys.map((key) => key.at);
  const track = (pick: (key: CameraKey) => number | undefined, fallback: number) => {
    const values = keys.map((key) => pick(key) ?? fallback);
    return keys.length === 1 ? values[0] : interpolate(t, times, values, easing);
  };
  return {
    x: track((key) => key.x, BOARD.width / 2),
    y: track((key) => key.y, BOARD.height / 2),
    zoom: track((key) => key.zoom, 1),
    rotate: track((key) => key.rotate, 0),
  };
}

/** Where a board point inside a `Camera` shows on screen, for the camera at `pose`. */
export function toScreen(point: { x: number; y: number }, pose: CameraPose): { x: number; y: number } {
  const dx = pose.zoom * (point.x - pose.x);
  const dy = pose.zoom * (point.y - pose.y);
  if (pose.rotate === 0) return { x: BOARD.width / 2 + dx, y: BOARD.height / 2 + dy };
  const angle = (pose.rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: BOARD.width / 2 + dx * cos - dy * sin,
    y: BOARD.height / 2 + dx * sin + dy * cos,
  };
}

/**
 * A camera over its children: keyframes of focus point, zoom and roll, eased
 * between. Put everything that should move together inside one camera.
 */
export function Camera({
  keys,
  easing = ease.inOut,
  children,
}: {
  keys: readonly CameraKey[];
  easing?: Easing;
  children?: ReactNode;
}) {
  const { x, y, zoom, rotate } = cameraPose(useLocalTime(), keys, easing);
  return (
    <div
      className="absolute inset-0"
      style={{
        transformOrigin: `${BOARD.width / 2}px ${BOARD.height / 2}px`,
        transform: `rotate(${rotate}deg) scale(${zoom}) translate(${BOARD.width / 2 - x}px, ${BOARD.height / 2 - y}px)`,
      }}
    >
      {children}
    </div>
  );
}

/** A decaying shake starting at `at`: `strength` px, settling over `duration` seconds. */
export function shakeOffset(t: number, at: number, strength = 14, duration = 0.4) {
  const local = t - at;
  if (local < 0 || local > duration) return { x: 0, y: 0 };
  const decay = 1 - local / duration;
  return {
    x: Math.sin(local * 90) * strength * decay,
    y: Math.cos(local * 70) * strength * 0.6 * decay,
  };
}

/** Shakes its children at each time in `at`. */
export function Shake({
  at,
  strength = 14,
  duration = 0.4,
  children,
  className = "",
}: {
  at: number | readonly number[];
  strength?: number;
  duration?: number;
  children?: ReactNode;
  className?: string;
}) {
  const t = useLocalTime();
  const times = typeof at === "number" ? [at] : at;
  let x = 0;
  let y = 0;
  for (const time of times) {
    const offset = shakeOffset(t, time, strength, duration);
    x += offset.x;
    y += offset.y;
  }
  return (
    <div className={className} style={{ transform: `translate(${x}px, ${y}px)` }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** A word's visible characters, emoji kept whole. */
function graphemes(word: string): string[] {
  if (!segmenter) return word.split("");
  return Array.from(segmenter.segment(word), (part) => part.segment);
}

/**
 * Kinetic type: each word (or letter) springs up out of a blur in turn.
 * `accent` words take `accentClassName`, e.g. the game's punch colour.
 */
export function Words({
  text,
  at = 0,
  stagger = 0.07,
  per = "word",
  from = { opacity: 0, y: 36, blur: 10 },
  spring: config = SPRINGS.pop,
  out,
  exit,
  accent = [],
  accentClassName = "text-punch",
  className = "",
}: {
  text: string;
  at?: number;
  stagger?: number;
  per?: "word" | "char";
  from?: Pose;
  spring?: SpringConfig;
  out?: number;
  exit?: Pose;
  accent?: readonly string[];
  accentClassName?: string;
  className?: string;
}) {
  const t = useLocalTime();
  const accents = new Set(accent.map(normalWord));
  const words = text.split(" ");
  let index = 0;
  return (
    <span className={className} aria-label={text}>
      {words.map((word, wordIndex) => {
        const wordClass = accents.has(normalWord(word)) ? accentClassName : "";
        const pieces = per === "char" ? graphemes(word) : [word];
        return (
          <span key={wordIndex} aria-hidden="true" className={`inline-block ${wordClass}`}>
            {pieces.map((piece, pieceIndex) => {
              const start = at + index++ * stagger;
              const pose = enterExitPose(t, {
                at: start,
                from,
                spring: config,
                out: out === undefined ? undefined : out + (index - 1) * stagger * 0.4,
                exit,
              });
              return (
                <span key={pieceIndex} className="inline-block" style={poseStyle(pose)}>
                  {piece}
                </span>
              );
            })}
            {wordIndex < words.length - 1 && <span className="inline-block">&nbsp;</span>}
          </span>
        );
      })}
    </span>
  );
}

/** Text typing itself out at `cps` characters a second from `at`, with an optional caret. */
export function TypeOn({
  text,
  at = 0,
  cps = 28,
  caret = true,
  className = "",
}: {
  text: string;
  at?: number;
  cps?: number;
  caret?: boolean;
  className?: string;
}) {
  const t = useLocalTime();
  const shown = Math.floor(clamp((t - at) * cps, 0, text.length));
  const typing = t >= at && shown < text.length;
  const blink = Math.floor(t * 2.2) % 2 === 0;
  return (
    <span className={className}>
      {text.slice(0, shown)}
      {caret && (typing || (t >= at && blink)) && (
        <span className="ml-[0.05em] inline-block h-[1em] w-[0.08em] translate-y-[0.12em] bg-current" />
      )}
      {/* Reserve the full width so the line never reflows as it types. */}
      <span className="invisible">{text.slice(shown)}</span>
    </span>
  );
}

/** A number counting from `from` to `to` over `duration` seconds from `at`. */
export function Count({
  from = 0,
  to,
  at = 0,
  duration = 0.9,
  format = (value: number) => Math.round(value).toLocaleString("en-US"),
  className = "",
}: {
  from?: number;
  to: number;
  at?: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const t = useLocalTime();
  const value = mix(from, to, progress(t, at, duration, ease.out));
  return <span className={`tabular-nums ${className}`}>{format(value)}</span>;
}

// ---------------------------------------------------------------------------
// Stamps, taps, bursts, flights
// ---------------------------------------------------------------------------

export type Tone = "punch" | "teal" | "gold" | "win" | "fail" | "ink";

const TONE_COLOR: Record<Tone, string> = {
  punch: "var(--punch)",
  teal: "var(--teal)",
  gold: "var(--gold)",
  win: "var(--win)",
  fail: "var(--fail)",
  ink: "var(--ink)",
};

/** How a stamp is thrown: from `scale` and `wind` degrees past its rotation; `exit` seconds to leave, shrinking by `shrink`. */
const STAMP_THROW = {
  plain: { scale: 2.6, wind: 0, exit: 0.25, shrink: 0.15 },
  worn: { scale: 2.6, wind: 9, exit: 0.28, shrink: 0.12 },
  heavy: { scale: 3.4, wind: 20, exit: 0.28, shrink: 0.12 },
} as const;

/** The worn stamp's face, as the app's (`room/moment/stamp.tsx`). */
const WORN_FACE: CSSProperties = {
  padding: "0.42em 0.8em 0.36em",
  border: "0.14em solid currentColor",
  borderRadius: "0.2em",
  outline: "0.045em solid currentColor",
  outlineOffset: "-0.3em",
  background: "color-mix(in srgb, currentColor 13%, var(--surface))",
  maskImage: WORN_MASK,
  WebkitMaskImage: WORN_MASK,
  maskSize: "180px 180px",
  WebkitMaskSize: "180px 180px",
};

/**
 * A rubber stamp slamming down at `at`: it drops from 2.6x, lands on the
 * slam spring, and leaves a faint ink ring. Pair it with a "stamp-slam" sound
 * at `at + STAMP_IMPACT` and a `Shake`. `worn` draws the game's own stamp
 * (worn rubber, winding in over-tilted); `heavy` throws that from higher and
 * harder.
 */
export function Stamp({
  text,
  at = 0,
  tone = "punch",
  rotate = -3,
  size = 96,
  worn = false,
  heavy = false,
  out,
  peel,
  reserve = false,
  className = "",
  style,
}: {
  text: ReactNode;
  at?: number;
  tone?: Tone;
  rotate?: number;
  /** Font size in px. */
  size?: number;
  worn?: boolean;
  /** A worn stamp thrown from higher and harder. */
  heavy?: boolean;
  /** Fades out from here. */
  out?: number;
  /** Peels off from here (rotates, drops, fades). */
  peel?: number;
  /** Keeps its place in the layout (invisible) before it lands. */
  reserve?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useLocalTime();
  const color = TONE_COLOR[tone];
  const face = worn ? (
    <span
      className="block whitespace-nowrap text-center font-display font-black uppercase leading-none tracking-[0.1em]"
      style={WORN_FACE}
    >
      {text}
    </span>
  ) : (
    <div
      className="rounded-[0.3em] border-[0.09em] px-[0.4em] py-[0.08em] font-display font-black uppercase leading-none tracking-[0.04em]"
      style={{ fontSize: size, color, borderColor: color, background: "var(--surface)" }}
    >
      {text}
    </div>
  );
  // A worn face sizes in em from its box, so the ring scales with it; a plain face sizes itself.
  const box = worn
    ? "relative inline-flex items-center justify-center"
    : "relative inline-block";
  const boxSize = worn ? size : undefined;
  const placeholder = reserve ? (
    <div className={`invisible ${box} ${className}`} style={{ fontSize: boxSize, ...style }}>
      {face}
    </div>
  ) : null;
  if (t < at) return placeholder;

  const thrown = STAMP_THROW[worn ? (heavy ? "heavy" : "worn") : "plain"];
  const drop = spring(t - at, SPRINGS.slam);
  const scale = mix(thrown.scale, 1, drop);
  const turn = mix(rotate - thrown.wind, rotate, drop);
  const leaving = out === undefined ? 0 : progress(t, out, thrown.exit, ease.in);
  const peeling = peel === undefined ? 0 : progress(t, peel, 0.55, ease.in);
  const opacity = progress(t, at, 0.06) * (1 - leaving) * (1 - peeling);
  if (opacity <= 0.001) return placeholder;
  const ring = progress(t, at + STAMP_IMPACT, 0.5, ease.out);
  return (
    <div
      className={`${box} ${className}`}
      style={{
        color,
        fontSize: boxSize,
        opacity,
        transform: `translate(${peeling * 40}px, ${peeling * 140}px) rotate(${turn + peeling * 28}deg) scale(${scale * (1 - leaving * thrown.shrink)})`,
        ...style,
      }}
    >
      {worn ? (
        ring > 0 &&
        ring < 1 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              border: "0.14em solid currentColor",
              borderRadius: "0.2em",
              opacity: 0.6 * (1 - ring),
              transform: `scale(${1 + ring * 0.38})`,
            }}
          />
        )
      ) : (
        <div
          className="pointer-events-none absolute inset-0 rounded-[0.3em]"
          style={{
            boxShadow: `0 0 0 ${ring * 0.6}em color-mix(in srgb, ${color} ${Math.round((1 - ring) * 30)}%, transparent)`,
          }}
        />
      )}
      {face}
    </div>
  );
}

/** One of the app's sounds on a beat, for a scene's `sounds`. */
export function soundCue(at: number, name: SoundName): SoundCue {
  return { at, play: () => playSound(name) };
}

/** Seconds from a `Stamp` appearing to its impact frame, as the app's stamps and their sound. */
export const STAMP_IMPACT = STAMP_IMPACT_MS / 1000;

/** A fingertip tapping at `at`: a dot presses in and a ring ripples out. Place it with `Place`. */
export function Tap({ at = 0, size = 64 }: { at?: number; size?: number }) {
  const t = useLocalTime();
  const local = t - at;
  if (local < -0.35 || local > 0.9) return null;
  const arrive = progress(t, at - 0.35, 0.3, ease.out);
  const press = local >= 0 && local < 0.12 ? 0.82 : 1;
  const ripple = progress(t, at, 0.6, ease.out);
  const leave = progress(t, at + 0.45, 0.35, ease.in);
  return (
    <div className="pointer-events-none relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full border-[4px] border-ink"
        style={{
          transform: `scale(${1 + ripple * 1.6})`,
          opacity: local >= 0 ? (1 - ripple) * 0.7 : 0,
        }}
      />
      <div
        className="absolute inset-[18%] rounded-full bg-ink shadow-lg"
        style={{
          transform: `scale(${press * mix(1.4, 1, arrive)})`,
          opacity: arrive * (1 - leave) * 0.55,
        }}
      />
    </div>
  );
}

/**
 * A burst of particles flung from the origin at `at`, under gravity, fading as
 * they fall. Deterministic: the same `seed` always throws the same burst.
 */
export function Burst({
  at = 0,
  count = 24,
  colors = ["var(--punch)", "var(--gold)", "var(--teal)"],
  speed = 900,
  gravity = 1400,
  size = 18,
  duration = 1.4,
  spread = 360,
  direction = -90,
  shape = "square",
  seed = 1,
}: {
  at?: number;
  count?: number;
  colors?: readonly string[];
  /** Launch speed in px/s. */
  speed?: number;
  gravity?: number;
  size?: number;
  duration?: number;
  /** Cone width in degrees. */
  spread?: number;
  /** Cone centre in degrees (-90 is straight up). */
  direction?: number;
  shape?: "square" | "circle" | "heart" | "star";
  seed?: number;
}) {
  const t = useLocalTime();
  const local = t - at;
  if (local < 0 || local > duration) return null;
  const glyph = shape === "heart" ? "♥" : shape === "star" ? "★" : null;
  return (
    <div className="pointer-events-none absolute left-0 top-0">
      {Array.from({ length: count }, (_, index) => {
        const r1 = hash01(seed * 97 + index * 13.1);
        const r2 = hash01(seed * 31 + index * 7.7);
        const r3 = hash01(seed * 53 + index * 3.3);
        const angle = ((direction + (r1 - 0.5) * spread) * Math.PI) / 180;
        const velocity = speed * (0.45 + r2 * 0.75);
        const x = Math.cos(angle) * velocity * local;
        const y = Math.sin(angle) * velocity * local + 0.5 * gravity * local * local;
        const fade = 1 - progress(local, duration * 0.55, duration * 0.45);
        const spin = (r3 - 0.5) * 900 * local;
        const particle = size * (0.6 + r3 * 0.8);
        const color = colors[index % colors.length];
        return (
          <div
            key={index}
            className="absolute"
            style={{
              transform: `translate(${x - particle / 2}px, ${y - particle / 2}px) rotate(${spin}deg)`,
              opacity: fade,
              width: particle,
              height: particle,
              color,
              background: glyph ? undefined : color,
              borderRadius: shape === "circle" ? "50%" : glyph ? undefined : "18%",
              fontSize: particle * 1.2,
              lineHeight: 1,
            }}
          >
            {glyph}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where something flying on an arc is at `t`: from (x0, y0) to (x1, y1) over
 * `duration` seconds from `at`, peaking `lift` px above the straight line.
 */
export function flight(
  t: number,
  {
    at,
    duration,
    from,
    to,
    lift = 160,
    easing = ease.inOut,
  }: {
    at: number;
    duration: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
    lift?: number;
    easing?: Easing;
  },
): { x: number; y: number; progress: number } {
  const p = progress(t, at, duration, easing);
  return {
    x: mix(from.x, to.x, p),
    y: mix(from.y, to.y, p) - Math.sin(p * Math.PI) * lift,
    progress: p,
  };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export type WipeKind = "iris" | "slash" | "bars" | "pixels";

/**
 * A full-board transition: it covers the board by `at + duration / 2` (cut
 * there) and uncovers it by `at + duration`. Render it last in a shot.
 */
export function Wipe({
  at,
  duration = 0.8,
  kind = "slash",
  color = "var(--punch)",
  origin = { x: BOARD.width / 2, y: BOARD.height / 2 },
  seed = 7,
}: {
  at: number;
  duration?: number;
  kind?: WipeKind;
  color?: string;
  /** Iris centre, board px. */
  origin?: { x: number; y: number };
  seed?: number;
}) {
  const t = useLocalTime();
  if (t < at || t > at + duration) return null;
  const half = duration / 2;
  const cover = progress(t, at, half, ease.inOut);
  const uncover = progress(t, at + half, half, ease.inOut);
  const layer = "pointer-events-none absolute inset-0 z-50";

  if (kind === "iris") {
    const reach = Math.hypot(BOARD.width, BOARD.height);
    const radius = t < at + half ? cover * reach : (1 - uncover) * reach;
    return (
      <div
        className={layer}
        style={{
          background: color,
          clipPath: `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
        }}
      />
    );
  }

  if (kind === "slash") {
    const width = 2800;
    const position = mix(
      -width - 500,
      BOARD.width + 500,
      t < at + half ? cover * 0.5 : 0.5 + uncover * 0.5,
    );
    return (
      <div className={`${layer} overflow-hidden`}>
        <div
          className="absolute top-[-200px] h-[1480px]"
          style={{
            width,
            left: position,
            background: color,
            transform: "skewX(-18deg)",
          }}
        />
      </div>
    );
  }

  if (kind === "bars") {
    const bars = 6;
    return (
      <div className={`${layer} flex flex-col overflow-hidden`}>
        {Array.from({ length: bars }, (_, index) => {
          const delay = (index / bars) * 0.35;
          const inAmount = progress(t, at + delay * half, half * 0.65, ease.out);
          const outAmount = progress(t, at + half + delay * half, half * 0.65, ease.in);
          const x = t < at + half + delay * half ? (inAmount - 1) * 100 : outAmount * 100;
          return (
            <div
              key={index}
              className="flex-1"
              style={{ background: color, transform: `translateX(${x}%)` }}
            />
          );
        })}
      </div>
    );
  }

  const columns = 16;
  const rows = 9;
  const cell = BOARD.width / columns;
  return (
    <div className={layer}>
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const jitter = hash01(seed * 11 + index * 1.37) * 0.55;
        const on = progress(t, at + jitter * half, half * 0.45);
        const off = progress(t, at + half + jitter * half, half * 0.45);
        const fill = on * (1 - off);
        if (fill <= 0) return null;
        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: column * cell,
              top: row * cell,
              width: cell + 1,
              height: cell + 1,
              background: color,
              transform: `scale(${fill})`,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** The phone mock's screen size in its own px; draw controller UI at this size. */
export const PHONE_SCREEN = { width: 390, height: 844 } as const;
/** The phone mock's bezel around its screen, in its own px. */
export const PHONE_BEZEL = 14;
const PHONE_BODY = {
  width: PHONE_SCREEN.width + PHONE_BEZEL * 2,
  height: PHONE_SCREEN.height + PHONE_BEZEL * 2,
} as const;

/** Where a `PhoneMock` sits on the board: its top-left corner and device width. */
export interface PhoneFrame {
  left: number;
  top: number;
  width: number;
}

/** Board px per screen px for a `PhoneMock` `width` board px wide. */
export function phoneScale(width: number): number {
  return width / PHONE_BODY.width;
}

/** The board height of a `PhoneMock` `width` board px wide. */
export function phoneHeight(width: number): number {
  return PHONE_BODY.height * phoneScale(width);
}

/** The frame of a `PhoneMock` `width` wide centred on board point (x, y). */
export function centredPhone(x: number, y: number, width: number): PhoneFrame {
  return { left: x - width / 2, top: y - phoneHeight(width) / 2, width };
}

/** Where point (u, v) on a `PhoneMock`'s screen (screen px) lands on the board. */
export function phonePoint(phone: PhoneFrame, u: number, v: number): { x: number; y: number } {
  const scale = phoneScale(phone.width);
  return { x: phone.left + (PHONE_BEZEL + u) * scale, y: phone.top + (PHONE_BEZEL + v) * scale };
}

/**
 * A phone to show what players do on theirs. Draw its screen at
 * `PHONE_SCREEN` size as children; `width` scales the whole device.
 * The screen paints the game's canvas colour, so theme tokens read right.
 */
export function PhoneMock({
  width = 360,
  children,
  className = "",
  style,
  glare = true,
}: {
  /** Device width in board px. */
  width?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  glare?: boolean;
}) {
  return (
    <div className={`relative ${className}`} style={{ width, height: phoneHeight(width), ...style }}>
      <div
        className="absolute left-0 top-0 origin-top-left rounded-[68px]"
        style={{
          width: PHONE_BODY.width,
          height: PHONE_BODY.height,
          padding: PHONE_BEZEL,
          transform: `scale(${phoneScale(width)})`,
          background: "linear-gradient(145deg, #3a3744, #121019 45%, #26232f)",
          boxShadow:
            "0 40px 80px -20px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.07) inset, 0 0 0 1px rgba(0,0,0,0.6)",
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[54px] bg-canvas text-ink">
          {children}
          {/* The island. */}
          <div className="absolute left-1/2 top-[12px] z-20 h-[34px] w-[118px] -translate-x-1/2 rounded-full bg-[#050407]" />
          {glare && (
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.05) 100%)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
