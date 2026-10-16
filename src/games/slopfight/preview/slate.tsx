"use client";

import { useLocalTime } from "@/tutorial/clock";
import { Burst, Shake } from "@/tutorial/kit";
import { SPRINGS, ease, hash01, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { FACE, INK, NIGHT, SLAM_IMPACT, Slam, Spotlight, TOY, jiggle } from "../tutorial/look";
import { Toy } from "../tutorial/toys";
import { Poof, Rays, label } from "./parts";

// The end slate: in the dark, the spot snaps on the champion holding the
// trophy, SLOPFIGHT slams down, the line pops in under it, and Crumb Lord
// falls back out of the sky and sticks in the floor head first.

const LOGO = 0.3;
const LINE = 0.72;
const FALL = 1.05;
const CRASH = 1.32;
const SHARK = { x: 540, y: 990, scale: 1.22 };
/** Crumb Lord's landing spot: big and near, in the corner under the line. */
const TOASTER = { x: 1585, y: 1032, scale: 1.45 };
/** How far its head goes into the floor, in toy units. */
const SUNK = 64;
/** The hole's half-width and half-depth on the floor. */
const HOLE = { rx: 150 * TOASTER.scale, ry: 26 };

/** The spot snapping on: on, a stutter, then up for good. */
function spotOn(t: number): number {
  if (t < 0.06) return 0;
  if (t < 0.11) return 0.9;
  if (t < 0.17) return 0.15;
  return 0.4 + 0.6 * progress(t, 0.17, 0.12, ease.out);
}

/** Rubble kicked up around the hole: chunks that pop out and settle on the rim. */
const RUBBLE = Array.from({ length: 7 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const reach = 0.85 + hash01(index + 21) * 0.5;
  return {
    dx: side * HOLE.rx * reach * (0.6 + 0.4 * hash01(index + 5)),
    dy: (hash01(index + 11) - 0.35) * HOLE.ry * 2.2,
    r: 14 + hash01(index + 2) * 14,
    turn: hash01(index + 7) * 360,
  };
});

/** The hole Crumb Lord's head went into: the dark back (drawn behind it) or the lit front lip and rubble (in front). */
function Hole({ t, front }: { t: number; front: boolean }) {
  const open = spring(t - CRASH, { stiffness: 520, damping: 18 });
  if (t < CRASH) return null;
  const { x, y } = TOASTER;
  if (!front) {
    return (
      <svg className="pointer-events-none absolute left-0 top-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
        <ellipse cx={x} cy={y} rx={HOLE.rx * open} ry={HOLE.ry * open} fill="#050203" stroke={INK} strokeWidth={8} />
      </svg>
    );
  }
  return (
    <svg className="pointer-events-none absolute left-0 top-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
      {/* The near lip, catching the spot. */}
      <path
        d={`M ${x - HOLE.rx * open} ${y} A ${HOLE.rx * open} ${HOLE.ry * open} 0 0 0 ${x + HOLE.rx * open} ${y}`}
        fill="none"
        stroke="rgba(255, 214, 160, 0.55)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      {RUBBLE.map((chunk, index) => {
        const land = spring(t - CRASH - 0.02 * index, { stiffness: 300, damping: 14 });
        const arc = Math.sin(Math.min(1, land) * Math.PI) * 50;
        return (
          <rect
            key={index}
            x={-chunk.r / 2}
            y={-chunk.r / 2}
            width={chunk.r}
            height={chunk.r * 0.8}
            rx={4}
            fill="#6B4E57"
            stroke={INK}
            strokeWidth={4}
            transform={`translate(${x + chunk.dx * land} ${y + chunk.dy * land - arc}) rotate(${chunk.turn + land * 90})`}
          />
        );
      })}
    </svg>
  );
}

function Glint({ t, at }: { t: number; at: number }) {
  const p = progress(t, at, 0.55, ease.inOut);
  if (p <= 0 || p >= 1) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: mix(380, 1500, p),
        top: 70,
        width: 80,
        height: 280,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
        transform: "skewX(-20deg)",
        mixBlendMode: "screen",
      }}
    />
  );
}

