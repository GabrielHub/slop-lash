"use client";

import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/room/avatar";
import { useTime } from "@/tutorial/clock";
import { STAMP_IMPACT } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { MATCHSLOP_DATE_LINE, MATCHSLOP_MOOD_THRESHOLD_UNMATCH } from "../types";
import { COPY } from "../ui/copy";
import { MATCH, type Cast } from "./data";
import { C, Heart, alpha, blend, fin } from "./fx";

/**
 * The game's own pieces, redrawn as pure functions of time and sized for the
 * 1920x1080 board: the match's card, prompt cards, ballot cards, bubbles,
 * stamps, player tokens and the heart meter. Their looks follow
 * `src/games/matchslop/ui/`.
 */

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

export type MsTone = "punch" | "win" | "fail" | "ink" | "gold";

export const TONE_VAR: Record<MsTone, string> = {
  punch: "var(--punch)",
  win: "var(--win)",
  fail: "var(--fail)",
  ink: "var(--ink)",
  gold: "var(--gold)",
};

/** Worn rubber, as the app's stamp (`room/moment/stamp.tsx`). */
const WORN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.7 1.75'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E\")";

/**
 * The game's rubber stamp, slamming down at `at` (impact `STAMP_IMPACT`
 * later). `heavy` throws it from higher and harder. `peel` lifts it off.
 */
