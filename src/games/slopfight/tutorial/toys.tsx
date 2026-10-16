"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { INK, TOY, mixHex } from "./look";

// The cast, drawn flat as soft-vinyl toys: a chunky ink outline, a lit-from-
// the-top-left gradient, googly eyes. Each toy's origin is the point between
// its feet; the drawing spans about 360 x 360 units above it.

export type ToyKind = "shark" | "toaster" | "duck" | "cactus";
export type Mood = "happy" | "angry" | "ko" | "wow" | "sad" | "smug" | "dizzy";

export const CAST = {
  shark: { name: "Sir Chompsalot", color: TOY.ocean.hex },
  toaster: { name: "Crumb Lord", color: TOY.tomato.hex },
  duck: { name: "Quackhammer", color: TOY.butter.hex },
  cactus: { name: "Prickles", color: TOY.moss.hex },
} as const satisfies Record<ToyKind, { name: string; color: string }>;

const OUT = 7;

interface Gradients {
  fill(hex: string): string;
  defs: ReactNode[];
}

/** Vinyl gradients for one toy drawing, unique to this instance. */
function useVinyl(colors: readonly string[]): Gradients {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = new Map<string, string>();
  const defs = colors.map((hex, index) => {
    const id = `${base}v${index}`;
    ids.set(hex, id);
    return (
      <radialGradient key={id} id={id} cx="0.36" cy="0.28" r="0.8">
        <stop offset="0" stopColor={mixHex(hex, "#ffffff", 0.42)} />
        <stop offset="0.45" stopColor={hex} />
        <stop offset="1" stopColor={mixHex(hex, INK, 0.38)} />
      </radialGradient>
    );
  });
  return { fill: (hex) => `url(#${ids.get(hex) ?? ""})`, defs };
}

function Shine({ x, y, rx = 22, ry = 11, rotate = -32 }: { x: number; y: number; rx?: number; ry?: number; rotate?: number }) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={rx}
      ry={ry}
      fill="#ffffff"
      opacity={0.42}
      transform={`rotate(${rotate} ${x} ${y})`}
    />
  );
}

