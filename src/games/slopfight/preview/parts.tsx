"use client";

import { memo, type CSSProperties } from "react";
import { SPRINGS, clamp, ease, hash01, progress, spring } from "@/tutorial/timeline";
import { FACE, FREDOKA, INK, NIGHT, StarBurst, TOY } from "../tutorial/look";
import { ToyArt, type ToyKind } from "../tutorial/toys";

// Pieces the spot's shots share. The spot keeps the tutorial's fixed
// fight-night palette in both themes: it is a lit stage on a dark screen.

/** The tutorial's dusk stage tokens (beam, pool, toy shadows), pinned to their night values. */
export const STAGE_TOKENS = {
  "--sft-beam": "rgba(255, 206, 150, 0.16)",
  "--sft-beam-core": "rgba(255, 226, 180, 0.22)",
  "--sft-pool": "rgba(255, 170, 100, 0.22)",
  "--sft-ground": "rgba(8, 3, 6, 0.5)",
} as CSSProperties;

/** Bold toy lettering: Fredoka with an ink outline and a drop. */
export function label(size: number, color = FACE): CSSProperties {
  return {
    fontFamily: FREDOKA,
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1,
    color,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    WebkitTextStroke: `${size * 0.1}px ${INK}`,
    paintOrder: "stroke fill",
    textShadow: `0 ${size * 0.08}px 0 ${INK}`,
  };
}

/** A comic hit's starburst, popped at `at` and gone after `life` seconds. */
export function HitBurst({ t, at, x, y, size = 440, color = TOY.butter.hex, life = 0.5, tilt = -8 }: {
  t: number;
  at: number;
  x: number;
  y: number;
  size?: number;
  color?: string;
  life?: number;
  tilt?: number;
}) {
  const local = t - at;
  if (local < 0 || local > life) return null;
  const pop = spring(local, SPRINGS.pop);
  const fade = 1 - progress(local, life * 0.75, life * 0.25);
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: x, top: y, transform: `scale(${pop * (1 - local * 0.15)}) rotate(${tilt}deg)`, opacity: fade }}
    >
      <StarBurst size={size} color={color} seed={5} rotate={local * 40} />
    </div>
  );
}

/** Sound-word size on the board: big enough to read at host size (about 24 px there). */
const SOUND_SIZE = 118;

/**
 * A comic sound word ("BONK!") on a starburst stretched to fit it, in screen
 * space: it pops on the hit at `at`, holds, drifts up a touch and fades out
 * by `at + life`.
 */
export function SoundWord({ t, at, x, y, word, color = TOY.butter.hex, life = 0.66, tilt = -8 }: {
  t: number;
  at: number;
  x: number;
  y: number;
  word: string;
  color?: string;
  life?: number;
  tilt?: number;
}) {
  const local = t - at;
  if (local < 0 || local > life) return null;
  const pop = spring(local, { stiffness: 520, damping: 17 });
  const fade = 1 - progress(local, life - 0.14, 0.14, ease.in);
  const burst = 440;
  // Fredoka caps run about 0.66 em wide: stretch the burst sideways to sit behind the whole word.
  const stretch = Math.min(1.45, Math.max(1, (word.length * 0.66 * SOUND_SIZE * 1.05) / burst));
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: x,
        top: y - local * 40,
        transform: `scale(${pop}) rotate(${tilt}deg)`,
        opacity: fade,
      }}
    >
      <div className="absolute left-0 top-0" style={{ transform: `scale(${stretch}, 0.74)` }}>
        <StarBurst size={burst} color={color} seed={word.length} rotate={local * 30} points={16} />
      </div>
      <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2" style={label(SOUND_SIZE)}>
        {word}
      </span>
    </div>
  );
}

