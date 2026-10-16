"use client";

import { useLocalTime } from "@/tutorial/clock";
import { Burst, Camera, Shake, cameraPose, toScreen, type CameraKey } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { ArenaStage, FLOOR_Y } from "../tutorial/arenas";
import { healthAt } from "../tutorial/fightkit";
import { FACE, Flash, NIGHT, Slam, TOY, jiggle } from "../tutorial/look";
import { Toy } from "../tutorial/toys";
import { HealthBar, HitBurst, ImpactFrame, SoundWord, Twinkle } from "./parts";

// The fight, on the rooftop at sunset: BONK, CLONK, THWACK, then the shark
// winds up a rubber-arm haymaker and Crumb Lord is launched off the roof and
// into the sky, where it twinkles out. RING OUT! Then the lights go down.

const SCALE = 1.2;
const SHARK_X = 780;
const TOASTER_X = 1140;

// Hits land a sound word's read apart (each word holds for one gap).
const HIT_GAP = 0.66;
const HIT_A = 0.04;
const HIT_B = HIT_A + HIT_GAP;
const HIT_C = HIT_B + HIT_GAP;
const KO = HIT_C + 0.76;
/** The hit-stop on the knockout: everything holds this long. */
const STOP = 0.09;
const LAUNCH = KO + STOP;
const FLIGHT = 0.8;
const TWINKLE = LAUNCH + FLIGHT - 0.02;
/** RING OUT! lands on the twinkle. */
const RING_OUT = TWINKLE - 0.1;
const CHEER = RING_OUT + 0.2;
const LIGHTS_OUT = RING_OUT + 0.78;
/** The brawl's length (the slate cuts in here, in the dark). */
export const BRAWL_END = LIGHTS_OUT + 0.18;

/** A toy's middle above its feet, per unit of scale (where it spins about). */
const MIDDLE = 360 * 0.42;
/** Where the toaster vanishes, on the board (inside the camera). */
const SKY = { x: 1700, y: 190 };

/** Rises into a lunge just before `at`, then eases back. */
function lunge(t: number, at: number): number {
  if (t < at - 0.14 || t > at + 0.42) return 0;
  if (t < at) return ease.in(progress(t, at - 0.14, 0.14));
  return 1 - ease.inOut(progress(t, at, 0.42));
}

/** A knock back from a hit at `at`. */
function recoil(t: number, at: number): number {
  if (t < at) return 0;
  return Math.exp(-(t - at) * 5) * Math.min(1, (t - at) / 0.05);
}

function sharkXAt(t: number): number {
  const backstep = progress(t, HIT_C + 0.3, 0.4, ease.inOut) * 90;
  return SHARK_X + (lunge(t, HIT_A) + lunge(t, HIT_C)) * 90 - recoil(t, HIT_B) * 60 - backstep;
}

function toasterXAt(t: number): number {
  const stagger = progress(t, HIT_C + 0.05, 0.5, ease.out) * 170;
  return TOASTER_X - lunge(t, HIT_B) * 90 + (recoil(t, HIT_A) + recoil(t, HIT_C)) * 60 + stagger;
}

const CAMERA: CameraKey[] = [
  { at: 0, x: 960, y: 520, zoom: 1.34 },
  { at: HIT_C + 0.3, x: 980, y: 525, zoom: 1.3 },
  { at: KO - 0.05, x: 960, y: 560, zoom: 1.46 },
  { at: KO + 0.02, x: 960, y: 560, zoom: 1.46 },
  { at: LAUNCH + 0.24, x: 1080, y: 470, zoom: 1.12 },
  { at: BRAWL_END, x: 1060, y: 480, zoom: 1.16 },
];

/**
 * Where a hit's sound word sits on screen: above the victim's head and out to
 * its far side (where it's reeling to), clear of both faces.
 */
function wordSpot(at: number, victim: "shark" | "toaster", out = 150) {
  const world =
    victim === "toaster"
      ? { x: toasterXAt(at + 0.2) + out, y: FLOOR_Y - 400 }
      : { x: sharkXAt(at + 0.2) - out, y: FLOOR_Y - 400 };
  const screen = toScreen(world, cameraPose(at, CAMERA));
  return { x: clamp(screen.x, 360, 1560), y: screen.y };
}

/** The arm's full stretch for the haymaker, in toy units: from the shark's fin into the toaster. */
const REACH = (toasterXAt(KO) - 110 * SCALE - (sharkXAt(KO) + 166 * SCALE)) / SCALE + 40;

const TOASTER_HITS = [
  [HIT_A, 0.22],
  [HIT_C, 0.5],
  [KO, 0.28],
] as const;
const SHARK_HITS = [[HIT_B, 0.18]] as const;

