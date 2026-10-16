"use client";

import { memo, type ReactNode } from "react";
import { hash01 } from "@/tutorial/timeline";
import { FREDOKA, INK, NIGHT, TOY, mixHex } from "./look";

// The three arenas, as postcards (the fight card) and as full stages (the
// fights). Fixed art colours: they are places, not UI, and read the same in
// both themes.

export type ArenaId = "garage" | "kitchen" | "rooftop";

export const ARENAS: Record<ArenaId, { round: number; name: string; tone: string }> = {
  garage: { round: 1, name: "Flooded Garage", tone: TOY.teal.hex },
  kitchen: { round: 2, name: "Kitchen Counter", tone: TOY.tomato.hex },
  rooftop: { round: 3, name: "Rooftop", tone: TOY.tangerine.hex },
};

/** A flickering tube light's brightness at time t. */
function flicker(t: number, seed: number): number {
  const slot = Math.floor(t * 14);
  return hash01(slot * 3.1 + seed) > 0.86 ? 0.25 : 1;
}

// ---------------------------------------------------------------------------
// Little scenes (postcard size, 440 x 250)
// ---------------------------------------------------------------------------

function GarageArt({ t }: { t: number }) {
  const light = flicker(t, 1);
  return (
    <>
      <defs>
        <linearGradient id="sft-pc-garage" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B2327" />
          <stop offset="1" stopColor="#1C4F53" />
        </linearGradient>
      </defs>
      <rect width={440} height={250} fill="url(#sft-pc-garage)" />
      {Array.from({ length: 6 }, (_, index) => (
        <rect key={index} x={56} y={52 + index * 18} width={328} height={10} rx={3} fill="#0E2C30" />
      ))}
      <ellipse cx={220} cy={34} rx={120} ry={30} fill="#BFFFF1" opacity={0.18 * light} />
      <rect x={150} y={22} width={140} height={10} rx={5} fill="#E8FFF9" opacity={light} />
      <path d="M 40 170 C 44 140 70 128 104 126 L 132 104 C 150 94 196 94 214 106 L 236 126 C 262 128 276 140 278 170 Z" fill="#081A1D" />
      <circle cx={88} cy={170} r={18} fill="#05110F" />
      <circle cx={230} cy={170} r={18} fill="#05110F" />
      <path d="M 150 172 L 330 172 L 316 152 L 164 152 Z" fill={TOY.cocoa.hex} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <rect x={0} y={172} width={440} height={78} fill={TOY.teal.hex} opacity={0.62} />
      {[0, 1, 2, 3].map((index) => (
        <path
          key={index}
          d={`M ${20 + index * 110 + ((t * 30) % 40)} ${196 + (index % 2) * 22} q 18 -8 36 0`}
          fill="none"
          stroke={TOY.mint.hex}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.8}
        />
      ))}
    </>
  );
}

/** Static, so memo keeps it out of the per-frame render. */
const KitchenArt = memo(function KitchenArt() {
  return (
    <>
      <rect width={440} height={250} fill="#6E2620" />
      {Array.from({ length: 9 }, (_, index) => (
        <line key={`v${index}`} x1={index * 52 + 10} y1={0} x2={index * 52 + 10} y2={176} stroke="#86342B" strokeWidth={4} />
      ))}
      {Array.from({ length: 4 }, (_, index) => (
        <line key={`h${index}`} x1={0} y1={index * 46 + 20} x2={440} y2={index * 46 + 20} stroke="#86342B" strokeWidth={4} />
      ))}
      <path d="M 60 176 L 60 96 C 60 70 110 70 110 96" fill="none" stroke="#C9C2B8" strokeWidth={14} strokeLinecap="round" />
      <path d="M 60 176 L 60 96 C 60 70 110 70 110 96" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.4} />
      <rect x={262} y={64} width={150} height={114} rx={28} fill="#D9D2C6" stroke={INK} strokeWidth={5} />
      <rect x={290} y={58} width={36} height={14} rx={6} fill={INK} />
      <rect x={348} y={58} width={36} height={14} rx={6} fill={INK} />
      <rect x={274} y={80} width={20} height={80} rx={8} fill="#ffffff" opacity={0.4} />
      <rect x={0} y={176} width={440} height={74} fill={TOY.bone.hex} />
      <rect x={0} y={176} width={440} height={10} fill={TOY.bone.dark} />
      {Array.from({ length: 14 }, (_, index) => (
        <circle key={index} cx={hash01(index) * 440} cy={196 + hash01(index + 0.5) * 48} r={3} fill={TOY.sand.dark} opacity={0.5} />
      ))}
    </>
  );
});

