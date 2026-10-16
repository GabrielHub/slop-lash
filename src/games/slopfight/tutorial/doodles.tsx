"use client";

import type { CSSProperties, ReactNode } from "react";
import { clamp } from "@/tutorial/timeline";
import { CREAM, INK, TOY } from "./look";

// Hand-drawn doodles on the cream canvas, in the phone's 0..1000 stroke grid,
// that draw themselves stroke by stroke (stroke-dashoffset from time).

export interface Ink {
  d: string;
  color: string;
  /** Brush width in grid units (the phone's brush is 24). */
  width?: number;
  /** Share of the drawing time this stroke takes. */
  weight?: number;
  opacity?: number;
}

const C = TOY.charcoal.hex;
const BLUE = TOY.ocean.hex;
const RED = TOY.tomato.hex;
const ORANGE = TOY.tangerine.hex;
const PURPLE = TOY.grape.hex;

const circle = (x: number, y: number, r: number) =>
  `M ${x + r} ${y} A ${r} ${r} 0 1 1 ${x - r} ${y} A ${r} ${r} 0 1 1 ${x + r} ${y}`;
const mirror = (points: [number, number][]) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${1000 - x} ${y}`).join(" ");
const poly = (points: [number, number][]) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

const SHARK_HATCH: [number, number][] = [
  [356, 300], [332, 372], [384, 300], [338, 440], [388, 362], [334, 510], [384, 440], [346, 590], [390, 540], [372, 660],
];

/** The shark: Sir Chompsalot as its owner drew it. */
export const SHARK_DOODLE: Ink[] = [
  { d: "M 500 190 C 625 186 690 300 694 450 C 698 610 640 760 500 762 C 360 764 300 612 304 452 C 308 300 372 194 500 190 Z", color: C, weight: 2.6 },
  { d: "M 470 205 C 480 150 520 100 570 78 C 560 130 562 170 580 214", color: C, weight: 0.8 },
  { d: "M 312 470 C 260 480 222 520 206 580 C 250 560 285 552 318 548", color: C, weight: 0.7 },
  { d: "M 688 470 C 740 480 778 520 794 580 C 750 560 715 552 682 548", color: C, weight: 0.7 },
  { d: "M 664 676 C 724 686 772 646 802 596 C 814 656 802 716 772 766 C 742 736 702 726 652 722", color: C, weight: 0.9 },
  { d: "M 420 752 L 418 840 L 472 842 L 470 762", color: C, weight: 0.5 },
  { d: "M 532 762 L 530 842 L 584 840 L 580 752", color: C, weight: 0.5 },
  { d: circle(430, 330, 28), color: C, weight: 0.45 },
  { d: circle(570, 330, 28), color: C, weight: 0.45 },
  { d: "M 436 336 L 438 338 M 576 336 L 578 338", color: C, width: 30, weight: 0.15 },
  { d: "M 392 404 C 440 474 560 474 608 404 C 560 436 440 436 392 404", color: C, weight: 0.8 },
  { d: "M 410 422 L 426 446 L 442 428 L 458 450 L 474 432 L 490 452 L 506 432 L 522 452 L 538 430 L 554 448 L 570 428 L 586 442", color: C, width: 14, weight: 0.8 },
  { d: "M 392 560 C 404 684 596 684 608 560", color: C, weight: 0.6 },
  { d: poly(SHARK_HATCH), color: BLUE, width: 18, weight: 0.9, opacity: 0.9 },
  { d: mirror(SHARK_HATCH), color: BLUE, width: 18, weight: 0.9, opacity: 0.9 },
];

/** "A shark in a tuxedo": what gets drawn on. */
export const TUX_DOODLE: Ink[] = [
  { d: "M 404 470 C 426 528 458 594 486 662", color: C, width: 20, weight: 0.5 },
  { d: "M 596 470 C 574 528 542 594 514 662", color: C, width: 20, weight: 0.5 },
  { d: "M 500 500 L 444 472 L 446 532 Z", color: RED, width: 18, weight: 0.5 },
  { d: "M 500 500 L 556 472 L 554 532 Z", color: RED, width: 18, weight: 0.5 },
  { d: "M 456 486 L 458 518 L 472 494 L 474 514 M 544 486 L 542 518 L 528 494 L 526 514", color: RED, width: 14, weight: 0.4 },
  { d: "M 500 586 L 502 588 M 500 630 L 502 632", color: C, width: 26, weight: 0.2 },
];

const TOASTER_HATCH: [number, number][] = [
  [330, 300], [326, 380], [356, 300], [330, 460], [360, 380], [330, 560], [360, 470], [334, 680], [362, 600], [348, 724],
];

/** "A toaster with anger issues". */
export const TOASTER_DOODLE: Ink[] = [
  { d: "M 300 330 C 300 290 320 270 360 270 L 640 270 C 680 270 700 290 700 330 L 700 690 C 700 730 680 750 640 750 L 360 750 C 320 750 300 730 300 690 Z", color: C, weight: 2.4 },
  { d: "M 350 270 L 352 190 C 354 156 440 156 444 190 L 446 270", color: C, weight: 0.7 },
  { d: "M 556 270 L 554 168 C 556 132 644 132 648 168 L 650 270", color: C, weight: 0.7 },
  { d: "M 700 450 L 762 450 L 762 484 L 700 484", color: C, weight: 0.4 },
  { d: circle(420, 460, 34), color: C, weight: 0.45 },
  { d: circle(580, 460, 34), color: C, weight: 0.45 },
  { d: "M 426 470 L 428 472 M 586 470 L 588 472", color: C, width: 34, weight: 0.15 },
  { d: "M 420 580 L 580 580 L 580 634 L 420 634 Z M 460 580 L 460 634 M 500 580 L 500 634 M 540 580 L 540 634", color: C, width: 18, weight: 1.1 },
  { d: "M 384 750 L 384 834 L 432 834 M 616 750 L 616 834 L 568 834", color: C, weight: 0.6 },
  { d: "M 300 520 C 246 522 222 560 214 604", color: C, weight: 0.4 },
  { d: circle(208, 628, 26), color: C, weight: 0.35 },
  { d: "M 700 540 C 754 542 778 580 786 624", color: C, weight: 0.4 },
  { d: circle(792, 648, 26), color: C, weight: 0.35 },
  { d: poly(TOASTER_HATCH), color: RED, width: 18, weight: 0.8, opacity: 0.9 },
  { d: mirror(TOASTER_HATCH), color: RED, width: 18, weight: 0.8, opacity: 0.9 },
];

/** The anger: eyebrows, then steam, then a vein. */
export const TOASTER_BROWS: Ink[] = [
  { d: "M 360 372 L 466 418", color: C, width: 30, weight: 0.5 },
  { d: "M 640 372 L 534 418", color: C, width: 30, weight: 0.5 },
];
export const TOASTER_STEAM: Ink[] = [
  { d: "M 398 130 C 376 106 420 84 398 58 C 378 36 418 18 400 -6", color: PURPLE, width: 16, weight: 0.6 },
  { d: "M 600 112 C 578 88 622 66 600 40 C 580 18 620 0 602 -24", color: PURPLE, width: 16, weight: 0.6 },
  { d: "M 774 232 L 806 204 M 790 268 L 836 262 M 760 196 L 762 156", color: RED, width: 18, weight: 0.5 },
];

/** Upgrade layers, drawn on over the faded shark. */
export const HAT_DOODLE: Ink[] = [
  { d: "M 372 202 C 440 184 560 184 628 202", color: C, width: 26, weight: 0.6 },
  { d: "M 412 194 L 422 66 C 474 54 526 54 578 66 L 588 194", color: C, width: 26, weight: 1 },
  { d: "M 418 156 C 472 144 528 144 582 156", color: RED, width: 30, weight: 0.5 },
];
export const JETPACK_DOODLE: Ink[] = [
  { d: "M 236 322 C 236 274 296 274 296 322 L 296 528 C 296 574 236 574 236 528 Z", color: C, weight: 0.9 },
  { d: "M 764 322 C 764 274 704 274 704 322 L 704 528 C 704 574 764 574 764 528 Z", color: C, weight: 0.9 },
  { d: "M 246 584 L 266 680 L 286 584 M 714 584 L 734 680 L 754 584", color: ORANGE, width: 26, weight: 0.6 },
  { d: "M 296 372 L 352 404 M 704 372 L 648 404", color: C, width: 18, weight: 0.3 },
];
export const HEAD_DOODLE: Ink[] = [
  { d: circle(778, 214, 104), color: C, weight: 1.2 },
  { d: `${circle(742, 196, 16)} ${circle(812, 196, 16)}`, color: C, width: 18, weight: 0.4 },
  { d: "M 716 252 L 732 272 L 748 254 L 764 274 L 780 254 L 796 274 L 812 254 L 830 270", color: C, width: 16, weight: 0.5 },
  { d: "M 760 112 C 770 80 790 60 820 50", color: BLUE, width: 20, weight: 0.3 },
];

/** Total drawing weight of a doodle. */
export function inkWeight(strokes: readonly Ink[]): number {
  return strokes.reduce((sum, stroke) => sum + (stroke.weight ?? 1), 0);
}

/**
 * The strokes as SVG paths, drawn up to `progress` (0..1 over the whole
 * doodle, stroke by stroke, each taking its share of the time).
 */
export function InkPaths({
  strokes,
  progress = 1,
  opacity = 1,
}: {
  strokes: readonly Ink[];
  progress?: number;
  opacity?: number;
}) {
  const total = inkWeight(strokes);
  const starts = strokes.map((_, index) => inkWeight(strokes.slice(0, index)));
  return (
    <g opacity={opacity}>
      {strokes.map((stroke, index) => {
        const weight = stroke.weight ?? 1;
        const from = starts[index];
        const p = clamp((progress * total - from) / weight);
        if (p <= 0.001) return null;
        const partial = p < 0.999;
        return (
          <path
            key={index}
            d={stroke.d}
            fill="none"
            stroke={stroke.color}
            strokeOpacity={stroke.opacity}
            strokeWidth={stroke.width ?? 24}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={partial ? "1 1.01" : undefined}
            strokeDashoffset={partial ? 1 - p : undefined}
          />
        );
      })}
    </g>
  );
}

/** A drawing on its own: layers of strokes in a square `size` px wide. */
export function Doodle({
  layers,
  size,
  className = "",
  style,
  children,
}: {
  layers: { strokes: readonly Ink[]; progress?: number; opacity?: number }[];
  size: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      width={size}
      height={size}
      className={className}
      style={{ overflow: "visible", ...style }}
      aria-hidden="true"
    >
      {layers.map((layer, index) => (
        <InkPaths key={index} strokes={layer.strokes} progress={layer.progress} opacity={layer.opacity} />
      ))}
      {children}
    </svg>
  );
}

/**
 * The stage easel: a cream canvas taped to a board on wooden legs. `size` is
 * the canvas edge; legs hang below it.
 */
export function Easel({
  size,
  children,
  legs = true,
  tilt = 0,
}: {
  size: number;
  children?: ReactNode;
  legs?: boolean;
  tilt?: number;
}) {
  const wood = TOY.cocoa.hex;
  const legLength = size * 0.36;
  return (
    <div className="relative" style={{ width: size, height: size, transform: `rotate(${tilt}deg)` }}>
      {legs && (
        <svg
          className="absolute left-0 top-0"
          width={size}
          height={size + legLength}
          viewBox={`0 0 ${size} ${size + legLength}`}
          style={{ overflow: "visible" }}
          aria-hidden="true"
        >
          <path
            d={`M ${size * 0.5} ${-size * 0.06} L ${size * 0.5} ${size + legLength * 0.7}`}
            stroke={INK}
            strokeWidth={26}
            strokeLinecap="round"
          />
          <path
            d={`M ${size * 0.5} ${-size * 0.06} L ${size * 0.5} ${size + legLength * 0.7}`}
            stroke={wood}
            strokeWidth={14}
            strokeLinecap="round"
          />
          {[-1, 1].map((side) => (
            <g key={side}>
              <path
                d={`M ${size * (0.5 + side * 0.16)} ${size * 0.1} L ${size * (0.5 + side * 0.44)} ${size + legLength}`}
                stroke={INK}
                strokeWidth={30}
                strokeLinecap="round"
              />
              <path
                d={`M ${size * (0.5 + side * 0.16)} ${size * 0.1} L ${size * (0.5 + side * 0.44)} ${size + legLength}`}
                stroke={wood}
                strokeWidth={17}
                strokeLinecap="round"
              />
            </g>
          ))}
          <rect x={-size * 0.05} y={size - 16} width={size * 1.1} height={34} rx={10} fill={wood} stroke={INK} strokeWidth={6} />
        </svg>
      )}
      <div
        className="absolute inset-0 overflow-hidden rounded-[22px]"
        style={{
          background: CREAM,
          border: `6px solid ${INK}`,
          boxShadow: "0 30px 50px -24px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
      {[-1, 1].map((side) => (
        <div
          key={side}
          className="absolute top-[-14px] h-[40px] w-[120px]"
          style={{
            left: side < 0 ? -24 : size - 96,
            transform: `rotate(${side * 14}deg)`,
            background: "rgba(226, 195, 154, 0.82)",
            boxShadow: "0 2px 0 rgba(0,0,0,0.08)",
          }}
        />
      ))}
    </div>
  );
}
