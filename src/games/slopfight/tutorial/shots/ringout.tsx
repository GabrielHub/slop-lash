"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Burst, Shake } from "@/tutorial/kit";
import { SPRINGS, ease, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { ArenaStage, FLOOR_Y } from "../arenas";
import { FloatingHealth, OnTheEdge, healthAt } from "../fightkit";
import { FREDOKA, NIGHT, Slam, TOY, jiggle } from "../look";
import { Toy } from "../toys";

// "...or knock them off the edge, for bonus points." Round 1 in the Flooded
// Garage: the duck is ON THE EDGE, the shark charges, the duck sails off the
// pallet into the water. RING OUT!, then +100 for Sam.

const SHARK_X = 980;
const DUCK_X = 1430;
const SPLASH = { x: 1790, y: 930 };
/** The world point the shot centres on. */
const VIEW = { x: 1150, y: 560 };

export function RingOutShot() {
  const b = useLocalCues();
  const t = b.t;
  const knock = b.word("finish", "knock", 1);
  const off = b.word("finish", "off");
  const edge = b.word("finish", "edge");
  const bonus = b.word("finish", "bonus");

  const hit = off - 0.02;
  const splash = edge + 0.06;
  const charge = progress(t, knock, hit - knock, ease.in);
  const jab = t < hit - 0.1 ? 0 : t < hit ? progress(t, hit - 0.1, 0.1, ease.in) * 150 : 150 * (1 - progress(t, hit + 0.15, 0.3, ease.inOut));
  const sharkX = mix(SHARK_X, 1170, charge) - (t > hit ? (1 - Math.exp(-(t - hit) * 4)) * 30 : 0);

  const fly = progress(t, hit, splash - hit);
  const flying = t >= hit && t < splash;
  const duckX = t < hit ? DUCK_X + wobble(t * 4, 2) * 6 : mix(DUCK_X, SPLASH.x, ease.out(fly));
  const duckY = t < hit ? FLOOR_Y : mix(FLOOR_Y, SPLASH.y + 60, fly) - Math.sin(fly * Math.PI) * 300 * (1 - fly * 0.3);
  const gone = t >= splash;
  const duckHealth = healthAt(t, 100, [[hit, 10]]);
  const duckGhost = healthAt(t - 0.45, 100, [[hit, 10]]);
  const ringOutAt = edge - 0.02;
  const zoom = mix(1.22, 1.3, progress(t, 0, 2.7, ease.inOutSine));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Shake at={[hit, splash]} strength={14} duration={0.35} className="absolute inset-0">
        <div className="absolute inset-0" style={{ transformOrigin: "0 0", transform: `translate(${960 - VIEW.x * zoom}px, ${540 - VIEW.y * zoom}px) scale(${zoom})` }}>
          <ArenaStage id="garage" t={t} />
          {!gone && (
            <Toy
              kind="duck"
              x={duckX}
              y={duckY}
              scale={0.95}
              shadow={!flying}
              pose={{ flip: true, mood: flying ? "wow" : "dizzy", spin: flying ? fly * 560 : 0, lean: t < hit ? 10 + wobble(t * 5, 1) * 8 : 0, squash: jiggle(t, hit, 8, 24) * 0.3 }}
            />
          )}
          {gone && t < splash + 0.9 && (
            <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
              {[0, 0.15, 0.3].map((delay) => {
                const p = progress(t, splash + delay, 0.6, ease.out);
                return <ellipse key={delay} cx={SPLASH.x} cy={SPLASH.y} rx={40 + p * 220} ry={10 + p * 50} fill="none" stroke={TOY.mint.hex} strokeWidth={10 * (1 - p)} opacity={1 - p} />;
              })}
            </svg>
          )}
          {t > splash - 0.02 && t < splash + 1 && (
            <div className="absolute" style={{ left: SPLASH.x, top: SPLASH.y }}>
              <Burst at={splash} count={30} speed={1100} gravity={2200} size={22} shape="circle" direction={-90} spread={70} colors={[TOY.mint.hex, "#E8FFF9", TOY.teal.hex]} seed={17} />
            </div>
          )}
          <Toy
            kind="shark"
            x={sharkX}
            y={FLOOR_Y}
            scale={1}
            pose={{ mood: t > splash ? "smug" : "angry", lean: charge * 14 - (t > hit ? 6 : 0), look: 0.6, squash: jiggle(t, hit, 8, 22) * 0.12 }}
            extras={{ tux: true, reach: jab, clock: t }}
          />
          <FloatingHealth x={sharkX} y={320} name="Sir Chompsalot" health={74} ghost={74} max={110} side="A" />
          {t < hit + 0.15 && (
            <div style={{ opacity: 1 - progress(t, hit, 0.15) }}>
              <FloatingHealth x={DUCK_X} y={320} name="Quackhammer" health={duckHealth} ghost={duckGhost} max={100} side="B" />
            </div>
          )}
          {t < hit && <OnTheEdge x={DUCK_X} y={268} t={t} at={0.12} />}
        </div>
      </Shake>

      <Slam text="Ring out!" at={ringOutAt} x={900} y={300} size={210} tone="teal" rotate={-5} burst={TOY.butter.hex} burstSize={0.78} settle={{ at: bonus - 0.12, x: 960, y: 190, scale: 0.6 }} />
      <Slam text="+100" at={bonus} x={560} y={470} size={200} tone="gold" rotate={-6} />
      {t > bonus + 0.18 && (
        <div
          className="absolute rounded-full px-[26px] py-[8px] uppercase"
          style={{
            left: 560,
            top: 600,
            transform: `translate(-50%, -50%) rotate(-3deg) scale(${spring(t - (bonus + 0.18), SPRINGS.pop)})`,
            background: NIGHT,
            color: TOY.butter.hex,
            fontFamily: FREDOKA,
            fontWeight: 700,
            fontSize: 36,
            letterSpacing: "0.08em",
            border: `4px solid ${TOY.butter.hex}`,
          }}
        >
          Bonus to Sam
        </div>
      )}
    </div>
  );
}