function RooftopArt({ t }: { t: number }) {
  return (
    <>
      <defs>
        <linearGradient id="sft-pc-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1E1430" />
          <stop offset="0.55" stopColor="#7A2F3C" />
          <stop offset="0.8" stopColor={TOY.tangerine.hex} />
        </linearGradient>
      </defs>
      <rect width={440} height={250} fill="url(#sft-pc-roof)" />
      {[
        [0, 120, 60],
        [64, 96, 48],
        [118, 134, 70],
        [196, 110, 44],
        [246, 84, 64],
        [318, 126, 52],
        [376, 100, 64],
      ].map(([x, y, w]) => (
        <rect key={x} x={x} y={y} width={w} height={200 - y} fill="#140B1A" />
      ))}
      <g transform="translate(78 50)">
        <path d="M 0 90 L 10 40 M 70 90 L 60 40 M 20 90 L 24 40 M 50 90 L 46 40" stroke="#140B1A" strokeWidth={6} />
        <path d="M 4 40 L 66 40 L 62 4 C 50 -6 20 -6 8 4 Z" fill="#2A1A24" stroke="#140B1A" strokeWidth={4} />
        <path d="M 2 4 L 35 -18 L 68 4 Z" fill="#2A1A24" />
      </g>
      <path d="M 210 96 Q 320 128 430 92" fill="none" stroke="#140B1A" strokeWidth={3} />
      {[
        [246, TOY.butter.hex],
        [300, TOY.teal.hex],
        [360, TOY.bubblegum.hex],
      ].map(([x, color], index) => {
        const sway = Math.sin(t * 3 + index) * 4;
        return <rect key={x} x={Number(x) - 16} y={104 + index * 3} width={32} height={38} rx={6} fill={String(color)} stroke={INK} strokeWidth={3} transform={`rotate(${sway} ${x} ${104 + index * 3})`} />;
      })}
      <rect x={0} y={186} width={440} height={64} fill={TOY.charcoal.hex} />
      <rect x={0} y={186} width={440} height={8} fill="#55535C" />
      {Array.from({ length: 18 }, (_, index) => (
        <circle key={index} cx={hash01(index + 2) * 440} cy={204 + hash01(index + 7) * 40} r={3} fill="#6A6873" />
      ))}
    </>
  );
}

