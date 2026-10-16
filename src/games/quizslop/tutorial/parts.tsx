"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCues, useLocalTime, useTime } from "@/tutorial/clock";
import { BOARD } from "@/tutorial/kit";
import { getPlayerColor } from "@/lib/player-colors";
import { clamp, ease, hash01, mix, progress, wobble } from "@/tutorial/timeline";
import { PLAYER_COLOR, type PlayerName } from "./content";

/**
 * QuizSlop's "On-Air Studio" props for the tutorial: marquee bulbs, the ON AIR
 * light, spotlights, the stage curtain, bet chips, player tokens and answer
 * tiles. Each is a pure function of the time it is given or reads.
 */

// ---------------------------------------------------------------------------
// Shot time
// ---------------------------------------------------------------------------

/**
 * The voice cues in the enclosing `Sequence`'s local seconds, so a shot keys
 * every beat on what is said and follows the recording when it re-times.
 */
export function useShot() {
  const cues = useCues();
  const t = useLocalTime();
  const origin = useTime() - t;
  return {
    t,
    at: (id: string, offset = 0) => cues.at(id, offset) - origin,
    end: (id: string, offset = 0) => cues.end(id, offset) - origin,
    word: (id: string, word: string, nth?: number) => cues.word(id, word, nth) - origin,
    wordEnd: (id: string, word: string, nth?: number) => cues.wordEnd(id, word, nth) - origin,
    duration: cues.duration - origin,
  };
}

export type Shot = ReturnType<typeof useShot>;

/** Absolutely positions children with their centre (or top-left) on a board point. */
export function At({
  x,
  y,
  children,
  className = "",
  style,
  corner = false,
}: {
  x: number;
  y: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Anchor the top-left corner instead of the centre. */
  corner?: boolean;
}) {
  return (
    <div
      className={`absolute ${className}`}
      style={{
        left: x,
        top: y,
        transform: corner ? undefined : "translate(-50%, -50%)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marquee bulbs
// ---------------------------------------------------------------------------

/** A warm bulb in both themes: a fixed art colour, like a real marquee lamp. */
const BULB_LIT = "#ffd25e";
const BULB_GLOW = "255, 196, 64";

/** `count` points spaced evenly around a rounded rectangle, clockwise from the top-left corner. */
function outline(width: number, height: number, radius: number, count: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const sx = width - 2 * r;
  const sy = height - 2 * r;
  const arc = (Math.PI / 2) * r;
  const corner = (cx: number, cy: number, from: number, u: number) => {
    const angle = ((from + (u / Math.max(arc, 0.001)) * 90) * Math.PI) / 180;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };
  const segments: { length: number; at: (u: number) => { x: number; y: number } }[] = [
    { length: sx, at: (u) => ({ x: r + u, y: 0 }) },
    { length: arc, at: (u) => corner(width - r, r, -90, u) },
    { length: sy, at: (u) => ({ x: width, y: r + u }) },
    { length: arc, at: (u) => corner(width - r, height - r, 0, u) },
    { length: sx, at: (u) => ({ x: width - r - u, y: height }) },
    { length: arc, at: (u) => corner(r, height - r, 90, u) },
    { length: sy, at: (u) => ({ x: 0, y: height - r - u }) },
    { length: arc, at: (u) => corner(r, r, 180, u) },
  ];
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  return Array.from({ length: count }, (_, index) => {
    let s = ((index + 0.5) / count) * total;
    for (const segment of segments) {
      if (s <= segment.length) return segment.at(s);
      s -= segment.length;
    }
    return segments[0].at(0);
  });
}

function perimeter(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  return 2 * (width - 2 * r) + 2 * (height - 2 * r) + 2 * Math.PI * r;
}

/** One bulb's look at brightness `lit` (0 dark, 1 full). */
function bulbStyle(x: number, y: number, size: number, lit: number): CSSProperties {
  const glow = clamp(lit);
  return {
    left: x - size / 2,
    top: y - size / 2,
    width: size,
    height: size,
    background: `radial-gradient(circle at 38% 34%, color-mix(in srgb, #fffbea ${Math.round(glow * 100)}%, transparent) 0 22%, transparent 48%), color-mix(in srgb, ${BULB_LIT} ${Math.round(8 + glow * 92)}%, var(--edge-strong))`,
    boxShadow: `0 0 ${size * (0.5 + glow * 1.1)}px ${size * 0.3 * glow}px rgba(${BULB_GLOW}, ${(0.8 * glow).toFixed(3)}), inset 0 0 0 ${Math.max(1.5, size * 0.1)}px rgba(120, 72, 0, ${(0.35 - glow * 0.15).toFixed(3)})`,
  };
}

export interface BulbLight {
  /** 0 to 1: bulbs switch on in turn around the frame as this rises. */
  power?: number;
  /** Chase speed in cycles a second. */
  chase?: number;
  /** 0 to 1: every bulb blazes, for a hit. */
  flash?: number;
}

/** The brightness of bulb `index` of `count` at time `t`: a three-phase theatre chase. */
export function bulbLevel(
  t: number,
  index: number,
  count: number,
  { power = 1, chase = 1.4, flash = 0 }: BulbLight,
): number {
  const powered = clamp(power * count * 1.04 - index);
  const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * (index / 3 - t * chase));
  return powered * Math.max(flash, 0.14 + 0.86 * wave ** 2.4);
}

/** Bulbs around a rounded rectangle of `width` x `height`, drawn from its top-left corner. */
export function BulbRing({
  width,
  height,
  radius = 40,
  spacing = 46,
  size = 18,
  ...light
}: {
  width: number;
  height: number;
  radius?: number;
  spacing?: number;
  size?: number;
} & BulbLight) {
  const t = useLocalTime();
  const count = Math.max(8, Math.round(perimeter(width, height, radius) / spacing));
  const points = outline(width, height, radius, count);
  return (
    <div className="pointer-events-none absolute left-0 top-0">
      {points.map((point, index) => (
        <span
          key={index}
          className="absolute rounded-full"
          style={bulbStyle(point.x, point.y, size, bulbLevel(t, index, count, light))}
        />
      ))}
    </div>
  );
}

/** A straight row of bulbs, `length` px long. */
export function BulbRow({
  length,
  spacing = 46,
  size = 16,
  ...light
}: { length: number; spacing?: number; size?: number } & BulbLight) {
  const t = useLocalTime();
  const count = Math.max(2, Math.round(length / spacing));
  return (
    <div className="pointer-events-none absolute left-0 top-0">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="absolute rounded-full"
          style={bulbStyle(
            ((index + 0.5) / count) * length,
            0,
            size,
            bulbLevel(t, index, count, light),
          )}
        />
      ))}
    </div>
  );
}

