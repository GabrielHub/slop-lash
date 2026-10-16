"use client";

import { useTime } from "@/tutorial/clock";
import { Words } from "@/tutorial/kit";
import { SPRINGS, clamp, mix, wobble } from "@/tutorial/timeline";
import { C, HeartIris, Neon, fin, fout, heartbeat, sp, tf } from "../tutorial/fx";
import { HeartArt } from "../tutorial/sign";
import { DURATION, HEART_SPOT, T } from "./beatsheet";

/** The end slate's one line. */
const SUPER = "Charm an AI, together.";
const HEART = 330;

/**
 * One clean strike: the tube comes up in a blink, dips once, and hums. The
 * tutorial's stutter reads as noise at 0.2x; this reads as a sign switching on.
 */
function strike(t: number, at: number, seed: number): number {
  const local = t - at;
  if (local < 0) return 0;
  if (local < 0.08) return local / 0.08;
  if (local >= 0.17 && local < 0.22) return 0.55;
  return 0.95 + 0.05 * wobble(t * 3, seed);
}

/** The sign's heart (the tutorial's `SignHeart`, on the steadier strike): a face, a glance, a wink. */
function Heart({ face, wink, look }: { face: number; wink: number; look: number }) {
  const t = useTime();
  const level = strike(t, T.strike, 1);
  const beat = heartbeat(t, 1.15, T.strike + 0.6) * clamp(level);
  return <HeartArt size={HEART} level={level} beat={beat} face={face} wink={wink} look={look} />;
}

/** "MatchSlop" in tube type: "Match" in rose, then "Slop" in coral, each on one clean strike. */
function Word() {
  const t = useTime();
  return (
    <p className="whitespace-nowrap font-display font-black leading-[0.9] tracking-[-0.02em]" style={{ fontSize: 232 }}>
      <Neon level={strike(t, T.word, 2)}>Match</Neon>
      <Neon level={strike(t, T.word + 0.16, 3)} color={C.coral}>
        Slop
      </Neon>
    </p>
  );
}

/**
 * The end slate: the meter's heart arrives and its neon tube strikes around
 * it, the name strikes after it, the super floats up word by word, and the
 * heart glances about and winks before the iris closes.
 */
export function Slate() {
  const t = useTime();
  const settle = sp(t, T.word - 0.05, SPRINGS.gentle);
  const wink = fin(t, T.wink, 0.1) * fout(t, T.wink + 0.32, 0.12);
  const look = fin(t, T.face + 0.35, 0.2) * fout(t, T.wink - 0.15, 0.2) * 0.6;
  return (
    <>
      {t >= T.strike && (
        <div className="absolute left-0 top-0" style={{ transform: tf(HEART_SPOT.x, HEART_SPOT.y) }}>
          <div className="-translate-x-1/2 -translate-y-1/2">
            <Heart face={fin(t, T.face, 0.25)} wink={wink} look={look} />
          </div>
        </div>
      )}
      <div
        className="absolute left-0 top-0"
        style={{ transform: tf(960, mix(640, 612, settle)), opacity: fin(t, T.word - 0.12, 0.15) }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <Word />
        </div>
      </div>
      <p className="absolute inset-x-0 top-[800px] text-center font-display text-[84px] font-extrabold leading-none tracking-[-0.01em] text-ink">
        <Words
          text={SUPER}
          at={T.superAt}
          stagger={0.09}
          from={{ opacity: 0, y: 40, scale: 0.85 }}
          spring={SPRINGS.smooth}
          accent={["together."]}
        />
      </p>
    </>
  );
}

/** The seam: a heart iris shuts on the sign's heart at the loop point and reopens on the next match. */
export function Seam() {
  return (
    <>
      <HeartIris at={0} close={0.01} open={0.6} origin={HEART_SPOT} />
      <HeartIris at={DURATION} close={DURATION - T.close} open={0.01} origin={HEART_SPOT} />
    </>
  );
}