/** The four-point "ting" a far-flung thing leaves in the sky. */
export function Twinkle({ t, at, x, y, size = 150, life = 0.7 }: { t: number; at: number; x: number; y: number; size?: number; life?: number }) {
  const local = t - at;
  if (local < 0 || local > life) return null;
  const grow = spring(local, SPRINGS.pop);
  const fade = 1 - progress(local, life * 0.55, life * 0.45, ease.in);
  return (
    <svg
      className="pointer-events-none absolute"
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      style={{ left: x - size / 2, top: y - size / 2, opacity: fade, transform: `scale(${grow}) rotate(${local * 160}deg)`, overflow: "visible" }}
      aria-hidden="true"
    >
      <circle r={22} fill="#FFF6E0" opacity={0.35} />
      <path d="M 0 -50 L 9 -9 L 50 0 L 9 9 L 0 50 L -9 9 L -50 0 L -9 -9 Z" fill="#FFFBEF" stroke={TOY.butter.hex} strokeWidth={4} strokeLinejoin="round" />
    </svg>
  );
}

/** Poof clouds where something landed or vanished. */
export function Poof({ t, at, x, y, scale = 1, life = 0.5 }: { t: number; at: number; x: number; y: number; scale?: number; life?: number }) {
  const p = (t - at) / life;
  if (p < 0 || p > 1) return null;
  return (
    <svg className="pointer-events-none absolute left-0 top-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const spread = (0.35 + hash01(index + 3) * 0.65) * side;
        const distance = (60 + ease.out(p) * 200) * scale;
        return (
          <circle
            key={index}
            cx={x + spread * distance}
            cy={y - hash01(index + 9) * 50 * scale * p - 10 * scale}
            r={(34 + hash01(index) * 22) * scale * (1 - p * 0.55)}
            fill="#FFFDF7"
            stroke={INK}
            strokeWidth={5}
            opacity={1 - p}
          />
        );
      })}
    </svg>
  );
}

/** Two or three frames of inverted colour on a big hit: the anime impact frame. */
export function ImpactFrame({ t, at, hold = 0.07 }: { t: number; at: number; hold?: number }) {
  if (t < at || t > at + hold) return null;
  return <div className="pointer-events-none absolute inset-0 z-40" style={{ background: "#FFFFFF", mixBlendMode: "difference" }} />;
}

/** Eighteen wedges in a 100-unit box, centred on 0. */
const RAYS = (() => {
  const wedges = 18;
  const half = Math.PI / wedges / 2;
  const r = 50;
  return Array.from({ length: wedges }, (_, index) => {
    const angle = (index / wedges) * Math.PI * 2;
    const a = angle - half;
    const b = angle + half;
    return `M 0 0 L ${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)} L ${(Math.cos(b) * r).toFixed(2)} ${(Math.sin(b) * r).toFixed(2)} Z`;
  }).join(" ");
})();

/** Comic sunburst rays behind a hero, slowly turning. */
export function Rays({ t, x, y, opacity, color = TOY.tangerine.hex, size = 2400 }: { t: number; x: number; y: number; opacity: number; color?: string; size?: number }) {
  if (opacity <= 0.01) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        opacity,
        maskImage: "radial-gradient(closest-side, black 18%, transparent 92%)",
        WebkitMaskImage: "radial-gradient(closest-side, black 18%, transparent 92%)",
      }}
    >
      <svg viewBox="-50 -50 100 100" width={size} height={size} style={{ transform: `rotate(${t * 9}deg)` }} aria-hidden="true">
        <path d={RAYS} fill={color} />
      </svg>
    </div>
  );
}

/** Dust hanging in a stage beam, drifting up. */
export function Motes({ t, x, width, top = 120, bottom = 900, count = 12 }: { t: number; x: number; width: number; top?: number; bottom?: number; count?: number }) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0" width={1920} height={1080} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const span = bottom - top;
        const phase = (hash01(index * 3.3) + t * (0.05 + hash01(index * 7.1) * 0.06)) % 1;
        const y = bottom - phase * span;
        const spread = (y - top) / span;
        const mx = x + (hash01(index * 5.7) - 0.5) * width * (0.3 + spread * 0.7) + Math.sin(t * 0.9 + index) * 14;
        const glow = Math.sin(phase * Math.PI);
        return <circle key={index} cx={mx} cy={y} r={3 + hash01(index) * 4} fill="#FFE9C8" opacity={0.5 * glow} />;
      })}
    </svg>
  );
}

