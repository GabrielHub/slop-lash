"use client";

import { useTime } from "@/tutorial/clock";
import { Burst, STAMP_IMPACT, Stamp, flight, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, spring } from "@/tutorial/timeline";
import { MATCHSLOP_DATE_LINE, MATCHSLOP_MOOD_THRESHOLD_UNMATCH } from "../types";
import { COPY, endingOf, heartDelta } from "../ui/copy";
import { REACTIONS } from "../tutorial/data";
import { C, Heart, alpha, fin, fout, sp, tf } from "../tutorial/fx";
import { moodColor } from "../tutorial/parts";
import { HEART_SPOT, T } from "./beatsheet";

const METER = { left: 260, width: 1400, y: 600, track: 104 };
const markerX = (mood: number) => METER.left + (METER.width * mood) / 100;
const MARKER = 250;
const SIGN_HEART = 330;
/** Where the mood starts: a few good rounds in, one great line from the date. */
const FROM = 65;
const GREAT = REACTIONS[0];
const TO = FROM + GREAT.delta;
const MOOD_SPRING = { stiffness: 170, damping: 14, mass: 1 };
const CHIP = { x: 960, y: 290 };
const DATE_STAMP = { x: 960, y: 292 };

/** The mood at `t`: it springs up when the chip lands. */
function moodAt(t: number): number {
  return mix(FROM, TO, spring(t - T.land, MOOD_SPRING));
}

/** When the swing first crosses the date line. */
const CROSS = T.land + 0.12;

/**
 * The mood: the heart meter rises in, a "😍 +15" drops into its heart, the
 * heart swings over the date line, and "It's a date" lands. On the slate cue
 * the meter falls away and its heart flies up to become the neon sign's.
 */