export function SlateShot() {
  const t = useLocalTime();
  const light = spotOn(t);
  const trophy = spring(t - 0.12, SPRINGS.jelly);
  const line = spring(t - LINE, { stiffness: 380, damping: 15 });
  const fall = progress(t, FALL, CRASH - FALL, ease.in);
  const crashed = t >= CRASH;
  // Its feet: upside down, the head ends up SUNK units below the floor.
  const sunkY = TOASTER.y + SUNK * TOASTER.scale;
  const toasterY = crashed ? sunkY : mix(-300, sunkY, fall);
  const look = t > CRASH + 0.15 ? 0.6 : -0.2;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: NIGHT }}>
      <div className="absolute inset-0" style={{ opacity: light }}>
        <Rays t={t} x={SHARK.x} y={620} opacity={0.22 * progress(t, 0.2, 0.4)} size={2300} />
        <Spotlight x={SHARK.x} width={860} floor={SHARK.y} intensity={1} sway={0.8} />
        <Spotlight x={TOASTER.x} width={620} floor={TOASTER.y} intensity={0.7 * progress(t, CRASH + 0.18, 0.06)} />
      </div>
      <Shake at={[CRASH]} strength={12} duration={0.3} className="absolute inset-0">
        <Shake at={[LOGO + SLAM_IMPACT]} strength={18} duration={0.4} className="absolute inset-0">
          <div className="absolute inset-0" style={{ filter: light < 0.99 ? `brightness(${0.15 + light * 0.85})` : undefined }}>
            <Toy
              kind="shark"
              x={SHARK.x}
              y={SHARK.y}
              scale={SHARK.scale}
              pose={{
                mood: t > CRASH + 0.15 ? "smug" : "wow",
                look,
                lean: wobble(t, 1) * 2 + 3,
                squash: jiggle(t, LOGO + SLAM_IMPACT, 7, 18) * 0.12 + jiggle(t, CRASH, 7, 20) * 0.08,
              }}
              extras={{ tux: true, trophy: t > 0.12 ? trophy : 0, clock: t }}
            />
          </div>
          <Hole t={t} front={false} />
          {t > FALL && (
            // Clipped at the hole's near lip, so the head is down in the floor.
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 ${1080 - TOASTER.y - HOLE.ry}px 0)` }}>
              <Toy
                kind="toaster"
                x={TOASTER.x}
                y={toasterY}
                scale={TOASTER.scale}
                shadow={false}
                pose={{
                  flip: true,
                  mood: crashed ? "dizzy" : "ko",
                  spin: 180 + (crashed ? Math.sin((t - CRASH) * 11) * 9 * Math.exp(-(t - CRASH) * 1.6) + wobble(t, 6) * 3 : -fall * 40),
                  squash: crashed ? jiggle(t, CRASH, 7, 22) * 0.3 : -0.12,
                }}
                extras={{ clock: t }}
              />
            </div>
          )}
          <Hole t={t} front />
          <Poof t={t} at={CRASH} x={TOASTER.x} y={TOASTER.y - 10} scale={1.2} />
          {t > LOGO && t < LOGO + 1.6 && (
            <div className="absolute" style={{ left: 960, top: 220 }}>
              <Burst at={LOGO + SLAM_IMPACT} count={30} speed={1300} gravity={1500} size={24} colors={[TOY.tangerine.hex, TOY.butter.hex, TOY.teal.hex, FACE]} seed={3} />
            </div>
          )}
          <Slam text="SlopFight" at={LOGO} x={1010} y={215} size={230} rotate={-3} tone="tangerine" />
        </Shake>
      </Shake>
      <Glint t={t} at={LOGO + 0.55} />

      {/* The line: two beats of three words, under the logo. */}
      {t > LINE && (
        <div
          className="pointer-events-none absolute flex flex-col items-center gap-[14px]"
          style={{ left: 1170, top: 372, transform: `translate(-50%, 0) rotate(-2deg) scale(${line})` }}
        >
          <span className="rounded-[16px] px-[28px] pb-[10px] pt-[14px]" style={{ ...label(80), background: TOY.tomato.hex, border: `6px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, textShadow: undefined }}>
            Doodle a fighter.
          </span>
          <span className="rounded-[16px] px-[28px] pb-[10px] pt-[14px]" style={{ ...label(80, INK), background: TOY.butter.hex, border: `6px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, WebkitTextStroke: undefined, textShadow: undefined, transform: `scale(${spring(t - LINE - 0.18, { stiffness: 380, damping: 15 })})` }}>
            Watch it brawl.
          </span>
        </div>
      )}
    </div>
  );
}