/** A fighting-game health bar with the fighter's face at its outer end. */
export function HealthBar({ kind, side, health, ghost, x, y, width = 640 }: {
  kind: ToyKind;
  side: "left" | "right";
  /** 0..1. */
  health: number;
  /** 0..1, the pale "just lost" trail. */
  ghost: number;
  x: number;
  y: number;
  width?: number;
}) {
  const low = health <= 0.3;
  const fill = low ? "#E5322D" : kind === "shark" ? TOY.teal.hex : TOY.butter.hex;
  const anchor = side === "left" ? "left" : "right";
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, width }}>
      <div
        className="absolute overflow-hidden"
        style={{
          [anchor]: FACE_DISC * 0.62,
          top: 0,
          width: width - FACE_DISC * 0.62,
          height: BAR_HEIGHT,
          background: NIGHT,
          border: `6px solid ${INK}`,
          borderRadius: 14,
          transform: `skewX(${side === "left" ? -12 : 12}deg)`,
          boxShadow: `0 6px 0 ${INK}`,
        }}
      >
        <div className="absolute inset-y-0" style={{ [anchor]: 0, width: `${clamp(ghost) * 100}%`, background: FACE, opacity: 0.75 }} />
        <div className="absolute inset-y-0" style={{ [anchor]: 0, width: `${clamp(health) * 100}%`, background: fill }} />
        <div className="absolute inset-x-0 top-[6px] h-[8px]" style={{ background: "rgba(255,255,255,0.35)" }} />
      </div>
      <HealthFace kind={kind} side={side} />
    </div>
  );
}

/** The fighter's face disc at the bar's outer end. Constant, so memo keeps it out of the per-frame render. */
const HealthFace = memo(function HealthFace({ kind, side }: { kind: ToyKind; side: "left" | "right" }) {
  return (
    <div
      className="absolute overflow-hidden rounded-full"
      style={{
        [side]: 0,
        top: BAR_HEIGHT / 2 - FACE_DISC / 2,
        width: FACE_DISC,
        height: FACE_DISC,
        background: kind === "shark" ? mixWith(TOY.ocean.hex) : mixWith(TOY.tomato.hex),
        border: `7px solid ${INK}`,
        boxShadow: `0 6px 0 ${INK}`,
      }}
    >
      <ToyArt
        kind={kind}
        size={FACE_ART}
        mood="angry"
        look={0.5}
        className="absolute"
        style={{
          left: (FACE_DISC - 14 - FACE_ART) / 2,
          top: (FACE_DISC - 14) / 2 - ((EYES_Y[kind] + 360) / 380) * FACE_ART * (380 / 360),
          transform: side === "right" ? "scaleX(-1)" : undefined,
        }}
      />
    </div>
  );
});

const BAR_HEIGHT = 52;
const FACE_DISC = 132;
const FACE_ART = 210;
/** Where each toy's eyes sit, in toy units (its feet are at 0). */
const EYES_Y: Record<ToyKind, number> = { shark: -224, toaster: -180, duck: -214, cactus: -216 };

function mixWith(hex: string): string {
  return `color-mix(in srgb, ${hex} 35%, ${NIGHT})`;
}

/** A slide-in name plate, `side` of the board. */
export function NamePlate({ name, side, enter, y, color }: { name: string; side: "left" | "right"; enter: number; y: number; color: string }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        [side]: 96,
        top: y,
        transform: `translateX(${(1 - enter) * (side === "left" ? -900 : 900)}px) rotate(${side === "left" ? -2 : 2}deg)`,
      }}
    >
      <div
        className="rounded-[18px] px-[30px] pb-[10px] pt-[12px]"
        style={{ background: NIGHT, border: `6px solid ${color}`, boxShadow: `0 8px 0 ${INK}`, ...label(76), WebkitTextStroke: undefined, textShadow: undefined }}
      >
        {name}
      </div>
    </div>
  );
}
