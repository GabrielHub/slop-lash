"use client";

import type { CSSProperties } from "react";
import { useLocalTime } from "@/tutorial/clock";
import { Burst, Shake } from "@/tutorial/kit";
import { SPRINGS, ease, hash01, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { InkPaths, SHARK_DOODLE, TUX_DOODLE } from "../tutorial/doodles";
import { CREAM, FACE, Flash, INK, Spotlight, StarBurst, TOY, jiggle } from "../tutorial/look";
import { Toy } from "../tutorial/toys";
import { penAt, withPenMoves } from "./ink";
import { Motes } from "./parts";
import { HERO } from "./times";

// The hook: a blank page on the easel under the spot, a fat marker scrawls
// the shark in a tuxedo at time-lapse speed, the doodle shivers... and pops,
// tearing the page in two, into the toy fighter Sir Chompsalot.

const CANVAS = 600;
const PAPER = { left: 960 - CANVAS / 2, top: 140 };
/** Board px per doodle unit (the doodle's 0..1000 grid inside the paper's border). */
const UNIT = (CANVAS - 12) / 1000;
const ORIGIN = { x: PAPER.left + 6, y: PAPER.top + 6 };
const STROKES = withPenMoves([...SHARK_DOODLE, ...TUX_DOODLE], 0.3);

const DRAW_FROM = 0.3;
const DRAW_TO = 2.0;
const POP = 2.42;
const LAND = POP + 0.44;
const FLEX = 2.98;

/** The doodle's feet and size on the paper, which the toy takes over at the pop. */
const DOODLE_FEET = ORIGIN.y + 842 * UNIT;
const DOODLE_SCALE = ((842 - 78) * UNIT) / 350;

function board(point: { x: number; y: number }) {
  return { x: ORIGIN.x + point.x * UNIT, y: ORIGIN.y + point.y * UNIT };
}

/** Where the marker touches down first. */
const FIRST_TIP = board(penAt(STROKES, 0).point);

/**
 * A slim felt marker, its nib at (x, y) and its body `angle` degrees clockwise
 * from straight up; cap and band in its ink.
 */
function Marker({ x, y, color, angle }: { x: number; y: number; color: string; angle: number }) {
  return (
    <svg
      className="pointer-events-none absolute"
      width={600}
      height={600}
      viewBox="-300 -560 600 600"
      style={{ left: x - 300, top: y - 560, overflow: "visible" }}
      aria-hidden="true"
    >
      <g transform={`rotate(${angle}) scale(0.8)`}>
        <path d="M -5 -5 Q 0 4 5 -5 L 14 -44 L -14 -44 Z" fill={color} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
        <rect x={-23} y={-88} width={46} height={48} rx={10} fill={TOY.bone.hex} stroke={INK} strokeWidth={8} />
        <rect x={-31} y={-392} width={62} height={308} rx={22} fill={TOY.tangerine.hex} stroke={INK} strokeWidth={9} />
        <rect x={-31} y={-190} width={62} height={40} fill={color} stroke={INK} strokeWidth={7} />
        <rect x={-20} y={-372} width={11} height={264} rx={5.5} fill="#ffffff" opacity={0.35} />
        <rect x={-27} y={-440} width={54} height={60} rx={16} fill={color} stroke={INK} strokeWidth={9} />
      </g>
    </svg>
  );
}

/** The easel's legs and shelf (the paper sits on top). */
function Stand({ drop }: { drop: number }) {
  if (drop >= 1) return null;
  const size = CANVAS;
  const leg = size * 0.36;
  const wood = TOY.cocoa.hex;
  const beam = (d: string, width: number) => (
    <>
      <path d={d} stroke={INK} strokeWidth={width + 13} strokeLinecap="round" />
      <path d={d} stroke={wood} strokeWidth={width} strokeLinecap="round" />
    </>
  );
  return (
    <svg
      className="pointer-events-none absolute"
      width={size}
      height={size + leg}
      viewBox={`0 0 ${size} ${size + leg}`}
      style={{
        left: PAPER.left,
        top: PAPER.top,
        overflow: "visible",
        transformOrigin: `${size / 2}px ${size + leg}px`,
        transform: `translateY(${ease.in(drop) * 760}px) rotate(${drop * 10}deg)`,
      }}
      aria-hidden="true"
    >
      {beam(`M ${size * 0.5} ${-size * 0.06} L ${size * 0.5} ${size + leg * 0.7}`, 14)}
      {[-1, 1].map((side) => (
        <g key={side}>{beam(`M ${size * (0.5 + side * 0.16)} ${size * 0.1} L ${size * (0.5 + side * 0.44)} ${size + leg}`, 17)}</g>
      ))}
      <rect x={-size * 0.05} y={size - 16} width={size * 1.1} height={34} rx={10} fill={wood} stroke={INK} strokeWidth={6} />
    </svg>
  );
}

const TEAR = [
  [53, 0], [47, 11], [55, 23], [46, 36], [54, 49], [45, 62], [53, 75], [46, 88], [51, 100],
] as const;
const LEFT_HALF = `polygon(0% 0%, ${TEAR.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 0% 100%)`;
const RIGHT_HALF = `polygon(${TEAR.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 100% 100%, 100% 0%)`;

function paperStyle(): CSSProperties {
  return {
    left: PAPER.left,
    top: PAPER.top,
    width: CANVAS,
    height: CANVAS,
    background: CREAM,
    border: `6px solid ${INK}`,
    borderRadius: 22,
    boxShadow: "0 30px 50px -24px rgba(0,0,0,0.6)",
  };
}

function Tape() {
  return (
    <>
      {[-1, 1].map((side) => (
        <div
          key={side}
          className="absolute h-[40px] w-[120px]"
          style={{
            left: side < 0 ? PAPER.left - 24 : PAPER.left + CANVAS - 96,
            top: PAPER.top - 14,
            transform: `rotate(${side * 14}deg)`,
            background: "rgba(226, 195, 154, 0.85)",
          }}
        />
      ))}
    </>
  );
}

export function HookShot() {
  const t = useLocalTime();

  // The drawing, at time-lapse speed, with the marker riding the ink.
  const drawn = progress(t, DRAW_FROM, DRAW_TO - DRAW_FROM, ease.inOutSine);
  const pen = penAt(STROKES, drawn);
  const tip = board(pen.point);
  const enter = spring(t + 0.05, { stiffness: 210, damping: 20 });
  const exit = progress(t, DRAW_TO, 0.32, ease.in);
  // The nib leads and the body trails down and right, off the face it has just drawn.
  // It comes in from, and leaves to, the bottom right; a pen-up lifts it back along its body.
  const markerX = (t < DRAW_FROM ? mix(1820, FIRST_TIP.x, enter) : tip.x + exit * 900) + pen.lift * 18;
  const markerY = (t < DRAW_FROM ? mix(1260, FIRST_TIP.y, enter) : tip.y + exit * 760) - pen.lift * 16;
  const markerAngle = 136 + wobble(t * 3, 2) * 4 - pen.lift * 8 - exit * 12;

  // The doodle shivers and swells before it pops.
  const charge = progress(t, DRAW_TO + 0.04, POP - DRAW_TO - 0.04, ease.in);
  const slot = Math.floor(t / 0.035);
  const jx = (hash01(slot) - 0.5) * 22 * charge;
  const jy = (hash01(slot + 0.5) - 0.5) * 16 * charge;
  const popped = t >= POP;

  // The pop: the page tears in two, the stand drops away, the toy springs out and lands.
  const tear = progress(t, POP, 0.6);
  const drop = progress(t, POP, 0.32);
  const fly = progress(t, POP, LAND - POP);
  const landed = t >= LAND;
  const toyY = landed ? HERO.y : mix(DOODLE_FEET, HERO.y, fly) - Math.sin(fly * Math.PI) * 130;
  const toyScale = mix(DOODLE_SCALE, HERO.scale, spring(t - POP, SPRINGS.jelly));
  const stretch = landed ? 0 : -0.2 * Math.abs(Math.cos(fly * Math.PI));
  const squash = stretch + jiggle(t, LAND, 7, 20) * 0.34 + jiggle(t, FLEX, 8, 18) * 0.12;
  const burst = spring(t - POP, SPRINGS.pop) * (1 - progress(t, 3.0, 0.3, ease.in));

  // A slow push in through the drawing, a kick on the pop.
  const push = mix(1, 1.06, progress(t, 0, POP, ease.inOutSine)) + (popped ? 0.04 * Math.exp(-(t - POP) * 5) : 0);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ transformOrigin: "960px 520px", transform: `scale(${push})` }}>
        <Spotlight x={960} width={1080} floor={950} intensity={0.9 + charge * 0.3} />
        <Motes t={t} x={960} width={900} />
        <Shake at={[POP]} strength={24} duration={0.45} className="absolute inset-0">
          <Shake at={[LAND]} strength={10} duration={0.3} className="absolute inset-0">
            <Stand drop={popped ? drop : 0} />
            {popped && burst > 0.01 && (
              <div className="absolute" style={{ left: 960, top: 560 }}>
                <StarBurst size={1180 * burst} color={TOY.butter.hex} rotate={t * 22} seed={7} points={16} />
              </div>
            )}

            {!popped ? (
              <>
                <div
                  className="absolute overflow-hidden"
                  style={{ ...paperStyle(), transform: `translate(${jx * 0.4}px, ${jy * 0.4}px) scale(${1 + charge * 0.03}, ${1 - charge * 0.02})` }}
                >
                  <svg
                    viewBox="0 0 1000 1000"
                    width={CANVAS - 12}
                    height={CANVAS - 12}
                    style={{
                      overflow: "visible",
                      transform: `translate(${jx}px, ${jy}px) scale(${1 + charge * 0.1})`,
                      filter: charge > 0.05 ? `drop-shadow(0 0 ${10 + charge * 24}px rgba(245, 201, 76, ${charge}))` : undefined,
                    }}
                    aria-hidden="true"
                  >
                    <InkPaths strokes={STROKES} progress={drawn} />
                  </svg>
                </div>
                <Tape />
              </>
            ) : (
              tear < 1 &&
              [
                { clip: LEFT_HALF, side: -1 },
                { clip: RIGHT_HALF, side: 1 },
              ].map(({ clip, side }) => (
                <div
                  key={side}
                  className="absolute"
                  style={{
                    ...paperStyle(),
                    clipPath: clip,
                    transformOrigin: `${CANVAS / 2}px ${CANVAS}px`,
                    transform: `translate(${side * ease.out(tear) * 980}px, ${tear * 240 + tear * tear * 760}px) rotate(${side * tear * 48}deg)`,
                  }}
                />
              ))
            )}

            {t > POP - 0.02 && t < POP + 1.5 && (
              <div className="absolute" style={{ left: 960, top: 480 }}>
                <Burst at={POP} count={22} speed={1500} gravity={1900} size={34} colors={[CREAM, CREAM, TOY.butter.hex, TOY.tangerine.hex]} seed={6} />
                <Burst at={POP + 0.02} count={14} speed={1100} gravity={1300} size={30} shape="star" colors={[TOY.butter.hex, FACE]} seed={9} />
              </div>
            )}
            {popped && (
              <Toy
                kind="shark"
                x={HERO.x}
                y={toyY}
                scale={toyScale}
                shadow={landed}
                pose={{
                  mood: !landed ? "wow" : t < FLEX ? "happy" : "smug",
                  squash,
                  lean: landed ? wobble(t, 1) * 2 + (t > FLEX ? 4 : 0) : 0,
                  look: t > FLEX ? 0.3 : 0,
                }}
                extras={{ tux: true, clock: t }}
              />
            )}
          </Shake>
        </Shake>

        {exit < 1 && <Marker x={markerX} y={markerY} color={pen.color} angle={markerAngle} />}
      </div>
      <Flash at={POP} duration={0.3} strength={0.85} />
    </div>
  );
}

