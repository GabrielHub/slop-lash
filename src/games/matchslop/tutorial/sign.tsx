"use client";

import { useTime } from "@/tutorial/clock";
import { clamp, mix } from "@/tutorial/timeline";
import { C, Neon, NeonHeart, heartbeat, neonLevel, tubeCore } from "./fx";

/**
 * The neon "MatchSlop" sign: a heart tube over the name, struck on at
 * `strikeAt`. `face` (0..1) draws a face in the heart; `wink` closes an eye.
 */
export function SignHeart({
  strikeAt,
  size = 240,
  face = 0,
  wink = 0,
  look = 0,
}: {
  strikeAt: number;
  size?: number;
  face?: number;
  wink?: number;
  /** -1..1, the eyes glancing left or right. */
  look?: number;
}) {
  const t = useTime();
  const level = neonLevel(t, strikeAt, 1);
  const beat = heartbeat(t, 1.15, strikeAt + 0.8) * clamp(level);
  return <HeartArt size={size} level={level} beat={beat} face={face} wink={wink} look={look} />;
}

/** The sign's heart tube at `level`, swelling with `beat` (0..1); the face as on `SignHeart`. */
export function HeartArt({
  size,
  level,
  beat,
  face,
  wink,
  look,
}: {
  size: number;
  level: number;
  beat: number;
  face: number;
  wink: number;
  look: number;
}) {
  const stroke = tubeCore(C.rose, level);
  const winking = clamp((wink - 0.4) / 0.2);
  return (
    <div style={{ transform: `scale(${1 + beat * 0.07})` }}>
      <NeonHeart size={size} level={level} fill={0.14 + beat * 0.22} stroke={1.35}>
        {face > 0 && (
          <g style={{ opacity: clamp(face) }} strokeLinecap="round" fill="none">
            <circle cx={8.9 + look * 0.7} cy={10.1} r={0.95} style={{ fill: stroke }} />
            {winking < 1 && (
              <circle
                cx={15.1 + look * 0.7}
                cy={10.1}
                r={0.95}
                style={{ fill: stroke, transform: `scaleY(${1 - winking})`, transformOrigin: "15.1px 10.1px" }}
              />
            )}
            {winking > 0 && (
              <path
                d="M13.9 10.4 Q15.1 9.1 16.3 10.4"
                style={{ stroke, strokeWidth: 0.85, opacity: winking }}
              />
            )}
            <path
              d={`M8.6 ${mix(13.2, 12.9, winking)} Q12 ${mix(15.6, 16.6, winking)} 15.4 ${mix(13.2, 12.6, winking)}`}
              style={{ stroke, strokeWidth: 0.9 }}
            />
          </g>
        )}
      </NeonHeart>
    </div>
  );
}

/** "MatchSlop" in tube type: "Match" in rose, "Slop" in coral, each striking on in turn. */
export function SignWord({ strikeAt, size = 210 }: { strikeAt: number; size?: number }) {
  const t = useTime();
  return (
    <p
      className="whitespace-nowrap font-display font-black leading-[0.9] tracking-[-0.02em]"
      style={{ fontSize: size }}
    >
      <Neon level={neonLevel(t, strikeAt, 2)}>Match</Neon>
      <Neon level={neonLevel(t, strikeAt + 0.2, 3)} color={C.coral}>
        Slop
      </Neon>
    </p>
  );
}

/** A tube-lettered kicker in violet. */
export function SignKicker({ strikeAt, text, size = 44 }: { strikeAt: number; text: string; size?: number }) {
  const t = useTime();
  return (
    <p
      className="whitespace-nowrap font-display font-extrabold uppercase tracking-[0.42em]"
      style={{ fontSize: size, marginRight: "-0.42em" }}
    >
      <Neon color={C.violet} level={neonLevel(t, strikeAt, 4)}>
        {text}
      </Neon>
    </p>
  );
}