/** A pair of googly eyes (or what's left of them). */
function Eyes({
  points,
  r,
  mood,
  look = 0,
  spin = 0,
}: {
  points: readonly [number, number][];
  r: number;
  mood: Mood;
  look?: number;
  spin?: number;
}) {
  return (
    <>
      {points.map(([cx, cy], index) => {
        if (mood === "ko") {
          const d = r * 0.62;
          return (
            <g key={index} stroke={INK} strokeWidth={r * 0.36} strokeLinecap="round">
              <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
              <line x1={cx + d} y1={cy - d} x2={cx - d} y2={cy + d} />
            </g>
          );
        }
        if (mood === "dizzy") {
          const turn = spin * (index === 0 ? 1 : -1);
          return (
            <g key={index} transform={`rotate(${turn} ${cx} ${cy})`}>
              <circle cx={cx} cy={cy} r={r} fill="#FFFDF7" stroke={INK} strokeWidth={5} />
              <path
                d={`M ${cx} ${cy} m 0 -3 a 3 3 0 1 1 -3 3 a 7 7 0 1 1 7 7 a 12 12 0 1 1 -13 -12`}
                fill="none"
                stroke={INK}
                strokeWidth={4}
                strokeLinecap="round"
              />
            </g>
          );
        }
        const pupil = mood === "wow" ? r * 0.3 : r * 0.48;
        const dx = look * r * 0.38;
        const dy = mood === "sad" ? r * 0.25 : mood === "smug" ? r * 0.2 : 0;
        return (
          <g key={index}>
            <circle cx={cx} cy={cy} r={r} fill="#FFFDF7" stroke={INK} strokeWidth={5} />
            <circle cx={cx + dx} cy={cy + dy + (mood === "wow" ? 0 : r * 0.08)} r={pupil} fill={INK} />
            <circle cx={cx + dx - pupil * 0.35} cy={cy + dy - pupil * 0.3} r={pupil * 0.3} fill="#ffffff" />
            {mood === "smug" && (
              <path
                d={`M ${cx - r - 2} ${cy - 1} A ${r + 2} ${r + 2} 0 0 1 ${cx + r + 2} ${cy - 1} Z`}
                fill={INK}
                opacity={0.92}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

function Brows({ points, r, mood }: { points: readonly [number, number][]; r: number; mood: Mood }) {
  if (mood !== "angry" && mood !== "sad") return null;
  const tilt = mood === "angry" ? 1 : -1;
  return (
    <g stroke={INK} strokeWidth={r * 0.5} strokeLinecap="round">
      {points.map(([cx, cy], index) => {
        const side = index === 0 ? -1 : 1;
        const y = cy - r * 1.35;
        return (
          <line
            key={index}
            x1={cx + side * r * 1.05}
            y1={y - tilt * r * 0.45}
            x2={cx - side * r * 0.7}
            y2={y + tilt * r * 0.35}
          />
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The shark: Sir Chompsalot
// ---------------------------------------------------------------------------

export interface Extras {
  tux?: boolean;
  /** Pop-in amounts, 0..1+ (springs may overshoot). */
  hat?: number;
  jetpack?: number;
  head2?: number;
  /** The right fin's reach, in toy units beyond its rest. */
  reach?: number;
  /** A trophy held overhead, 0..1. */
  trophy?: number;
  /** A participation rosette, 0..1. */
  ribbon?: number;
  /** Seconds, for idle flicker (jet flames, steam). */
  clock?: number;
}

function sharkMouth(mood: Mood): ReactNode {
  if (mood === "ko") {
    return (
      <g>
        <ellipse cx={0} cy={-170} rx={30} ry={20} fill="#4A1A22" stroke={INK} strokeWidth={5} />
        <ellipse cx={8} cy={-158} rx={14} ry={11} fill={TOY.bubblegum.hex} stroke={INK} strokeWidth={4} />
      </g>
    );
  }
  if (mood === "wow") return <ellipse cx={0} cy={-168} rx={24} ry={28} fill="#4A1A22" stroke={INK} strokeWidth={5} />;
  if (mood === "sad") {
    return <path d="M -40 -158 C -20 -182 20 -182 40 -158" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" />;
  }
  const curve = (x: number) => -178 - 13 * (x / 66) ** 2;
  const teeth = [-48, -36, -24, -12, 0, 12, 24, 36, 48].map((x) => (
    <polygon key={x} points={`${x - 6.5},${curve(x) - 1} ${x + 6.5},${curve(x) - 1} ${x},${curve(x) + 13}`} fill="#FFFDF7" />
  ));
  const bottom = mood === "angry" ? -160 : mood === "smug" ? -168 : -140;
  return (
    <g>
      <path
        d={`M -66 -190 C -34 -172 34 -172 66 -190 C 40 ${bottom - 6} -40 ${bottom - 6} -66 -190 Z`}
        fill="#4A1A22"
        stroke={INK}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {teeth}
    </g>
  );
}

function Shark({ mood, look, extras, v }: { mood: Mood; look: number; extras: Extras; v: Gradients }) {
  const ocean = TOY.ocean.hex;
  const outline = { stroke: INK, strokeWidth: OUT, strokeLinejoin: "round" as const };
  const { hat = 0, jetpack = 0, head2 = 0, reach = 0, tux = false, clock = 0 } = extras;
  const flame = 1 + Math.sin(clock * 40) * 0.18 + Math.sin(clock * 23) * 0.12;
  return (
    <g>
      {jetpack > 0.01 && (
        <g transform={`translate(0 -150) scale(${jetpack}) translate(0 150)`}>
          {[-1, 1].map((side) => (
            <g key={side}>
              <path
                d={`M ${side * 128 - 18} -96 Q ${side * 128} ${-96 + 70 * flame} ${side * 128 + 18} -96 Z`}
                fill={TOY.butter.hex}
                stroke={TOY.tangerine.hex}
                strokeWidth={8}
                strokeLinejoin="round"
              />
              <rect x={side * 128 - 30} y={-250} width={60} height={160} rx={28} fill={v.fill(TOY.bone.hex)} {...outline} />
              <rect x={side * 128 - 30} y={-196} width={60} height={18} fill={TOY.tomato.hex} stroke={INK} strokeWidth={5} />
            </g>
          ))}
        </g>
      )}
      <path d="M 80 -70 C 120 -64 150 -84 168 -118 C 176 -82 172 -42 150 -14 C 128 -34 104 -40 76 -44 Z" fill={v.fill(ocean)} {...outline} />
      <path d="M -18 -270 C -6 -312 18 -338 46 -350 C 40 -316 42 -290 54 -258 Z" fill={v.fill(ocean)} {...outline} />
      {head2 > 0.01 && (
        <g transform={`translate(112 -250) scale(${head2}) translate(-112 250)`}>
          <circle cx={128} cy={-262} r={70} fill={v.fill(ocean)} {...outline} />
          <path d="M 96 -238 C 116 -214 150 -214 166 -236 C 146 -228 116 -228 96 -238 Z" fill="#4A1A22" stroke={INK} strokeWidth={4} />
          <Eyes points={[[108, -282], [150, -282]]} r={16} mood={mood === "ko" ? "ko" : "wow"} look={-0.4} />
        </g>
      )}
      {[-1, 1].map((side) => (
        <g key={side}>
          <rect x={side < 0 ? -68 : 28} y={-62} width={40} height={58} rx={18} fill={v.fill(ocean)} {...outline} />
          <ellipse cx={side * 46} cy={-8} rx={32} ry={14} fill={v.fill(TOY.bone.hex)} {...outline} />
        </g>
      ))}
      <path d="M -104 -150 C -140 -140 -166 -112 -174 -78 C -146 -88 -120 -96 -98 -108 Z" fill={v.fill(ocean)} {...outline} />
      {reach > 0.5 ? (
        <Reach reach={reach} />
      ) : (
        <path d="M 104 -150 C 140 -140 166 -112 174 -78 C 146 -88 120 -96 98 -108 Z" fill={v.fill(ocean)} {...outline} />
      )}
      <path
        d="M 0 -282 C 78 -282 114 -206 114 -138 C 114 -70 74 -36 0 -36 C -74 -36 -114 -70 -114 -138 C -114 -206 -78 -282 0 -282 Z"
        fill={v.fill(ocean)}
        {...outline}
      />
      <ellipse cx={0} cy={-102} rx={70} ry={60} fill={v.fill(TOY.bone.hex)} stroke={INK} strokeWidth={5} />
      {tux && (
        <g>
          <path d="M -68 -128 L -20 -150 L -6 -46 C -36 -50 -58 -66 -68 -90 Z" fill={TOY.charcoal.hex} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <path d="M 68 -128 L 20 -150 L 6 -46 C 36 -50 58 -66 68 -90 Z" fill={TOY.charcoal.hex} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <path d="M 0 -146 L -34 -162 L -34 -128 Z M 0 -146 L 34 -162 L 34 -128 Z" fill={TOY.charcoal.hex} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <circle cx={0} cy={-146} r={9} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={4} />
          <circle cx={0} cy={-112} r={5} fill={INK} />
          <circle cx={0} cy={-88} r={5} fill={INK} />
        </g>
      )}
      <Shine x={-56} y={-236} />
      {sharkMouth(mood)}
      <Brows points={[[-44, -224], [44, -224]]} r={24} mood={mood} />
      <Eyes points={[[-44, -224], [44, -224]]} r={25} mood={mood} look={look} spin={clock * 400} />
      {hat > 0.01 && (
        <g transform={`translate(0 -276) scale(${hat}) translate(0 276)`}>
          <ellipse cx={0} cy={-272} rx={86} ry={16} fill={TOY.charcoal.hex} {...outline} />
          <path d="M -54 -274 L -48 -372 L 48 -372 L 54 -274 Z" fill={v.fill(TOY.charcoal.hex)} {...outline} />
          <rect x={-52} y={-304} width={104} height={20} fill={TOY.tomato.hex} stroke={INK} strokeWidth={5} />
          <Shine x={-28} y={-348} rx={10} ry={18} rotate={0} />
        </g>
      )}
    </g>
  );
}

/** The right fin as a rubber arm, stretched `reach` units, with a boxing glove. */
function Reach({ reach }: { reach: number }) {
  const startX = 96;
  const startY = -130;
  const endX = startX + reach;
  const wave = Math.min(18, reach * 0.05);
  const mid = (startX + endX) / 2;
  const d = `M ${startX} ${startY} C ${mid - reach * 0.2} ${startY - wave} ${mid + reach * 0.2} ${startY + wave} ${endX} ${startY}`;
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={40} strokeLinecap="round" />
      <path d={d} fill="none" stroke={TOY.ocean.hex} strokeWidth={26} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.3} strokeWidth={6} strokeLinecap="round" transform="translate(0 -6)" />
      <Glove x={endX + 20} y={startY} color={TOY.tomato.hex} size={1} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The toaster: Crumb Lord
// ---------------------------------------------------------------------------

function Toaster({ mood, look, extras, v }: { mood: Mood; look: number; extras: Extras; v: Gradients }) {
  const tomato = TOY.tomato.hex;
  const outline = { stroke: INK, strokeWidth: OUT, strokeLinejoin: "round" as const };
  const clock = extras.clock ?? 0;
  const steaming = mood === "angry";
  return (
    <g>
      {steaming &&
        [0, 1, 2].map((index) => {
          const phase = (clock * 0.9 + index / 3) % 1;
          const x = (index - 1) * 52 + Math.sin(phase * 6 + index) * 10;
          return (
            <circle
              key={index}
              cx={x}
              cy={-300 - phase * 90}
              r={14 + phase * 22}
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth={4}
              opacity={(1 - phase) * 0.9}
            />
          );
        })}
      <rect x={-80} y={-302} width={62} height={72} rx={16} fill={TOY.sand.hex} stroke={TOY.cocoa.hex} strokeWidth={7} transform="rotate(-6 -49 -266)" />
      <rect x={18} y={-290} width={62} height={60} rx={16} fill={TOY.sand.hex} stroke={TOY.cocoa.hex} strokeWidth={7} transform="rotate(5 49 -260)" />
      {[-1, 1].map((side) => (
        <g key={side}>
          <rect x={side < 0 ? -62 : 26} y={-48} width={36} height={44} rx={12} fill={TOY.charcoal.hex} {...outline} />
          <ellipse cx={side * 46} cy={-8} rx={30} ry={13} fill={TOY.charcoal.hex} {...outline} />
          <path
            d={`M ${side * 104} -128 C ${side * 140} -126 ${side * 150} -100 ${side * 152} -78`}
            fill="none"
            stroke={INK}
            strokeWidth={20}
            strokeLinecap="round"
          />
          <path
            d={`M ${side * 104} -128 C ${side * 140} -126 ${side * 150} -100 ${side * 152} -78`}
            fill="none"
            stroke={mixHex(tomato, INK, 0.25)}
            strokeWidth={9}
            strokeLinecap="round"
          />
          <circle cx={side * 152} cy={-72} r={20} fill={v.fill(TOY.bone.hex)} {...outline} />
        </g>
      ))}
      <rect x={-110} y={-248} width={220} height={212} rx={52} fill={v.fill(tomato)} {...outline} />
      <rect x={-98} y={-84} width={196} height={20} rx={9} fill="#DCD6CF" stroke={INK} strokeWidth={5} />
      <rect x={-84} y={-254} width={70} height={14} rx={6} fill="#4A1A22" stroke={INK} strokeWidth={4} />
      <rect x={14} y={-254} width={70} height={14} rx={6} fill="#4A1A22" stroke={INK} strokeWidth={4} />
      <rect x={106} y={-176} width={28} height={16} rx={7} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={4} />
      <circle cx={138} cy={-168} r={11} fill={TOY.bone.hex} stroke={INK} strokeWidth={4} />
      <Shine x={-62} y={-214} rx={26} ry={12} />
      {mood === "ko" ? (
        <g>
          <ellipse cx={0} cy={-118} rx={30} ry={18} fill="#4A1A22" stroke={INK} strokeWidth={5} />
          <ellipse cx={-8} cy={-106} rx={13} ry={10} fill={TOY.bubblegum.hex} stroke={INK} strokeWidth={4} />
        </g>
      ) : mood === "happy" || mood === "smug" ? (
        <path d="M -40 -130 C -20 -100 20 -100 40 -130 Z" fill="#4A1A22" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      ) : mood === "sad" ? (
        <path d="M -34 -110 C -16 -134 16 -134 34 -110" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      ) : (
        <g>
          <rect x={-46} y={-136} width={92} height={32} rx={11} fill="#FFFDF7" stroke={INK} strokeWidth={5} />
          <path d="M -46 -120 H 46 M -23 -136 V -104 M 0 -136 V -104 M 23 -136 V -104" stroke={INK} strokeWidth={4} />
        </g>
      )}
      <Brows points={[[-44, -180], [44, -180]]} r={24} mood={mood === "smug" ? "angry" : mood} />
      <Eyes points={[[-44, -180], [44, -180]]} r={24} mood={mood} look={look} spin={clock * 400} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The house: Quackhammer (a rubber duck) and Prickles (a cactus)
// ---------------------------------------------------------------------------

function Duck({ mood, look, v }: { mood: Mood; look: number; v: Gradients }) {
  const butter = TOY.butter.hex;
  const outline = { stroke: INK, strokeWidth: OUT, strokeLinejoin: "round" as const };
  return (
    <g>
      <path d="M 96 -110 C 136 -128 150 -160 148 -186 C 126 -160 110 -150 86 -146 Z" fill={v.fill(butter)} {...outline} />
      <ellipse cx={0} cy={-84} rx={124} ry={80} fill={v.fill(butter)} {...outline} />
      <path d="M 18 -110 C 60 -126 98 -104 104 -66 C 76 -76 44 -78 18 -110 Z" fill={mixHex(butter, INK, 0.14)} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <circle cx={-14} cy={-212} r={74} fill={v.fill(butter)} {...outline} />
      <path d="M -88 -262 C -40 -296 26 -296 62 -264 L 58 -244 C 22 -270 -38 -272 -84 -242 Z" fill={TOY.tomato.hex} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M -82 -254 C -38 -282 22 -282 58 -256" fill="none" stroke="#FFFDF7" strokeWidth={6} />
      <Shine x={-50} y={-246} rx={18} ry={9} />
      <ellipse cx={-14} cy={-170} rx={52} ry={16} fill={v.fill(TOY.tangerine.hex)} {...outline} />
      <path d="M -54 -168 C -30 -146 4 -146 26 -168" fill={mixHex(TOY.tangerine.hex, INK, 0.2)} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      {mood === "ko" || mood === "wow" ? (
        <ellipse cx={-14} cy={-162} rx={18} ry={12} fill="#4A1A22" stroke={INK} strokeWidth={4} />
      ) : null}
      <Brows points={[[-42, -214], [16, -214]]} r={20} mood={mood} />
      <Eyes points={[[-42, -214], [16, -214]]} r={21} mood={mood} look={look} />
    </g>
  );
}

function Cactus({ mood, look, v }: { mood: Mood; look: number; v: Gradients }) {
  const green = mixHex(TOY.moss.hex, TOY.lime.hex, 0.35);
  const outline = { stroke: INK, strokeWidth: OUT, strokeLinejoin: "round" as const };
  const spikes: [number, number][] = [
    [-40, -250], [36, -262], [-44, -150], [44, -170], [-20, -110], [26, -130], [0, -200],
  ];
  return (
    <g>
      {[
        "M -50 -150 L -108 -150 L -108 -222",
        "M 50 -122 L 104 -122 L 104 -190",
      ].map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={INK} strokeWidth={50} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={green} strokeWidth={36} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      <rect x={-62} y={-298} width={124} height={230} rx={62} fill={v.fill(green)} {...outline} />
      <path d="M -24 -290 V -76 M 24 -290 V -76" stroke={mixHex(green, INK, 0.35)} strokeWidth={4} opacity={0.6} />
      {spikes.map(([x, y]) => (
        <path key={`${x}${y}`} d={`M ${x - 7} ${y + 6} L ${x} ${y - 8} L ${x + 7} ${y + 6}`} fill="none" stroke="#FFFDF7" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <path d="M -82 -100 L 82 -100 L 82 -76 L -82 -76 Z" fill={v.fill(TOY.rust.hex)} {...outline} />
      <path d="M -70 -78 L 70 -78 L 54 0 L -54 0 Z" fill={v.fill(TOY.rust.hex)} {...outline} />
      {[0, 72, 144, 216, 288].map((angle) => (
        <circle
          key={angle}
          cx={22 + Math.cos((angle * Math.PI) / 180) * 16}
          cy={-300 + Math.sin((angle * Math.PI) / 180) * 16}
          r={13}
          fill={TOY.bubblegum.hex}
          stroke={INK}
          strokeWidth={4}
        />
      ))}
      <circle cx={22} cy={-300} r={9} fill={TOY.butter.hex} stroke={INK} strokeWidth={4} />
      <Shine x={-30} y={-262} rx={10} ry={20} rotate={-10} />
      {mood === "ko" ? (
        <ellipse cx={0} cy={-170} rx={18} ry={12} fill="#4A1A22" stroke={INK} strokeWidth={4} />
      ) : mood === "sad" ? (
        <path d="M -20 -160 C -8 -174 8 -174 20 -160" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      ) : (
        <path d="M -22 -176 C -10 -158 10 -158 22 -176" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      )}
      <Brows points={[[-24, -216], [24, -216]]} r={18} mood={mood} />
      <Eyes points={[[-24, -216], [24, -216]]} r={19} mood={mood} look={look} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Props: gloves, trophy, rosette
// ---------------------------------------------------------------------------

/** A cartoon boxing glove centred on (x, y), knuckles pointing right. */
export function Glove({ x, y, color, size = 1 }: { x: number; y: number; color: string; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <rect x={-46} y={-20} width={26} height={40} rx={8} fill="#FFFDF7" stroke={INK} strokeWidth={6} />
      <path
        d="M -24 -30 C -24 -44 -6 -50 14 -48 C 40 -46 52 -26 50 -2 C 48 26 30 38 6 38 C -12 38 -24 30 -24 18 Z"
        fill={color}
        stroke={INK}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <path d="M -6 -6 C 4 -18 22 -18 30 -6" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <ellipse cx={12} cy={-32} rx={14} ry={6} fill="#ffffff" opacity={0.4} />
    </g>
  );
}

export function TrophyShape({ size = 1 }: { size?: number }) {
  const gold = TOY.butter.hex;
  return (
    <g transform={`scale(${size})`}>
      <path d="M -60 -150 C -100 -150 -100 -96 -50 -92" fill="none" stroke={INK} strokeWidth={16} />
      <path d="M 60 -150 C 100 -150 100 -96 50 -92" fill="none" stroke={INK} strokeWidth={16} />
      <path d="M -60 -150 C -100 -150 -100 -96 -50 -92" fill="none" stroke={gold} strokeWidth={7} />
      <path d="M 60 -150 C 100 -150 100 -96 50 -92" fill="none" stroke={gold} strokeWidth={7} />
      <path d="M -64 -164 L 64 -164 C 64 -100 36 -66 0 -62 C -36 -66 -64 -100 -64 -164 Z" fill={gold} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
      <rect x={-12} y={-64} width={24} height={30} fill={mixHex(gold, INK, 0.2)} stroke={INK} strokeWidth={6} />
      <rect x={-44} y={-36} width={88} height={30} rx={8} fill={TOY.cocoa.hex} stroke={INK} strokeWidth={7} />
      <path d="M -36 -150 C -36 -112 -20 -88 -6 -82" fill="none" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" opacity={0.5} />
      <path d="M 0 -138 l 9 18 20 3 -14 14 3 20 -18 -9 -18 9 3 -20 -14 -14 20 -3 Z" fill="#FFF1B8" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
    </g>
  );
}

export function Rosette({ size = 1, color = TOY.teal.hex }: { size?: number; color?: string }) {
  const petals = 16;
  const points: string[] = [];
  for (let index = 0; index < petals * 2; index++) {
    const angle = (index / (petals * 2)) * Math.PI * 2;
    const radius = index % 2 === 0 ? 50 : 41;
    points.push(`${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`);
  }
  return (
    <g transform={`scale(${size})`}>
      <path d="M -26 30 L -40 96 L -20 84 L -8 100 L 2 36 Z" fill={color} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M 26 30 L 40 96 L 20 84 L 8 100 L -2 36 Z" fill={mixHex(color, INK, 0.2)} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <polygon points={points.join(" ")} fill={color} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <circle r={30} fill="#FFFDF7" stroke={INK} strokeWidth={5} />
      <path d="M 0 -17 l 5 11 12 1.5 -9 8 2.5 12 -10.5 -6 -10.5 6 2.5 -12 -9 -8 12 -1.5 Z" fill={TOY.butter.hex} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface ToyPose {
  /** Squash (+) or stretch (-) from the feet. */
  squash?: number;
  /** Degrees, around the feet. */
  lean?: number;
  /** Degrees, around the body's middle (for spins). */
  spin?: number;
  /** Board px off the floor. */
  hop?: number;
  /** Faces left. */
  flip?: boolean;
  mood?: Mood;
  look?: number;
  opacity?: number;
  /** Extra non-uniform scale on top of `scale` (for bulking up), x and y. */
  bulk?: [number, number];
}

/** The toy drawing alone, sized `size` board px wide (the 360-unit frame). */
export function ToyArt({
  kind,
  size,
  mood = "happy",
  look = 0,
  extras = {},
  style,
  className = "",
}: {
  kind: ToyKind;
  size: number;
  mood?: Mood;
  look?: number;
  extras?: Extras;
  style?: CSSProperties;
  className?: string;
}) {
  const v = useVinyl([
    TOY.ocean.hex,
    TOY.tomato.hex,
    TOY.bone.hex,
    TOY.butter.hex,
    TOY.tangerine.hex,
    TOY.charcoal.hex,
    TOY.rust.hex,
    mixHex(TOY.moss.hex, TOY.lime.hex, 0.35),
  ]);
  const extra = extras;
  return (
    <svg
      viewBox="-180 -360 360 380"
      width={size}
      height={(size * 380) / 360}
      className={className}
      style={{ overflow: "visible", ...style }}
      aria-hidden="true"
    >
      <defs>{v.defs}</defs>
      {kind === "shark" && <Shark mood={mood} look={look} extras={extra} v={v} />}
      {kind === "toaster" && <Toaster mood={mood} look={look} extras={extra} v={v} />}
      {kind === "duck" && <Duck mood={mood} look={look} v={v} />}
      {kind === "cactus" && <Cactus mood={mood} look={look} v={v} />}
      {(extra.trophy ?? 0) > 0.01 && (
        <g transform={`translate(0 ${kind === "shark" ? -300 : -280}) scale(${extra.trophy}) translate(0 -20)`}>
          <TrophyShape size={0.9} />
        </g>
      )}
      {(extra.ribbon ?? 0) > 0.01 && (
        <g transform={`translate(${kind === "duck" ? 40 : kind === "cactus" ? 0 : 36} ${kind === "duck" ? -96 : -140}) scale(${extra.ribbon}) rotate(-8)`}>
          <Rosette size={0.8} />
        </g>
      )}
    </svg>
  );
}

/**
 * A toy standing on the board with its feet at (x, y), `scale` times its
 * natural 360 px, in a pose. Draw its shadow with `shadow`.
 */
export function Toy({
  kind,
  x,
  y,
  scale = 1,
  pose = {},
  extras,
  shadow = true,
  z,
}: {
  kind: ToyKind;
  x: number;
  y: number;
  scale?: number;
  pose?: ToyPose;
  extras?: Extras;
  shadow?: boolean;
  z?: number;
}) {
  const { squash = 0, lean = 0, spin = 0, hop = 0, flip = false, mood = "happy", look = 0, opacity = 1, bulk = [1, 1] } = pose;
  const size = 360 * scale;
  const sx = (1 + squash * 0.75) * bulk[0] * (flip ? -1 : 1);
  const sy = (1 - squash) * bulk[1];
  return (
    <>
      {shadow && (
        <div className="pointer-events-none absolute" style={{ left: 0, top: 0, zIndex: z, opacity }}>
          <div
            className="absolute rounded-[50%]"
            style={{
              left: x - size * 0.34 * bulk[0],
              top: y - size * 0.05,
              width: size * 0.68 * bulk[0],
              height: size * 0.1,
              background: "radial-gradient(closest-side, var(--sft-ground), transparent)",
              transform: `scale(${1 / (1 + hop / 400)})`,
            }}
          />
        </div>
      )}
      <div
        className="pointer-events-none absolute"
        style={{
          left: x - size / 2,
          top: y - (size * 360) / 360,
          width: size,
          height: (size * 380) / 360,
          zIndex: z,
          opacity,
          transformOrigin: `${size / 2}px ${size}px`,
          transform: `translateY(${-hop}px) rotate(${lean}deg) scale(${sx}, ${sy})`,
        }}
      >
        <div
          style={{
            transformOrigin: `${size / 2}px ${size * 0.58}px`,
            transform: spin ? `rotate(${spin}deg)` : undefined,
          }}
        >
          <ToyArt kind={kind} size={size} mood={mood} look={flip ? -look : look} extras={extras} />
        </div>
      </div>
    </>
  );
}