export function Mood() {
  const t = useTime();
  const mood = moodAt(t);
  const color = moodColor(mood);
  const leave = fin(t, T.slate, 0.24, ease.in);
  const pulse = Math.max(0, 1 - Math.abs(t - CROSS - 0.08) / 0.22);
  const shake = shakeOffset(t, T.dateStamp + STAMP_IMPACT, 10, 0.3);
  const lines = [
    { at: MATCHSLOP_MOOD_THRESHOLD_UNMATCH, label: COPY.unmatchLabel, color: C.red, size: 68, beat: 0 },
    { at: MATCHSLOP_DATE_LINE, label: COPY.dateLabel, color: C.mint, size: 84, beat: pulse },
  ];

  // The chip: pops in, then arcs down into the heart.
  const chipPop = sp(t, T.chip, SPRINGS.pop);
  const chipPath = flight(t, {
    at: T.chipFly,
    duration: T.land - T.chipFly,
    from: CHIP,
    to: { x: markerX(FROM), y: METER.y },
    lift: 120,
    easing: ease.in,
  });
  const chipShown = t >= T.chip && t < T.land;

  // The heart: a squash on landing, then its flight up to the sign.
  const squash = Math.max(0, 1 - Math.abs(t - T.land - 0.05) / 0.14);
  const rise = sp(t, T.slate, SPRINGS.smooth);
  const heartX = mix(markerX(mood) + shake.x, HEART_SPOT.x, rise);
  const heartY = mix(METER.y + shake.y, HEART_SPOT.y, rise);
  const heartSize = mix(MARKER, SIGN_HEART, rise) * (1 + squash * 0.18 + pulse * 0.08);
  const heartFill = fout(t, T.strike + 0.02, 0.12);

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ opacity: 1 - leave, transform: `translate(${shake.x}px, ${shake.y + leave * 80}px)` }}
      >
        {/* The track, its zones and its two lines. */}
        <div
          className="absolute overflow-hidden rounded-full bg-raised"
          style={{
            left: METER.left,
            top: METER.y - METER.track / 2,
            width: METER.width,
            height: METER.track,
            boxShadow: "inset 0 0 0 4px var(--edge-strong), inset 0 8px 18px rgba(0,0,0,0.25)",
          }}
        >
          <span className="absolute inset-y-0 left-0 w-[20%] bg-fail/15" />
          <span className="absolute inset-y-0 right-0 w-[20%] bg-win/20" />
          <span
            className="absolute inset-y-[9px] left-[9px] rounded-full"
            style={{
              width: `calc(${mood}% - 18px)`,
              background: `linear-gradient(180deg, color-mix(in oklab, ${color} 70%, var(--ms-ink)), ${color} 55%)`,
              boxShadow: `0 0 ${30 + pulse * 40}px ${alpha(color, 75)}`,
            }}
          />
        </div>
        {lines.map((line) => (
          <div
            key={line.label}
            className="absolute flex flex-col items-center"
            style={{ left: markerX(line.at), top: METER.y - 110, transform: "translateX(-50%)" }}
          >
            <span
              className="block rounded-full"
              style={{
                width: 14,
                height: 220,
                background: line.color,
                transform: `scaleX(${1 + line.beat * 0.9})`,
                boxShadow: `0 0 ${12 + line.beat * 40}px ${alpha(line.color, 60 + line.beat * 40)}`,
              }}
            />
            <span
              className="mt-[14px] whitespace-nowrap font-display font-black uppercase leading-none tracking-[0.06em]"
              style={{ fontSize: line.size, color: line.color, transform: `scale(${1 + line.beat * 0.2})` }}
            >
              {line.label}
            </span>
          </div>
        ))}

        {/* "It's a date". */}
        <div className="absolute left-0 top-0" style={{ transform: `translate(${DATE_STAMP.x}px, ${DATE_STAMP.y}px)` }}>
          <div className="-translate-x-1/2 -translate-y-1/2">
            <Stamp worn text={endingOf("DATE").text} tone="win" at={T.dateStamp} rotate={-8} size={124} out={T.slate - 0.12} />
          </div>
        </div>
      </div>

      {/* The reaction's hearts, dropping in. */}
      {chipShown && (
        <div
          className="absolute left-0 top-0"
          style={{ transform: tf(chipPath.x, chipPath.y, chipPop * mix(1, 0.5, chipPath.progress)) }}
        >
          <span
            className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-[0.25em] whitespace-nowrap rounded-full border-[5px] border-current bg-surface px-[0.5em] py-[0.16em] font-mono font-bold leading-none text-win"
            style={{ fontSize: 100, boxShadow: `0 20px 40px -20px rgba(0,0,0,0.6), 0 0 40px ${alpha(C.mint, 35)}` }}
          >
            <span className="text-[1.1em] leading-none">{GREAT.emoji}</span>
            {heartDelta(GREAT.delta)}
          </span>
        </div>
      )}

      {/* The heart marker, which becomes the sign's heart. */}
      <div className="absolute left-0 top-0" style={{ transform: tf(heartX, heartY) }}>
        <div className="absolute left-0 top-0" style={{ opacity: heartFill }}>
          <div
            className="relative grid -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ width: heartSize, height: heartSize }}
          >
            <Heart
              size={heartSize}
              color={color}
              className="absolute inset-0"
              style={{
                filter: `drop-shadow(0 10px 20px rgba(0,0,0,0.4)) drop-shadow(0 0 ${20 + pulse * 30}px ${alpha(color, 65)})`,
              }}
            />
            <span
              className="relative -mt-[18px] font-mono font-bold tabular-nums leading-none text-accent-ink"
              style={{ fontSize: 84, opacity: fout(t, T.slate, 0.15) }}
            >
              {Math.round(clamp(mood, 0, 100))}
            </span>
          </div>
        </div>
      </div>
      <div className="absolute" style={{ left: markerX(MATCHSLOP_DATE_LINE), top: METER.y }}>
        <Burst
          at={CROSS}
          count={22}
          shape="heart"
          size={52}
          speed={1100}
          gravity={1300}
          colors={[C.mint, C.rose, C.mint, C.coral]}
          seed={41}
        />
      </div>
    </>
  );
}