/**
 * A marquee sign: a raised frame lined with chasing bulbs around an inner
 * panel. Children sit centred on the panel.
 */
export function MarqueeSign({
  width,
  height,
  radius = 48,
  band = 46,
  bulb = 18,
  spacing = 46,
  children,
  className = "",
  ...light
}: {
  width: number;
  height: number;
  radius?: number;
  /** Width of the bulb band around the panel. */
  band?: number;
  bulb?: number;
  spacing?: number;
  children?: ReactNode;
  className?: string;
} & BulbLight) {
  const inner = radius - band / 2;
  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <div
        className="absolute inset-0 border-[4px] border-gold"
        style={{
          borderRadius: radius,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--gold) 20%, var(--raised)), color-mix(in srgb, var(--gold) 8%, var(--surface)))",
          boxShadow:
            "0 30px 60px -24px rgba(0,0,0,0.45), inset 0 2px 0 color-mix(in srgb, var(--gold) 35%, transparent)",
        }}
      />
      <div
        className="absolute border-[3px] bg-surface"
        style={{
          inset: band,
          borderRadius: Math.max(12, radius - band * 0.7),
          borderColor: "color-mix(in srgb, var(--gold) 55%, transparent)",
          boxShadow: "inset 0 10px 30px -12px rgba(0,0,0,0.25)",
        }}
      />
      <div className="absolute" style={{ left: band / 2, top: band / 2 }}>
        <BulbRing
          width={width - band}
          height={height - band}
          radius={Math.max(8, inner + band / 4)}
          spacing={spacing}
          size={bulb}
          {...light}
        />
      </div>
      <div className="absolute grid place-items-center" style={{ inset: band }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ON AIR light, spotlights
// ---------------------------------------------------------------------------

/** The studio's ON AIR light at brightness `lit` (0 off, 1 on). */
export function OnAirSign({ lit, size = 64 }: { lit: number; size?: number }) {
  const on = clamp(lit);
  return (
    <div
      className="flex items-center gap-[0.32em] whitespace-nowrap rounded-[0.32em] border-[0.09em] px-[0.5em] py-[0.12em] font-display font-black leading-none tracking-[0.14em]"
      style={{
        fontSize: size,
        borderColor: `color-mix(in srgb, var(--punch) ${Math.round(45 + on * 55)}%, var(--edge-strong))`,
        background: `color-mix(in srgb, var(--punch) ${Math.round(on * 100)}%, var(--surface))`,
        color: on > 0.5 ? "var(--accent-ink)" : "color-mix(in srgb, var(--punch) 50%, var(--surface))",
        boxShadow: `0 0 ${size * 0.9 * on}px ${size * 0.18 * on}px color-mix(in srgb, var(--punch) ${Math.round(on * 55)}%, transparent), inset 0 -0.06em 0 rgba(0,0,0,0.18)`,
      }}
    >
      <span
        className="inline-block size-[0.36em] rounded-full"
        style={{
          background: on > 0.5 ? "var(--accent-ink)" : "color-mix(in srgb, var(--punch) 40%, var(--surface))",
        }}
      />
      ON AIR
    </div>
  );
}

/**
 * A stage light hanging at board point (x, y), its beam pointing straight
 * down at `angle` 0 and swinging clockwise for positive angles.
 */
export function Spotlight({
  x,
  y,
  angle,
  length = 1500,
  spread = 560,
  strength = 1,
}: {
  x: number;
  y: number;
  angle: number;
  length?: number;
  /** Beam width where it ends, px. */
  spread?: number;
  strength?: number;
}) {
  if (strength <= 0.01) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: x - spread / 2,
        top: y,
        width: spread,
        height: length,
        transformOrigin: "50% 0",
        transform: `rotate(${angle}deg)`,
        opacity: clamp(strength),
        clipPath: "polygon(47% 0, 53% 0, 100% 100%, 0 100%)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--gold) 52%, transparent) 0%, color-mix(in srgb, var(--gold) 20%, transparent) 55%, transparent 100%)",
        maskImage:
          "linear-gradient(90deg, transparent 0%, black 30%, black 70%, transparent 100%)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The stage curtain (the chapter transition)
// ---------------------------------------------------------------------------

const VELVET = "color-mix(in srgb, var(--punch) 62%, #2a0510)";
const FOLDS =
  "repeating-linear-gradient(90deg, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.04) 38px, rgba(255,255,255,0.13) 66px, rgba(0,0,0,0.04) 92px, rgba(0,0,0,0.32) 132px)";

/** How far the curtain covers the board at `t`, 0 open to 1 shut, for a close centred on `at`. */
export function curtainCover(t: number, at: number) {
  const close = progress(t, at - 0.5, 0.42, ease.inOut);
  const open = progress(t, at + 0.12, 0.58, ease.inOut);
  return close * (1 - open);
}

/**
 * The studio curtain: two velvet drapes swing shut under a bulb-lit valance,
 * a plaque names the next chapter, and they part on the new shot. Fully shut
 * from about `at - 0.08` to `at + 0.12` (local seconds).
 */
export function Curtain({ at, label }: { at: number; label: string }) {
  const t = useLocalTime();
  if (t < at - 0.55 || t > at + 0.75) return null;
  const cover = curtainCover(t, at);
  // The drapes' hems trail their leading edges, so they swing rather than slide.
  const closing = t < at;
  const sway = closing ? -(1 - cover) * 6 : (1 - cover) * 6;
  const valance = progress(t, at - 0.55, 0.3, ease.out) * (1 - progress(t, at + 0.4, 0.35, ease.in));
  const plaque = progress(t, at - 0.16, 0.22, ease.outBack) * (1 - progress(t, at + 0.1, 0.16, ease.in));
  const drape = (side: "left" | "right") => {
    const sign = side === "left" ? -1 : 1;
    return (
      <div
        className="absolute top-0 h-full"
        style={{
          width: BOARD.width / 2 + 60,
          [side]: 0,
          transform: `translateX(${sign * (1 - cover) * 104}%) skewX(${sign * sway}deg)`,
          transformOrigin: "50% 0",
          background: `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.3)), ${FOLDS}, ${VELVET}`,
          boxShadow: `${sign * -24}px 0 50px rgba(0,0,0,0.35)`,
        }}
      />
    );
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {drape("left")}
      {drape("right")}
      <div
        className="absolute inset-x-0 top-0 h-[120px]"
        style={{
          transform: `translateY(${(valance - 1) * 140}px)`,
          background: `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0) 60%), ${VELVET}`,
          borderBottom: "6px solid var(--gold)",
          boxShadow: "0 18px 30px -10px rgba(0,0,0,0.45)",
        }}
      >
        <div className="absolute left-[40px] top-[62px]">
          <BulbRow length={BOARD.width - 80} spacing={64} size={18} chase={2.2} />
        </div>
      </div>
      {plaque > 0.01 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%, -50%) scale(${mix(0.6, 1, plaque)})`, opacity: clamp(plaque * 1.4) }}
        >
          <div
            className="rounded-[28px] border-[5px] border-gold bg-surface px-[60px] py-[18px] font-display text-[84px] font-black uppercase leading-none tracking-[0.1em] text-gold qs-marquee-text"
            style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)" }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bet chips, player tokens
// ---------------------------------------------------------------------------

/** Chip stripes and lettering: casino cream, a fixed art colour. */
const CREAM = "#f6efe0";

/** A casino chip with "BET" on its face. `spent` (0 to 1) greys it out. */
export function Chip({
  size = 120,
  spent = 0,
  label = "BET",
  spin = 0,
}: {
  size?: number;
  spent?: number;
  label?: string;
  /** Degrees the stripes have turned. */
  spin?: number;
}) {
  const body = `color-mix(in srgb, var(--edge-strong) ${Math.round(spent * 100)}%, var(--punch))`;
  const stripe = `color-mix(in srgb, var(--raised) ${Math.round(spent * 100)}%, ${CREAM})`;
  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        background: `repeating-conic-gradient(from ${spin}deg, ${body} 0deg 30deg, ${stripe} 30deg 45deg)`,
        boxShadow: `0 ${size * 0.06}px 0 color-mix(in srgb, ${body} 60%, #1a0710), 0 ${size * 0.16}px ${size * 0.22}px -${size * 0.06}px rgba(0,0,0,0.45)`,
      }}
    >
      <div
        className="absolute grid place-items-center rounded-full font-display font-black leading-none tracking-[0.04em]"
        style={{
          inset: size * 0.15,
          background: body,
          border: `${Math.max(2, size * 0.025)}px dashed ${stripe}`,
          color: stripe,
          fontSize: size * 0.22,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** A player's token colour: the invented cast's fixed colours, the real avatar's for anyone else. */
export function tokenColor(name: string, ai = false): string {
  if (ai) return "var(--ai-badge)";
  return PLAYER_COLOR[name as PlayerName] ?? getPlayerColor(name);
}

/** A round player token in the real avatar's style: the initial in the player's colour. */
export function Token({
  name,
  size,
  ai = false,
  className = "",
  style,
  ring,
}: {
  name: string;
  size: number;
  ai?: boolean;
  className?: string;
  style?: CSSProperties;
  /** An outer ring colour, e.g. "var(--fail)" for a wrong pick. */
  ring?: string;
}) {
  const color = tokenColor(name, ai);
  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 select-none items-center justify-center rounded-full font-display font-extrabold leading-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        color,
        background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
        boxShadow: `inset 0 0 0 ${size * 0.045}px color-mix(in srgb, ${color} 45%, transparent)${
          ring ? `, 0 0 0 ${Math.max(3, size * 0.06)}px ${ring}` : ""
        }`,
        ...style,
      }}
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
      {ai && (
        <span
          className="absolute -bottom-[8%] -right-[14%] rounded-full bg-ai px-[0.3em] font-sans font-bold leading-[1.3] text-accent-ink"
          style={{ fontSize: Math.max(12, size * 0.22) }}
        >
          AI
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Answer tiles
// ---------------------------------------------------------------------------

export type TileState = "idle" | "lit" | "dim";

/** The TV's answer tile: a letter square and the choice, lit green when it's the key. */
export function Tile({
  letter,
  text,
  width,
  height = 116,
  state = "idle",
  font = 42,
  children,
}: {
  letter: string;
  text: string;
  width: number;
  height?: number;
  state?: TileState;
  font?: number;
  children?: ReactNode;
}) {
  const lit = state === "lit";
  const dim = state === "dim";
  return (
    <div
      className={`relative flex items-center gap-[22px] rounded-[26px] border-[3px] px-[18px] ${
        lit ? "border-win bg-win-soft" : "border-edge bg-surface"
      }`}
      style={{
        width,
        height,
        boxShadow: lit
          ? "0 0 0 6px color-mix(in srgb, var(--win) 22%, transparent), 0 24px 50px -24px color-mix(in srgb, var(--win) 60%, transparent)"
          : "0 18px 40px -26px rgba(0,0,0,0.5)",
      }}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-[18px] font-display font-black ${
          lit ? "bg-win text-accent-ink" : dim ? "bg-raised text-ink-dim" : "bg-raised text-ink"
        }`}
        style={{ width: height - 44, height: height - 44, fontSize: font * 0.95 }}
      >
        {letter}
      </span>
      <span
        className={`font-semibold leading-tight ${dim ? "text-ink-dim" : "text-ink"}`}
        style={{ fontSize: font }}
      >
        {text}
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Judges: the deadpan crowd
// ---------------------------------------------------------------------------

/**
 * A friend's head peeking up to judge: their token colour, two eyes that can
 * look sideways (`look` -1 to 1) and lids that drop (`lid` 0 open to 1 shut).
 */
export function JudgeHead({
  name,
  size,
  look,
  lid,
}: {
  name: PlayerName;
  size: number;
  look: number;
  lid: number;
}) {
  const color = PLAYER_COLOR[name];
  const eye = size * 0.27;
  const pupil = eye * 0.5;
  const eyeBox = (side: -1 | 1) => (
    <span
      className="absolute overflow-hidden rounded-full"
      style={{
        width: eye,
        height: eye * 1.12,
        left: size / 2 + side * size * 0.17 - eye / 2,
        top: size * 0.3,
        background: "#fbf8f1",
        boxShadow: `0 0 0 ${size * 0.02}px rgba(0,0,0,0.25)`,
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          width: pupil,
          height: pupil,
          left: eye / 2 - pupil / 2 + look * (eye / 2 - pupil / 2 - 1),
          top: eye * 0.56 - pupil / 2,
          background: "#17122c",
        }}
      />
      <span
        className="absolute inset-x-0 top-0"
        style={{
          height: `${clamp(lid) * 100}%`,
          background: `color-mix(in srgb, ${color} 70%, #1b1530)`,
          borderBottom: lid > 0.05 ? `${Math.max(2, size * 0.025)}px solid rgba(0,0,0,0.45)` : undefined,
        }}
      />
    </span>
  );
  return (
    <span
      aria-hidden="true"
      className="relative block rounded-full"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 72%, var(--surface))`,
        boxShadow: `inset 0 -${size * 0.08}px 0 rgba(0,0,0,0.18), 0 0 0 ${size * 0.04}px color-mix(in srgb, ${color} 50%, var(--surface))`,
      }}
    >
      {eyeBox(-1)}
      {eyeBox(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** The TV's own screen size in its px; draw stage UI at this size inside `TvFrame`. */
export const TV_SCREEN = { width: 1280, height: 720 } as const;

/** A flat-screen TV with the stage UI on it. `width` is the whole set in board px. */
export function TvFrame({
  width,
  children,
  className = "",
  style,
}: {
  width: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const bezel = 22;
  const body = { width: TV_SCREEN.width + bezel * 2, height: TV_SCREEN.height + bezel * 2 };
  const scale = width / body.width;
  return (
    <div className={`relative ${className}`} style={{ width, height: body.height * scale + 40 * scale, ...style }}>
      <div
        className="absolute left-0 top-0 origin-top-left rounded-[30px] p-[22px]"
        style={{
          width: body.width,
          height: body.height,
          transform: `scale(${scale})`,
          background: "linear-gradient(160deg, #3a3744, #121019 40%, #1d1a26)",
          boxShadow:
            "0 50px 90px -30px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(0,0,0,0.6)",
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-canvas text-ink">
          {children}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 75%, rgba(255,255,255,0.04) 100%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Where a point on a `PhoneMock` screen (screen px) lands on the board, for a phone at `left, top` of `width`. */
export function phonePoint(
  phone: { left: number; top: number; width: number },
  u: number,
  v: number,
) {
  const scale = phone.width / 418;
  return { x: phone.left + (14 + u) * scale, y: phone.top + (14 + v) * scale };
}

// ---------------------------------------------------------------------------
// Little helpers
// ---------------------------------------------------------------------------

/** A gentle idle drift so held elements never sit dead still. */
export function drift(t: number, seed: number, amount = 6) {
  return { x: wobble(t * 0.6, seed) * amount, y: wobble(t * 0.5, seed + 9) * amount };
}

/** A repeatable value in [min, max) for confetti and scatter. */
export function scatter(seed: number, min: number, max: number) {
  return mix(min, max, hash01(seed));
}