export function BrawlShot() {
  const t = useLocalTime();
  /** The action's clock: it stops dead through the hit-stop. */
  const ft = t > KO && t < LAUNCH ? KO : t;

  const windup = progress(ft, HIT_C + 0.38, KO - 0.1 - (HIT_C + 0.38), ease.inOut) * (1 - progress(ft, KO - 0.1, 0.06));
  const punch =
    ft < KO - 0.08
      ? 0
      : ft <= KO
        ? ease.in(progress(ft, KO - 0.08, 0.08)) * REACH
        : REACH * (1 - spring(ft - (LAUNCH + 0.06), { stiffness: 260, damping: 12 }));
  const launched = ft >= LAUNCH;
  // The flight: up and away toward the skyline, big at first, then shrinking into the distance.
  const fly = progress(t, LAUNCH, FLIGHT);
  const travel = ease.out(fly);
  const gone = t > LAUNCH + FLIGHT;

  const sharkX = sharkXAt(ft);
  const toasterScale = launched ? mix(SCALE, 0.06, fly ** 1.5) : SCALE;
  const toasterX = launched ? mix(toasterXAt(KO), SKY.x, travel) : toasterXAt(ft);
  // Its middle rides the arc, so a big toaster near the top stays in the sky, not off the board.
  const toasterY = launched
    ? mix(FLOOR_Y - MIDDLE * SCALE, SKY.y, travel) - Math.sin(fly * Math.PI) * 60 + MIDDLE * toasterScale
    : FLOOR_Y;
  const dazed = ft > HIT_C + 0.2 && ft < KO;
  const cheer = t > CHEER ? Math.max(0, Math.sin(clamp((t - CHEER) / 0.4) * Math.PI)) : 0;

  const sharkMood = t > LAUNCH + 0.2 ? "smug" : t > HIT_B && t < HIT_B + 0.3 ? "wow" : "angry";
  const toasterMood = launched ? "ko" : dazed ? "dizzy" : [HIT_A, HIT_C].some((at) => ft > at && ft < at + 0.3) ? "wow" : "angry";

  const sharkHealth = healthAt(t, 1, SHARK_HITS);
  const toasterHealth = healthAt(t, 1, TOASTER_HITS);
  const hud = spring(t - 0.08, SPRINGS.smooth) * (1 - progress(t, KO + 0.02, 0.2, ease.in));
  const glove = { x: sharkX + (96 + REACH + 60) * SCALE, y: FLOOR_Y - 130 * SCALE };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Shake at={[HIT_A, HIT_B, HIT_C].map((at) => at + 0.01)} strength={9} duration={0.25} className="absolute inset-0">
        <Shake at={[KO]} strength={30} duration={0.55} className="absolute inset-0">
          <Camera keys={CAMERA}>
            <ArenaStage id="rooftop" t={t} />
            <div className="absolute inset-0" style={{ background: "rgba(20, 11, 16, 0.18)" }} />
            {!gone && (
              <Toy
                kind="toaster"
                x={toasterX}
                y={toasterY}
                scale={toasterScale}
                shadow={!launched}
                pose={{
                  flip: true,
                  mood: toasterMood,
                  squash: [HIT_A, HIT_C].reduce((sum, at) => sum + jiggle(ft, at, 8, 22) * 0.26, 0) + (launched ? 0 : jiggle(ft, KO, 6, 30) * 0.3),
                  spin: launched ? -fly * 900 : 0,
                  lean: dazed ? Math.sin(t * 9) * 7 : wobble(t, 4) * 3,
                }}
                extras={{ clock: t }}
              />
            )}
            <Toy
              kind="shark"
              x={sharkX}
              y={FLOOR_Y}
              scale={SCALE}
              pose={{
                mood: sharkMood,
                look: 0.5,
                squash: jiggle(ft, HIT_B, 8, 22) * 0.25 + jiggle(t, CHEER, 7, 18) * 0.12,
                lean: -windup * 18 + (punch > 1 ? 8 : 0) + wobble(t, 1) * 2,
                hop: cheer * 70,
              }}
              extras={{ tux: true, reach: punch, clock: t }}
            />
            <HitBurst t={t} at={KO} x={glove.x + 30} y={glove.y} size={400} life={0.28} />
            {t > KO - 0.02 && t < KO + 1.2 && (
              <div className="absolute" style={{ left: glove.x + 40, top: glove.y }}>
                <Burst at={KO} count={28} speed={1500} gravity={1500} size={26} shape="star" colors={[TOY.butter.hex, FACE, TOY.tangerine.hex]} seed={13} />
              </div>
            )}
            <Twinkle t={t} at={TWINKLE} x={SKY.x} y={SKY.y} size={190} />
          </Camera>
          <SoundWord t={t} at={HIT_A} {...wordSpot(HIT_A, "toaster")} word="Bonk!" tilt={-8} life={HIT_GAP} />
          <SoundWord t={t} at={HIT_B} {...wordSpot(HIT_B, "shark")} word="Clonk!" color={TOY.tomato.hex} tilt={7} life={HIT_GAP} />
          <SoundWord t={t} at={HIT_C} {...wordSpot(HIT_C, "toaster", 40)} word="Thwack!" tilt={-6} life={HIT_GAP} />
        </Shake>
      </Shake>

      {hud > 0.01 && (
        <div className="absolute inset-0" style={{ transform: `translateY(${(hud - 1) * 260}px)` }}>
          <HealthBar kind="shark" side="left" health={sharkHealth} ghost={healthAt(t - 0.45, 1, SHARK_HITS)} x={100} y={118} width={700} />
          <HealthBar kind="toaster" side="right" health={toasterHealth} ghost={healthAt(t - 0.45, 1, TOASTER_HITS)} x={1120} y={118} width={700} />
        </div>
      )}

      <Slam text="Ring out!" at={RING_OUT} out={LIGHTS_OUT - 0.25} x={760} y={290} size={200} tone="teal" rotate={-5} burst={TOY.butter.hex} burstSize={0.66} />

      <Flash at={0} duration={0.3} strength={0.9} />
      <ImpactFrame t={t} at={KO} hold={0.07} />
      <Flash at={KO + 0.07} duration={0.3} strength={0.6} />
      <div className="pointer-events-none absolute inset-0 z-40" style={{ background: NIGHT, opacity: progress(t, LIGHTS_OUT, BRAWL_END - LIGHTS_OUT, ease.in) }} />
    </div>
  );
}
