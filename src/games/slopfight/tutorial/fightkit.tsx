"use client";

import { clamp, ease, progress } from "@/tutorial/timeline";
import { FREDOKA, INK, NIGHT, TOY } from "./look";

// Fight furniture: the floating health bars, the "ON THE EDGE" tag, and the
// hype meter that hangs over the counter (and is not plugged into anything).

/** A health total after the hits so far: each hit lands at `at` and drains over 0.18 s. */
export function healthAt(t: number, max: number, hits: readonly (readonly [number, number])[]): number {
  let health = max;
  for (const [at, damage] of hits) health -= damage * progress(t, at, 0.18, ease.out);
  return Math.max(0, health);
}

/** The floating bar over a fighter: name, then health with a pale "just lost" ghost. */
export function FloatingHealth({
  x,
  y,
  name,
  health,
  ghost,
  max,
  side,
  shake = 0,
}: {
  x: number;
  y: number;
  name: string;
  health: number;
  /** The health a moment ago (the pale trail). */
  ghost: number;
  max: number;
  side: "A" | "B";
  shake?: number;
}) {
  const pct = clamp(health / max) * 100;
  const ghostPct = clamp(ghost / max) * 100;
  const color = pct <= 25 ? "bg-fail" : side === "A" ? "bg-teal" : "bg-gold";
  return (
    <div className="absolute w-[300px]" style={{ left: x - 150, top: y, transform: `translateX(${shake}px)` }}>
      <div className="mb-[6px] flex items-baseline justify-between px-[4px]">
        <span className="uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 30, color: "#FFF4DC", textShadow: `0 3px 0 ${INK}` }}>
          {name}
        </span>
      </div>
      <div className="relative h-[30px] overflow-hidden rounded-full border-[4px]" style={{ borderColor: INK, background: NIGHT }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${ghostPct}%`, background: "#FFF4DC", opacity: 0.7 }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The game's red "ON THE EDGE" tag, blinking over a fighter near the drop. */
export function OnTheEdge({ x, y, t, at }: { x: number; y: number; t: number; at: number }) {
  if (t < at) return null;
  const blink = Math.floor((t - at) * 6) % 2 === 0 ? 1 : 0.55;
  const pop = progress(t, at, 0.15, ease.outBack);
  return (
    <div
      className="absolute whitespace-nowrap rounded-full px-[20px] py-[6px] uppercase"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${pop}) rotate(-4deg)`,
        background: "#E5322D",
        color: "#FFF4DC",
        fontFamily: FREDOKA,
        fontWeight: 700,
        fontSize: 32,
        letterSpacing: "0.06em",
        opacity: blink,
        border: `4px solid ${INK}`,
      }}
    >
      On the edge
    </div>
  );
}

/**
 * The hype meter, hung from the rafters over the fight at (x, y) (its top
 * centre). `needle` runs 0..1 (empty to full); its cord dangles to a plug that
 * is plugged into nothing.
 */
export function HypeMeter({ x, y, needle, glow, t }: { x: number; y: number; needle: number; glow: number; t: number }) {
  const angle = -90 + clamp(needle, 0, 1.15) * 180;
  const sway = Math.sin(t * 2.1) * 1.2;
  const plugSway = Math.sin(t * 2.7 + 1) * 10;
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
      <g transform={`rotate(${sway} ${x} -40)`}>
        {/* The chains. */}
        <path d={`M ${x - 120} -40 L ${x - 120} ${y + 10} M ${x + 120} -40 L ${x + 120} ${y + 10}`} stroke={INK} strokeWidth={8} strokeDasharray="16 8" />
        {/* The cord, then the plug: connected to nothing at all. */}
        <path
          d={`M ${x + 40} ${y + 200} C ${x + 50} ${y + 260} ${x + 4 + plugSway} ${y + 270} ${x + 10 + plugSway} ${y + 320}`}
          fill="none"
          stroke={INK}
          strokeWidth={9}
          strokeLinecap="round"
        />
        <g transform={`translate(${x + 10 + plugSway} ${y + 318}) rotate(${plugSway * 0.8})`}>
          <rect x={-22} y={0} width={44} height={46} rx={10} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={5} />
          <rect x={-13} y={44} width={8} height={22} rx={2} fill="#D9D2C6" stroke={INK} strokeWidth={3} />
          <rect x={5} y={44} width={8} height={22} rx={2} fill="#D9D2C6" stroke={INK} strokeWidth={3} />
        </g>
        {/* The panel. */}
        <rect x={x - 170} y={y} width={340} height={210} rx={30} fill={NIGHT} stroke={INK} strokeWidth={6} />
        <rect x={x - 170} y={y} width={340} height={210} rx={30} fill="none" stroke={TOY.butter.hex} strokeWidth={4} opacity={0.35 + glow * 0.65} />
        <path d={`M ${x - 120} ${y + 150} A 120 120 0 0 1 ${x + 120} ${y + 150}`} fill="none" stroke="#FFF4DC" strokeWidth={30} />
        <path d={`M ${x - 120} ${y + 150} A 120 120 0 0 1 ${x - 60} ${y + 46}`} fill="none" stroke={TOY.teal.hex} strokeWidth={22} />
        <path d={`M ${x - 60} ${y + 46} A 120 120 0 0 1 ${x + 60} ${y + 46}`} fill="none" stroke={TOY.butter.hex} strokeWidth={22} />
        <path d={`M ${x + 60} ${y + 46} A 120 120 0 0 1 ${x + 120} ${y + 150}`} fill="none" stroke={TOY.tomato.hex} strokeWidth={22} />
        <g transform={`rotate(${angle} ${x} ${y + 150})`}>
          <path d={`M ${x - 7} ${y + 150} L ${x} ${y + 44} L ${x + 7} ${y + 150} Z`} fill="#FFF4DC" stroke={INK} strokeWidth={3} />
        </g>
        <circle cx={x} cy={y + 150} r={16} fill={TOY.tangerine.hex} stroke={INK} strokeWidth={4} />
        <text x={x} y={y + 196} textAnchor="middle" fill={TOY.butter.hex} style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 30, letterSpacing: "0.14em" }}>
          HYPE
        </text>
      </g>
    </svg>
  );
}