export function MsStamp({
  text,
  at,
  tone = "punch",
  tilt = -8,
  size = 64,
  heavy = false,
  out,
  peel,
  reserve = false,
  className = "",
  style,
}: {
  text: ReactNode;
  at: number;
  tone?: MsTone;
  tilt?: number;
  /** Font size, px. */
  size?: number;
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
  const t = useTime();
  const placeholder = reserve ? (
    <div className={`invisible relative inline-block ${className}`} style={{ fontSize: size, ...style }}>
      <span
        className="block whitespace-nowrap font-display font-black uppercase leading-none tracking-[0.1em]"
        style={{ padding: "0.42em 0.8em 0.36em", border: "0.14em solid transparent" }}
      >
        {text}
      </span>
    </div>
  ) : null;
  if (t < at) return placeholder;
  const drop = spring(t - at, SPRINGS.slam);
  const scale = mix(heavy ? 3.4 : 2.6, 1, drop);
  const rotate = mix(tilt - (heavy ? 20 : 9), tilt, drop);
  const ring = progress(t, at + STAMP_IMPACT, 0.5, ease.out);
  const leaving = out === undefined ? 0 : progress(t, out, 0.28, ease.in);
  const peeling = peel === undefined ? 0 : progress(t, peel, 0.55, ease.in);
  const color = TONE_VAR[tone];
  const opacity = progress(t, at, 0.06) * (1 - leaving) * (1 - peeling);
  if (opacity <= 0.001) return placeholder;
  return (
    <div
      className={`relative inline-block ${className}`}
      style={{
        color,
        fontSize: size,
        opacity,
        transform: `translate(${peeling * 40}px, ${peeling * 140}px) rotate(${rotate + peeling * 28}deg) scale(${scale * (1 - leaving * 0.12)})`,
        ...style,
      }}
    >
      <span
        className="block whitespace-nowrap font-display font-black uppercase leading-none tracking-[0.1em]"
        style={{
          padding: "0.42em 0.8em 0.36em",
          border: "0.14em solid currentColor",
          borderRadius: "0.2em",
          outline: "0.045em solid currentColor",
          outlineOffset: "-0.3em",
          background: "color-mix(in srgb, currentColor 13%, var(--surface))",
          maskImage: WORN,
          WebkitMaskImage: WORN,
          maskSize: "180px 180px",
          WebkitMaskSize: "180px 180px",
        }}
      >
        {text}
      </span>
      {ring > 0 && ring < 1 && (
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** Three dots bobbing as someone types (the app's `ms-typing-dot`, as a function of time). */
export function Dots({ size = 14, className = "text-ink-dim" }: { size?: number; className?: string }) {
  const t = useTime();
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: size * 0.7 }}>
      {[0, 1, 2].map((index) => {
        const p = ((((t - index * 0.2) / 1.4) % 1) + 1) % 1;
        const bump = ease.inOutSine(p < 0.3 ? p / 0.3 : p < 0.6 ? (0.6 - p) / 0.3 : 0);
        return (
          <span
            key={index}
            className="rounded-full bg-current"
            style={{
              width: size,
              height: size,
              opacity: 0.3 + 0.7 * bump,
              transform: `translateY(${-45 * bump}%)`,
            }}
          />
        );
      })}
    </span>
  );
}

/** A player token: their `Avatar`, ringed so it reads over anything. */
export function Token({
  who,
  size = 72,
  ai = false,
  className = "",
  style,
}: {
  who: Cast;
  size?: number;
  /** Adds the "AI" tag. */
  ai?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size, ...style }}>
      <div
        className="rounded-full"
        style={{
          boxShadow: `0 0 0 ${Math.max(3, size * 0.06)}px var(--surface), 0 ${size * 0.16}px ${size * 0.4}px -${size * 0.12}px rgba(0,0,0,0.5)`,
        }}
      >
        <Avatar name={who.name} modelId={who.modelId} size={`${size}px`} />
      </div>
      {ai && (
        <span
          className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-[35%] rounded-full bg-ai px-[0.5em] py-[0.08em] font-display font-black leading-none text-accent-ink"
          style={{ fontSize: Math.max(16, size * 0.26) }}
        >
          AI
        </span>
      )}
    </div>
  );
}

/** A check that pops: the app's completion mark. */
export function CheckBadge({ size = 30, at, className = "" }: { size?: number; at: number; className?: string }) {
  const t = useTime();
  if (t < at) return null;
  const pop = spring(t - at, SPRINGS.pop);
  return (
    <span
      className={`grid place-items-center rounded-full bg-win text-accent-ink ${className}`}
      style={{
        width: size,
        height: size,
        transform: `scale(${pop})`,
        boxShadow: "0 0 0 3px var(--surface)",
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.7} height={size * 0.7} fill="none" aria-hidden="true">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth={3.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** A padlock glyph. */
export function Lock({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor" />
      <path
        d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The match
// ---------------------------------------------------------------------------

const FACE_GRADIENT = `linear-gradient(140deg, ${C.coral}, ${C.rose} 52%, ${C.violet})`;

/** The match's face before a portrait exists: their initial in a gradient circle. */
export function MatchFace({ size, blur = 0 }: { size: number; blur?: number }) {
  const sharp = 1 - clamp(blur);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* The blurred stand-in: a soft glow, no filter. */}
      {sharp < 1 && (
        <div
          className="absolute rounded-full"
          style={{
            inset: -size * 0.18,
            opacity: 1 - sharp,
            background: `radial-gradient(circle, ${alpha(C.rose, 85)} 0%, ${alpha(C.coral, 55)} 34%, ${alpha(C.violet, 22)} 55%, transparent 70%)`,
          }}
        />
      )}
      <div
        className="absolute inset-0 grid place-items-center rounded-full"
        style={{
          opacity: sharp,
          transform: `scale(${mix(1.12, 1, sharp)})`,
          background: FACE_GRADIENT,
          boxShadow: `0 0 0 ${size * 0.03}px ${alpha(C.surface, 80)}, 0 ${size * 0.08}px ${size * 0.2}px -${size * 0.05}px ${alpha(C.rose, 50)}`,
        }}
      >
        <span
          className="font-display font-black leading-none text-accent-ink"
          style={{ fontSize: size * 0.56, transform: `translateY(${size * -0.02}px)` }}
        >
          {MATCH.name[0]}
        </span>
      </div>
    </div>
  );
}

/**
 * The match's swipe card. `blur` 1 is the lobby's "Tonight's match" tease;
 * the name types on with `named` (0..1), then the place and tagline.
 */
export function MatchCard({
  blur,
  named,
  placed,
  tagged,
  children,
}: {
  blur: number;
  named: number;
  placed: number;
  tagged: number;
  /** Drawn over the card (badges, stamps). */
  children?: ReactNode;
}) {
  const title = `${MATCH.name}, ${MATCH.age}`;
  const shown = Math.floor(clamp(named) * title.length);
  const tease = 1 - clamp(named * 3);
  return (
    <div
      className="relative overflow-hidden rounded-[48px] border-2 border-edge bg-surface"
      style={{
        width: 500,
        height: 660,
        boxShadow: `0 50px 90px -40px rgba(0,0,0,0.6), 0 0 0 1px ${alpha(C.rose, 10)}`,
      }}
    >
      <div
        className="relative grid h-[380px] place-items-center"
        style={{
          background: `radial-gradient(120% 90% at 30% 10%, ${alpha(C.rose, 22)}, transparent 60%), radial-gradient(100% 90% at 90% 100%, ${alpha(C.violet, 22)}, transparent 60%), var(--raised)`,
        }}
      >
        <MatchFace size={236} blur={blur} />
        <span className="absolute right-[26px] top-[26px] rounded-full bg-ai px-[16px] py-[6px] font-display text-[28px] font-black leading-none text-accent-ink">
          AI
        </span>
      </div>
      <div className="relative px-[38px] pt-[26px]">
        {tease > 0.01 && (
          <div className="absolute left-[38px] top-[30px]" style={{ opacity: tease }}>
            <p className="font-sans text-[28px] font-bold uppercase tracking-[0.18em] text-ink-dim">
              {COPY.tonightsMatch}
            </p>
            <div className="mt-[22px]">
              <Dots size={16} className="text-punch" />
            </div>
          </div>
        )}
        <p className="h-[72px] font-display text-[64px] font-black leading-none text-ink">
          {title.slice(0, shown)}
        </p>
        <p
          className="mt-[10px] font-sans text-[32px] font-semibold text-ink-dim"
          style={{ opacity: placed, transform: `translateY(${(1 - placed) * 10}px)` }}
        >
          <span className="text-punch">●</span> {MATCH.place}
        </p>
        <p
          className="mt-[12px] font-sans text-[30px] italic leading-[1.25] text-ink"
          style={{ opacity: tagged, transform: `translateY(${(1 - tagged) * 10}px)` }}
        >
          “{MATCH.tagline}”
        </p>
      </div>
      {children}
    </div>
  );
}

/** One of the match's profile prompts, with an optional highlighter sweep over `mark`. */
export function PromptCard({
  prompt,
  answer,
  mark,
  marked = 0,
  width = 820,
  selected = 0,
  className = "",
  style,
}: {
  prompt: string;
  answer: string;
  mark?: readonly [number, number];
  /** 0..1, the highlighter's sweep. */
  marked?: number;
  width?: number;
  /** 0..1, the picked state (rose border). */
  selected?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [from, to] = mark ?? [0, 0];
  return (
    <div
      className={`rounded-[32px] border-[3px] bg-surface px-[36px] py-[26px] ${className}`}
      style={{
        width,
        borderColor: blend("var(--edge)", C.rose, selected),
        background: blend("var(--surface)", `color-mix(in srgb, ${C.rose} 10%, var(--surface))`, selected),
        boxShadow: "0 30px 60px -36px rgba(0,0,0,0.55)",
        ...style,
      }}
    >
      <p className="font-sans text-[30px] font-bold leading-tight text-punch">{prompt}</p>
      <p className="mt-[8px] font-display text-[44px] font-bold leading-[1.18] text-ink">
        {answer.slice(0, from)}
        <span
          style={{
            backgroundImage: `linear-gradient(${alpha(C.rose, 34)}, ${alpha(C.rose, 34)})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "0 88%",
            backgroundSize: `${clamp(marked) * 100}% 42%`,
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {answer.slice(from, to)}
        </span>
        {answer.slice(to)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ballot and chat
// ---------------------------------------------------------------------------

/** A ballot card as the TV shows it: full text, a letter badge overhanging its corner. */
export function BallotCard({
  letter,
  text,
  width,
  height,
  size = 38,
  badge,
  crowned = 0,
  dim = 0,
  children,
  style,
}: {
  letter: string;
  text: string;
  width: number;
  height: number;
  size?: number;
  /** Replaces the letter (an author's face). */
  badge?: ReactNode;
  /** 0..1, the winner's rose ring. */
  crowned?: number;
  dim?: number;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="relative rounded-[36px] border-2 bg-surface"
      style={{
        width,
        height,
        borderColor: blend("var(--edge)", C.rose, crowned),
        boxShadow: `0 0 0 ${crowned * 6}px ${alpha(C.rose, 100 * crowned)}, 0 0 ${crowned * 50}px ${alpha(C.rose, 40 * crowned)}, 0 34px 60px -36px rgba(0,0,0,0.55)`,
        ...style,
      }}
    >
      <p
        className="px-[40px] pt-[30px] font-sans font-medium leading-[1.25] text-ink"
        style={{ fontSize: size, opacity: 1 - dim * 0.6 }}
      >
        {text}
      </p>
      <div className="absolute -left-[24px] -top-[24px]">
        {badge ?? (
          <span className="grid size-[64px] place-items-center rounded-full border-2 border-edge bg-raised font-display text-[34px] font-black leading-none text-ink">
            {letter}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Our bubble: right, rose. */
export function OurBubble({
  children,
  size = 40,
  className = "",
  style,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative rounded-[46px] rounded-br-[12px] bg-punch px-[36px] py-[22px] font-sans font-medium leading-[1.25] text-accent-ink ${className}`}
      style={{ fontSize: size, boxShadow: `0 24px 50px -28px ${alpha(C.rose, 80)}`, ...style }}
    >
      {children}
    </div>
  );
}

/** Their bubble: left, surface. */
export function HerBubble({
  children,
  size = 40,
  className = "",
  style,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative rounded-[46px] rounded-bl-[12px] border-2 border-edge bg-surface px-[36px] py-[22px] font-sans font-medium leading-[1.25] text-ink ${className}`}
      style={{ fontSize: size, boxShadow: "0 24px 50px -30px rgba(0,0,0,0.5)", ...style }}
    >
      {children}
    </div>
  );
}

/** A reaction face on the corner of our bubble (the app's `Tapback`). */
export function Tapback({ emoji, size = 76, pop = 1 }: { emoji: string; size?: number; pop?: number }) {
  return (
    <span
      className="grid place-items-center rounded-full border-2 border-edge bg-surface leading-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        transform: `scale(${pop})`,
        boxShadow: "0 14px 30px -14px rgba(0,0,0,0.6)",
      }}
    >
      {emoji}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The heart meter
// ---------------------------------------------------------------------------

/** The fill's colour for `mood`: rose, red at or under the unmatch line, mint at the date line. */
export function moodColor(mood: number): string {
  const red = clamp((MATCHSLOP_MOOD_THRESHOLD_UNMATCH + 3 - mood) / 3);
  const mint = clamp((mood - (MATCHSLOP_DATE_LINE - 3)) / 3);
  return blend(blend(C.rose, C.red, red), C.mint, mint);
}

/**
 * The heart meter (`strip.tsx` HeartMeter), big: a track with an Unmatch line
 * at 20 and a Date line at 80, a fill, and a heart marker holding the number.
 * `drawn` (0..1) draws the track in; `lines` (0..1 each) pop the two lines.
 */
export function Meter({
  mood,
  width = 1400,
  drawn = 1,
  lines = [1, 1],
  marker = 1,
  pulse = [0, 0],
  glow = 0,
}: {
  mood: number;
  width?: number;
  drawn?: number;
  lines?: readonly [number, number];
  marker?: number;
  /** 0..1 pulses on the unmatch and date lines. */
  pulse?: readonly [number, number];
  /** 0..1 extra glow on the fill. */
  glow?: number;
}) {
  const value = clamp(mood, 0, 100);
  const color = moodColor(value);
  const track = 64;
  const lineDefs = [
    { at: MATCHSLOP_MOOD_THRESHOLD_UNMATCH, label: COPY.unmatchLabel, tone: "text-fail", bar: "bg-fail" },
    { at: MATCHSLOP_DATE_LINE, label: COPY.dateLabel, tone: "text-win", bar: "bg-win" },
  ] as const;
  return (
    <div className="relative" style={{ width, height: 220 }}>
      <div
        className="absolute inset-x-0 top-[78px] origin-left overflow-hidden rounded-full bg-raised"
        style={{
          height: track,
          transform: `scaleX(${clamp(drawn)})`,
          opacity: fin(drawn, 0, 0.2),
          boxShadow: "inset 0 0 0 3px var(--edge-strong), inset 0 6px 14px rgba(0,0,0,0.25)",
        }}
      >
        <span className="absolute inset-y-0 left-0 w-[20%] bg-fail/15" />
        <span className="absolute inset-y-0 right-0 w-[20%] bg-win/15" />
        <span
          className="absolute inset-y-[6px] left-[6px] rounded-full"
          style={{
            width: `calc(${value}% - 12px)`,
            minWidth: value > 0.5 ? 28 : 0,
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} 70%, var(--ms-ink)), ${color} 55%)`,
            boxShadow: `0 0 ${20 + glow * 40}px ${alpha(color, 70 + glow * 30)}`,
          }}
        />
      </div>
      {lineDefs.map((line, index) => {
        const shown = clamp(lines[index]);
        if (shown <= 0) return null;
        const beat = pulse[index];
        return (
          <div
            key={line.label}
            className="absolute top-[52px] flex flex-col items-center"
            style={{
              left: `${line.at}%`,
              opacity: clamp(shown * 4),
              transform: `translateX(-50%) scale(${shown})`,
            }}
          >
            <span
              className={`block rounded-full ${line.bar}`}
              style={{
                width: 10,
                height: 116,
                transform: `scaleX(${1 + beat * 0.8}) scaleY(${1 + beat * 0.25})`,
                boxShadow: beat > 0 ? `0 0 ${30 * beat}px currentColor` : undefined,
              }}
            />
            <span
              className={`mt-[6px] whitespace-nowrap font-display text-[36px] font-black uppercase tracking-[0.08em] ${line.tone}`}
              style={{ transform: `scale(${1 + beat * 0.25})` }}
            >
              {line.label} · {line.at}
            </span>
          </div>
        );
      })}
      {marker > 0 && (
        <div
          className="absolute top-[110px]"
          style={{
            left: `${value}%`,
            transform: `translate(-50%, -50%) scale(${marker})`,
            opacity: clamp(marker * 3),
          }}
        >
          <div className="relative grid size-[150px] place-items-center">
            <Heart
              size={150}
              color={color}
              className="absolute inset-0"
              style={{ filter: `drop-shadow(0 8px 18px rgba(0,0,0,0.4)) drop-shadow(0 0 ${12 + glow * 26}px ${alpha(color, 60)})` }}
            />
            <span className="relative -mt-[12px] font-mono text-[50px] font-bold tabular-nums text-accent-ink">
              {Math.round(value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
