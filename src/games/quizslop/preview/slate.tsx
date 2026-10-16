"use client";

import { useLocalTime } from "@/tutorial/clock";
import { clamp, ease, mix, progress, spring, type SpringConfig } from "@/tutorial/timeline";
import { At, MarqueeSign } from "../tutorial/parts";
import { StageLights } from "../tutorial/title";
import { Glint, WipeIn } from "./stage";
import { SETTLE } from "./times";

/**
 * The end slate, in its own local seconds: both stage lights swing onto the
 * QuizSlop marquee, its letters drop in one by one, every bulb blazes as the
 * last lands, and the super wipes on under it.
 */

/** A letter's drop: one crisp settle, no bounce-back. */
const LETTER: SpringConfig = { stiffness: 620, damping: 34, mass: 1 };
const LETTERS = "QuizSlop".split("");
const FIRST = 0.22;
const STAGGER = 0.045;
/** The last letter is down. */
const LOGO_LANDS = FIRST + (LETTERS.length - 1) * STAGGER + 0.14;
const SUPER_AT = LOGO_LANDS + 0.12;

const SIGN = { y: 436, width: 1440, height: 420, band: 50 };

export function Slate() {
  const t = useLocalTime();
  const enter = spring(t, SETTLE);
  // A slow push so the held slate never sits dead still.
  const push = progress(t, 0.4, 2.6, ease.inOut);
  const flash = t >= LOGO_LANDS ? 1 - progress(t, LOGO_LANDS + 0.05, 0.55, ease.out) : 0;
  return (
    <div className="absolute inset-0">
      <StageLights
        at={-0.1}
        aim={[
          { x: 960, y: SIGN.y + 40 },
          { x: 960, y: SIGN.y + 40 },
        ]}
        strength={[1, 1]}
      />
      <At x={960} y={SIGN.y}>
        <div
          className="relative"
          style={{
            transform: `scale(${mix(0.86, 1, enter) * (1 + push * 0.03)})`,
            opacity: progress(t, 0, 0.14),
          }}
        >
          <MarqueeSign
            width={SIGN.width}
            height={SIGN.height}
            band={SIGN.band}
            bulb={22}
            spacing={58}
            power={progress(t, 0.04, 0.6, ease.inOut)}
            chase={1.5}
            flash={flash}
          >
            <span
              className="flex font-display text-[236px] font-black leading-none tracking-[-0.01em] text-gold qs-marquee-text"
              aria-label="QuizSlop"
            >
              {LETTERS.map((letter, index) => {
                const start = FIRST + index * STAGGER;
                const drop = spring(t - start, LETTER);
                return (
                  <span
                    key={index}
                    aria-hidden="true"
                    className="inline-block"
                    style={{
                      transform: `translateY(${(1 - drop) * -150}px) scale(${mix(1.2, 1, drop)})`,
                      opacity: clamp((t - start) / 0.08),
                    }}
                  >
                    {letter}
                  </span>
                );
              })}
            </span>
          </MarqueeSign>
          <div
            className="pointer-events-none absolute overflow-hidden"
            style={{ inset: SIGN.band, borderRadius: 14 }}
          >
            <Glint at={LOGO_LANDS + 0.02} duration={0.55} width={240} />
          </div>
        </div>
      </At>
      <At x={960} y={862}>
        <WipeIn at={SUPER_AT} duration={0.36}>
          <p className="whitespace-nowrap font-display text-[140px] font-black leading-none tracking-[-0.01em] text-ink">
            Bet on your <span className="text-punch">friends.</span>
          </p>
        </WipeIn>
      </At>
    </div>
  );
}
