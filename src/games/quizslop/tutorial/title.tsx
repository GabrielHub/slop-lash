"use client";

import { useLocalTime } from "@/tutorial/clock";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { MarqueeSign, Spotlight } from "./parts";

/**
 * The show's marquee: "QuizSlop" in a bulb-lit sign, letters dropping in one
 * by one. Used by the sting and again by the outro.
 */
export function TitleSign({
  at,
  flashAt = [],
  kicker = "How to play",
  width = 1180,
  height = 330,
}: {
  /** Local seconds the sign starts powering up. */
  at: number;
  /** Local seconds every bulb blazes for a beat. */
  flashAt?: readonly number[];
  kicker?: string;
  width?: number;
  height?: number;
}) {
  const t = useLocalTime();
  const power = progress(t, at + 0.05, 0.75, ease.inOut);
  const flash = Math.max(
    0,
    ...flashAt.map((time) => (t >= time ? 1 - progress(t, time + 0.12, 0.5, ease.out) : 0)),
  );
  const pop = Math.max(0, ...flashAt.map((time) => (t >= time ? Math.sin(clamp((t - time) / 0.35) * Math.PI) : 0)));
  const sign = spring(t - at, SPRINGS.smooth);
  const letters = "QuizSlop".split("");
  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        transform: `scale(${mix(0.82, 1, sign) * (1 + pop * 0.035)})`,
        opacity: progress(t, at, 0.2),
      }}
    >
      <p
        className="mb-[26px] font-display text-[36px] font-extrabold uppercase tracking-[0.34em] text-teal"
        style={{
          opacity: progress(t, at + 0.9, 0.3),
          transform: `translateY(${(1 - progress(t, at + 0.9, 0.4, ease.out)) * 20}px)`,
        }}
      >
        {kicker}
      </p>
      <MarqueeSign width={width} height={height} power={power} chase={1.5} flash={flash}>
        <span
          className="flex font-display font-black leading-none tracking-[-0.01em] text-gold qs-marquee-text"
          style={{ fontSize: height * 0.56 }}
          aria-label="QuizSlop"
        >
          {letters.map((letter, index) => {
            const start = at + 0.45 + index * 0.055;
            const drop = spring(t - start, SPRINGS.slam);
            return (
              <span
                key={index}
                aria-hidden="true"
                className="inline-block"
                style={{
                  transform: `translateY(${(1 - drop) * -120}px) scale(${mix(1.25, 1, drop)})`,
                  opacity: progress(t, start, 0.08),
                }}
              >
                {letter}
              </span>
            );
          })}
        </span>
      </MarqueeSign>
    </div>
  );
}

/**
 * Two stage lights hung above the board: they swing in crossing each other,
 * then hold on `aim` (board points), each with its own `strength`.
 */
export function StageLights({
  at,
  aim,
  strength,
  sweep = true,
}: {
  at: number;
  aim: readonly [{ x: number; y: number }, { x: number; y: number }];
  strength: readonly [number, number];
  sweep?: boolean;
}) {
  const t = useLocalTime();
  const sources = [
    { x: 170, y: -80 },
    { x: 1750, y: -80 },
  ] as const;
  return (
    <div className="pointer-events-none absolute inset-0">
      {sources.map((source, index) => {
        const side = index === 0 ? 1 : -1;
        const target = aim[index];
        const rest = (-Math.atan2(target.x - source.x, target.y - source.y) * 180) / Math.PI;
        // The swing: from pointing off to its own side, across past the target, back to rest.
        const swing = sweep
          ? mix(side * 30, rest, progress(t, at, 0.9, ease.inOut)) +
            Math.sin(progress(t, at + 0.5, 1.1, ease.inOut) * Math.PI) * -side * 16
          : rest;
        const idle = Math.sin(t * 0.9 + index * 2) * 2.5;
        return (
          <Spotlight
            key={index}
            x={source.x}
            y={source.y}
            angle={swing + idle}
            length={1500}
            spread={620}
            strength={strength[index] * progress(t, at, 0.4)}
          />
        );
      })}
    </div>
  );
}
