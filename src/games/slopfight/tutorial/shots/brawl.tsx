"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Burst, Camera, PhoneMock, Shake, Stamp, Tap } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { ArenaStage, FLOOR_Y } from "../arenas";
import { FloatingHealth, HypeMeter, healthAt } from "../fightkit";
import { FREDOKA, Flash, INK, Slam, StarBurst, TOY, jiggle } from "../look";
import { HypeScreen } from "../phone";
import { Toy } from "../toys";
import { Flashes } from "./open";

// "During the fight, smash the hype button. It doesn't help. It feels
// amazing." then "Knock them out..." Round 2 on the Kitchen Counter: FIGHT!,
// the bonks, a phone mashing Hype!, the meter over the ring going wild, a
// zoom onto its plug (plugged into nothing), and the knockout.

const SHARK_X = 760;
const TOASTER_X = 1160;
const SHARK_MAX = 110;
const TOASTER_MAX = 120;
const PHONE_W = 340;
const PHONE_TOP = 196;
/** The Hype! button's centre on the phone screen, in screen px. */
const HYPE_BUTTON = { x: 195, y: 640 };
const METER = { x: 960, y: 96 };
const BARS_Y = 336;

/** Rises into a lunge just before `at`, then eases back. */
function lunge(t: number, at: number): number {
  if (t < at - 0.16 || t > at + 0.45) return 0;
  if (t < at) return ease.in(progress(t, at - 0.16, 0.16));
  return 1 - ease.inOut(progress(t, at, 0.45));
}

/** A knock back from a hit at `at`. */
function recoil(t: number, at: number): number {
  if (t < at) return 0;
  return Math.exp(-(t - at) * 5) * Math.min(1, (t - at) / 0.05);
}

function sequenceTaps(from: number, to: number, step: number): number[] {
  const taps: number[] = [];
  for (let at = from; at <= to; at += step) taps.push(Number(at.toFixed(3)));
  return taps;
}

function Bonk({ t, at, x, y, word }: { t: number; at: number; x: number; y: number; word: string }) {
  const life = (t - at) / 0.32;
  if (life < 0 || life > 1) return null;
  return (
    <div className="absolute" style={{ left: x, top: y, transform: `scale(${spring(t - at, SPRINGS.pop) * (1 - life * 0.2)}) rotate(${word.length * 3 - 12}deg)`, opacity: 1 - progress(life, 0.7, 0.3) }}>
      <StarBurst size={210} color={TOY.butter.hex} />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 46, color: INK }}>
        {word}
      </span>
    </div>
  );
}