/** A postcard of an arena: a little scene over a night label band. */
export function ArenaPostcard({ id, t, width = 440 }: { id: ArenaId; t: number; width?: number }) {
  const arena = ARENAS[id];
  const scale = width / 440;
  return (
    <div
      className="overflow-hidden"
      style={{
        width: width + 24 * scale,
        borderRadius: 22 * scale,
        padding: 12 * scale,
        background: "#FFF7EA",
        boxShadow: "0 30px 60px -24px rgba(0,0,0,0.65)",
      }}
    >
      <div className="relative">
        <svg viewBox="0 0 440 250" width={width} height={250 * scale} className="block rounded-t-[12px]" aria-hidden="true">
          {id === "garage" && <GarageArt t={t} />}
          {id === "kitchen" && <KitchenArt />}
          {id === "rooftop" && <RooftopArt t={t} />}
        </svg>
        <span
          className="absolute whitespace-nowrap rounded-full uppercase"
          style={{ left: 12 * scale, top: 12 * scale, fontFamily: FREDOKA, fontWeight: 700, fontSize: 28 * scale, padding: `${2 * scale}px ${14 * scale}px`, background: arena.tone, color: INK, border: `${3 * scale}px solid ${INK}` }}
        >
          Round {arena.round}
        </span>
      </div>
      <div className="rounded-b-[12px] text-center" style={{ background: NIGHT, padding: `${10 * scale}px ${14 * scale}px` }}>
        <span className="whitespace-nowrap uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 38 * scale, lineHeight: 1.1, color: "#FFF4DC", letterSpacing: "0.04em" }}>
          {arena.name}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full stages (1920 x 1080): a backdrop, then the fighting platform
// ---------------------------------------------------------------------------

/** The platform: a slab seen from the front, its top from y 690 (back) to 800 (front). */
export const PLATFORM = { back: 690, front: 800, face: 64, backLeft: 450, backRight: 1470, frontLeft: 300, frontRight: 1620 } as const;

/** The depth row the toys stand on (feet y). */
export const FLOOR_Y = 760;

function platformPath() {
  const p = PLATFORM;
  return `M ${p.backLeft} ${p.back} L ${p.backRight} ${p.back} L ${p.frontRight} ${p.front} L ${p.frontLeft} ${p.front} Z`;
}

function Platform({ top, edge, face, speckle, children }: { top: string; edge: string; face: string; speckle?: string; children?: ReactNode }) {
  const p = PLATFORM;
  return (
    <g>
      <path d={`M ${p.frontLeft} ${p.front} L ${p.frontRight} ${p.front} L ${p.frontRight} ${p.front + p.face} L ${p.frontLeft} ${p.front + p.face} Z`} fill={face} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      <path d={platformPath()} fill={top} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      <path d={`M ${p.frontLeft + 8} ${p.front - 6} L ${p.frontRight - 8} ${p.front - 6}`} stroke={edge} strokeWidth={8} strokeLinecap="round" />
      {speckle &&
        Array.from({ length: 30 }, (_, index) => {
          const u = hash01(index + 11);
          const v = hash01(index + 23);
          const y = p.back + v * (p.front - p.back);
          const left = p.backLeft + (p.frontLeft - p.backLeft) * v;
          const right = p.backRight + (p.frontRight - p.backRight) * v;
          return <circle key={index} cx={left + u * (right - left)} cy={y} r={3 + v * 2} fill={speckle} opacity={0.6} />;
        })}
      {children}
    </g>
  );
}

/** Static, so memo keeps it out of the per-frame render. */
const KitchenStage = memo(function KitchenStage() {
  return (
    <>
      <rect width={1920} height={1080} fill="#5A1F1A" />
      <rect width={1920} height={700} fill="#6E2620" />
      {Array.from({ length: 16 }, (_, index) => (
        <line key={`v${index}`} x1={index * 128 + 20} y1={0} x2={index * 128 + 20} y2={700} stroke="#80322A" strokeWidth={6} />
      ))}
      {Array.from({ length: 6 }, (_, index) => (
        <line key={`h${index}`} x1={0} y1={index * 128 + 40} x2={1920} y2={index * 128 + 40} stroke="#80322A" strokeWidth={6} />
      ))}
      {/* The giant toaster, back right. */}
      <g transform="translate(1440 200)">
        <rect x={0} y={60} width={420} height={420} rx={80} fill="#CFC8BC" stroke={INK} strokeWidth={8} />
        <rect x={70} y={44} width={110} height={34} rx={14} fill={INK} />
        <rect x={240} y={44} width={110} height={34} rx={14} fill={INK} />
        <rect x={34} y={100} width={44} height={330} rx={20} fill="#ffffff" opacity={0.35} />
        <rect x={420} y={180} width={34} height={90} rx={12} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={6} />
      </g>
      {/* The sink tap, back left. */}
      <g transform="translate(150 260)">
        <path d="M 60 440 L 60 120 C 60 30 220 30 220 120 L 220 170" fill="none" stroke={INK} strokeWidth={46} strokeLinecap="round" />
        <path d="M 60 440 L 60 120 C 60 30 220 30 220 120 L 220 170" fill="none" stroke="#C9C2B8" strokeWidth={32} strokeLinecap="round" />
        <path d="M 48 400 L 48 130" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" opacity={0.4} />
      </g>
      {/* The counter's far run and the cabinets below the platform. */}
      <rect x={0} y={690} width={1920} height={390} fill="#3A1814" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect key={index} x={30 + index * 320} y={880} width={290} height={200} rx={16} fill="#47201A" stroke="#2A100D" strokeWidth={6} />
      ))}
      <Platform top={TOY.bone.hex} edge="#ffffff" face={TOY.bone.dark} speckle={TOY.sand.dark} />
    </>
  );
});

/** The garage behind its lamp and ripples. Static, so memo keeps it out of the per-frame render. */
const GarageBack = memo(function GarageBack() {
  return (
    <>
      <defs>
        <linearGradient id="sft-st-garage" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081C20" />
          <stop offset="1" stopColor="#174347" />
        </linearGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#sft-st-garage)" />
      {Array.from({ length: 9 }, (_, index) => (
        <rect key={index} x={240} y={120 + index * 56} width={1440} height={30} rx={8} fill="#0C272B" />
      ))}
      {/* The dead sedan. */}
      <path d="M 1300 690 C 1306 610 1380 580 1470 574 L 1540 510 C 1590 484 1720 484 1770 516 L 1830 574 C 1890 580 1920 610 1920 690 Z" fill="#06171A" />
      <circle cx={1440} cy={690} r={56} fill="#030C0D" />
      {/* Ankle-deep water, everywhere. */}
      <rect x={0} y={700} width={1920} height={380} fill={mixHex("#174347", TOY.teal.hex, 0.55)} />
    </>
  );
});

/** The garage's platform, over the ripples. Static, so memo keeps it out of the per-frame render. */
const GarageFront = memo(function GarageFront() {
  return (
    <Platform top={TOY.cocoa.hex} edge={mixHex(TOY.cocoa.hex, "#ffffff", 0.3)} face={TOY.cocoa.dark}>
      {Array.from({ length: 6 }, (_, index) => {
        const v = (index + 1) / 7;
        const y = PLATFORM.back + v * (PLATFORM.front - PLATFORM.back);
        return <path key={index} d={`M ${PLATFORM.backLeft + (PLATFORM.frontLeft - PLATFORM.backLeft) * v + 6} ${y} L ${PLATFORM.backRight + (PLATFORM.frontRight - PLATFORM.backRight) * v - 6} ${y}`} stroke={TOY.cocoa.dark} strokeWidth={4} />;
      })}
    </Platform>
  );
});