export function BrawlShot() {
  const b = useLocalCues();
  const t = b.t;
  const fight = b.word("bet", "fight", 1);
  const smash = b.word("bet", "smash");
  const doesnt = b.word("bet", "doesn't");
  const it2 = b.word("bet", "it", 1);
  const amazing = b.word("bet", "amazing");
  const knock = b.word("finish", "knock", 0);
  const out = b.word("finish", "out");

  // The exchanges: shark hits on the toaster, toaster hits on the shark.
  const sharkHits = [fight + 0.42, fight + 1.55, fight + 2.85, fight + 3.9];
  const toasterHits = [fight + 0.95, fight + 2.2, fight + 3.35];
  const ko = out + 0.02;
  const toasterHealth = healthAt(t, TOASTER_MAX, [...sharkHits.map((at, index) => [at, [16, 20, 14, 18][index]] as const), [ko, 60]]);
  const toasterGhost = healthAt(t - 0.45, TOASTER_MAX, [...sharkHits.map((at, index) => [at, [16, 20, 14, 18][index]] as const), [ko, 60]]);
  const sharkHealth = healthAt(t, SHARK_MAX, toasterHits.map((at, index) => [at, [14, 12, 10][index]] as const));
  const sharkGhost = healthAt(t - 0.45, SHARK_MAX, toasterHits.map((at, index) => [at, [14, 12, 10][index]] as const));

  // The knockout: wind up, a rubber-arm haymaker, slow-motion flight.
  const windup = progress(t, knock + 0.05, out - knock - 0.25, ease.inOut) * (1 - progress(t, out - 0.16, 0.1));
  const punch = t < out - 0.18 ? 0 : t < out ? ease.in(progress(t, out - 0.18, 0.18)) * 236 : 236 * (1 - progress(t, out + 0.25, 0.3, ease.inOut));
  const flight = progress(t, ko, 0.5, ease.out);
  const knocked = t >= ko;

  const sharkX = SHARK_X + sharkHits.reduce((sum, at) => sum + lunge(t, at) * 90, 0) - toasterHits.reduce((sum, at) => sum + recoil(t, at) * 50, 0) - windup * 30;
  const toasterX =
    TOASTER_X - toasterHits.reduce((sum, at) => sum + lunge(t, at) * 90, 0) + sharkHits.reduce((sum, at) => sum + recoil(t, at) * 50, 0) + (knocked ? flight * 300 : 0);
  const toasterHop = knocked ? Math.sin(Math.min(1, flight * 1.1) * Math.PI) * 150 : 0;
  const toasterSpin = knocked ? -flight * 100 : 0;
  const sharkSquash = toasterHits.reduce((sum, at) => sum + jiggle(t, at, 8, 22) * 0.25, 0);
  const toasterSquash = sharkHits.reduce((sum, at) => sum + jiggle(t, at, 8, 22) * 0.25, 0) + (t > ko + 0.5 ? jiggle(t, ko + 0.5, 8, 22) * 0.3 : 0);

  // The phone, the mashing and the meter.
  const phoneAt = smash - 0.2;
  const phoneIn = spring(t - phoneAt, { stiffness: 200, damping: 21 });
  const phoneOut = progress(t, knock - 0.05, 0.35, ease.in);
  const taps = [...sequenceTaps(smash + 0.08, doesnt - 0.12, 0.11), ...sequenceTaps(it2 + 0.02, amazing + 0.45, 0.095)];
  let needle = 0;
  for (const tap of taps) if (t >= tap) needle += Math.exp(-(t - tap) * 1.3) * 0.13;
  needle = clamp(needle, 0, 1.12);
  const wild = clamp((needle - 0.6) * 3);
  const needleShown = needle + wobble(t * 9, 3) * 0.06 * wild;

  const wide = { y: 530, zoom: 1.2 };
  const cameraKeys = [
    { at: 0, x: 960, ...wide },
    { at: smash - 0.1, x: 960, ...wide },
    { at: smash + 0.3, x: 830, ...wide },
    { at: doesnt - 0.12, x: 830, ...wide },
    { at: doesnt + 0.22, x: 990, y: 400, zoom: 2.05 },
    { at: it2 - 0.08, x: 990, y: 400, zoom: 2.05 },
    { at: it2 + 0.3, x: 830, ...wide },
    { at: knock - 0.05, x: 830, ...wide },
    { at: knock + 0.35, x: 980, y: 530, zoom: 1.3 },
    { at: out, x: 1010, y: 520, zoom: 1.4 },
    { at: out + 0.5, x: 1060, y: 520, zoom: 1.48 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Shake at={[...sharkHits, ...toasterHits].map((at) => at + 0.01)} strength={7} duration={0.25} className="absolute inset-0">
        <Shake at={[ko]} strength={24} duration={0.5} className="absolute inset-0">
          <Camera keys={cameraKeys}>
            <ArenaStage id="kitchen" t={t} />
            <HypeMeter x={METER.x} y={METER.y} needle={needleShown} glow={needle} t={t} />
            {t > amazing - 0.1 && t < amazing + 0.9 && (
              <div className="absolute" style={{ left: METER.x, top: METER.y + 140 }}>
                <Burst at={amazing - 0.05} count={26} speed={900} gravity={1300} size={18} shape="star" colors={[TOY.butter.hex, "#FFF4DC", TOY.tangerine.hex]} seed={21} />
              </div>
            )}
            <Toy
              kind="toaster"
              x={toasterX}
              y={FLOOR_Y}
              scale={1}
              pose={{
                flip: true,
                mood: t > ko ? "ko" : sharkHits.some((at) => t > at && t < at + 0.35) ? "wow" : "angry",
                squash: toasterSquash,
                hop: toasterHop,
                spin: toasterSpin,
                lean: knocked ? -flight * 8 : wobble(t, 4) * 3,
              }}
              extras={{ clock: t }}
            />
            <Toy
              kind="shark"
              x={sharkX}
              y={FLOOR_Y}
              scale={1}
              pose={{
                mood: t > ko ? "smug" : toasterHits.some((at) => t > at && t < at + 0.35) ? "wow" : "angry",
                squash: sharkSquash,
                lean: -windup * 16 + wobble(t, 1) * 3,
                look: 0.5,
              }}
              extras={{ tux: true, reach: punch, clock: t }}
            />
            {sharkHits.map((at, index) => (
              <Bonk key={at} t={t} at={at} x={(sharkX + toasterX) / 2 + 30} y={520} word={["Bonk!", "Thwack!", "Bop!", "Wham!"][index]} />
            ))}
            {toasterHits.map((at, index) => (
              <Bonk key={at} t={t} at={at} x={(sharkX + toasterX) / 2 - 30} y={540} word={["Clonk!", "Toast!", "Bonk!"][index]} />
            ))}
            {t > ko - 0.02 && t < ko + 0.8 && (
              <div className="absolute" style={{ left: TOASTER_X - 40, top: 560 }}>
                <Burst at={ko} count={30} speed={1300} gravity={1600} size={20} shape="star" colors={[TOY.butter.hex, TOY.tomato.hex, "#FFF4DC"]} seed={13} />
              </div>
            )}
            <FloatingHealth x={SHARK_X} y={BARS_Y} name="Sir Chompsalot" health={sharkHealth} ghost={sharkGhost} max={SHARK_MAX} side="A" />
            <FloatingHealth x={TOASTER_X} y={BARS_Y} name="Crumb Lord" health={toasterHealth} ghost={toasterGhost} max={TOASTER_MAX} side="B" shake={jiggle(t, ko, 8, 40) * 10} />
          </Camera>
        </Shake>
      </Shake>

      {/* "It feels amazing": the crowd's flashes go off. */}
      <Flashes t={t} times={[it2 + 0.2, it2 + 0.38, amazing - 0.05, amazing + 0.12, amazing + 0.3, amazing + 0.5]} seed={12} />

      {/* The phone: Hype!, mashed. */}
      {t > phoneAt && phoneOut < 1 && (
        <div className="absolute" style={{ left: mix(-460, 70, phoneIn) - phoneOut * 560, top: PHONE_TOP, transform: `rotate(${mix(-10, -3, phoneIn)}deg)` }}>
          <PhoneMock width={PHONE_W}>
            <HypeScreen t={t} taps={taps} health={{ A: sharkHealth, B: toasterHealth }} />
            {taps.map((at) => (
              <div key={at} className="absolute" style={{ left: HYPE_BUTTON.x + 30 + Math.sin(at * 37) * 26, top: HYPE_BUTTON.y + 40 + Math.cos(at * 29) * 20 }}>
                <Tap at={at} size={64} />
              </div>
            ))}
          </PhoneMock>
          {t > amazing - 0.1 && t < amazing + 1 && (
            <div className="absolute" style={{ left: PHONE_W / 2, top: 520 }}>
              <Burst at={amazing - 0.05} count={24} speed={1000} gravity={900} size={26} shape="heart" colors={[TOY.butter.hex, TOY.bubblegum.hex, "#FFF4DC"]} seed={4} />
            </div>
          )}
        </div>
      )}

      {/* "It doesn't help." */}
      {t > doesnt + 0.2 && t < it2 + 0.05 && (
        <div className="absolute left-[1220px] top-[250px]">
          <Stamp text="Not plugged in" at={doesnt + 0.22} tone="fail" size={60} rotate={-6} out={it2 - 0.2} />
        </div>
      )}

      <Slam text="Fight!" at={fight - 0.02} out={fight + 0.5} x={960} y={500} size={240} tone="tomato" rotate={-5} burst={TOY.butter.hex} burstSize={0.72} />
      <Slam text="K.O.!" at={ko} x={960} y={300} size={250} tone="tomato" rotate={-6} burst={TOY.butter.hex} burstSize={0.85} />
      <Flash at={ko} duration={0.3} strength={0.7} />
    </div>
  );
}