function GarageStage({ t }: { t: number }) {
  const light = flicker(t, 3);
  return (
    <>
      <GarageBack />
      <ellipse cx={960} cy={90} rx={520} ry={120} fill="#BFFFF1" opacity={0.14 * light} />
      <rect x={700} y={62} width={520} height={26} rx={13} fill="#E8FFF9" opacity={light} />
      {Array.from({ length: 10 }, (_, index) => (
        <path
          key={index}
          d={`M ${((index * 260 + t * 40) % 2100) - 120} ${730 + (index % 4) * 80} q 40 -14 80 0 t 80 0`}
          fill="none"
          stroke={TOY.mint.hex}
          strokeWidth={6}
          strokeLinecap="round"
          opacity={0.5}
        />
      ))}
      <GarageFront />
    </>
  );
}

/** The rooftop behind its laundry. Static, so memo keeps it out of the per-frame render. */
const RooftopBack = memo(function RooftopBack() {
  return (
    <>
      <defs>
        <linearGradient id="sft-st-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1A1129" />
          <stop offset="0.5" stopColor="#6B2738" />
          <stop offset="0.72" stopColor={TOY.tangerine.hex} />
        </linearGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#sft-st-roof)" />
      {[
        [0, 520, 220],
        [200, 430, 160],
        [340, 560, 240],
        [560, 470, 150],
        [700, 380, 200],
        [880, 540, 170],
        [1040, 450, 230],
        [1260, 500, 160],
        [1400, 400, 220],
        [1610, 520, 180],
        [1780, 460, 160],
      ].map(([x, y, w]) => (
        <g key={x}>
          <rect x={x} y={y} width={w} height={800 - y} fill="#120A18" />
          {Array.from({ length: 4 }, (_, index) => (
            <rect key={index} x={x + 24 + (index % 2) * 60} y={y + 40 + Math.floor(index / 2) * 70} width={26} height={34} fill={TOY.butter.hex} opacity={hash01(x + index) > 0.5 ? 0.55 : 0.12} />
          ))}
        </g>
      ))}
      {/* The water tower. */}
      <g transform="translate(180 220)">
        <path d="M 20 420 L 40 200 M 220 420 L 200 200 M 80 420 L 86 200 M 160 420 L 154 200" stroke="#0E0712" strokeWidth={16} />
        <path d="M 10 200 L 230 200 L 220 60 C 180 30 60 30 20 60 Z" fill="#26162A" stroke="#0E0712" strokeWidth={8} />
        <path d="M 4 62 L 120 -20 L 236 62 Z" fill="#26162A" stroke="#0E0712" strokeWidth={8} strokeLinejoin="round" />
      </g>
      <path d="M 1240 300 Q 1520 380 1800 290" fill="none" stroke="#0E0712" strokeWidth={6} />
    </>
  );
});

/** The roof deck and platform, in front of the laundry. Static, so memo keeps it out of the per-frame render. */
const RooftopFront = memo(function RooftopFront() {
  return (
    <>
      <rect x={0} y={700} width={1920} height={380} fill="#2A2830" />
      <Platform top={TOY.charcoal.hex} edge="#6A6873" face="#26252A" speckle="#77757F" />
    </>
  );
});

function RooftopStage({ t }: { t: number }) {
  return (
    <>
      <RooftopBack />
      {/* Laundry, in the night wind. */}
      {[
        [1330, TOY.butter.hex],
        [1480, TOY.teal.hex],
        [1640, TOY.bubblegum.hex],
      ].map(([x, color], index) => {
        const sway = Math.sin(t * 2.6 + index) * 7;
        const y = 326 + Math.sin((Number(x) - 1240) / 180) * 18;
        return (
          <rect key={x} x={Number(x) - 50} y={y} width={100} height={120} rx={18} fill={String(color)} stroke={INK} strokeWidth={6} transform={`rotate(${sway} ${x} ${y})`} />
        );
      })}
      <RooftopFront />
    </>
  );
}

/** A whole arena on the board, platform included. */
export function ArenaStage({ id, t }: { id: ArenaId; t: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} viewBox="0 0 1920 1080" aria-hidden="true">
      {id === "kitchen" && <KitchenStage />}
      {id === "garage" && <GarageStage t={t} />}
      {id === "rooftop" && <RooftopStage t={t} />}
    </svg>
  );
}
