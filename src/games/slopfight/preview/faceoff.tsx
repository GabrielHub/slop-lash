"use client";

import { useLocalTime } from "@/tutorial/clock";
import { SPRINGS, ease, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { FACE, Flash, INK, NIGHT, Slam, TOY, jiggle, mixHex } from "../tutorial/look";
import { CAST, Toy } from "../tutorial/toys";
import { NamePlate } from "./parts";
import { HERO } from "./times";

// The face-off: the two corners slam together on a lightning seam, the shark
// slides to its side, Crumb Lord bounces in steaming, VS, names; both crouch
// and charge, and the clash cuts to the fight.

const SHARK_X = 560;
const TOASTER_X = 1365;
const VS_AT = 0.3;
const CROUCH = 1.38;
const CHARGE = 1.58;
const END = 1.75;

function Corner({ side, t, offset }: { side: "A" | "B"; t: number; offset: number }) {
  const color = side === "A" ? TOY.ocean.hex : TOY.tomato.hex;
  const points = side === "A" ? "-400,-400 1120,-400 840,1500 -400,1500" : "1120,-400 2400,-400 2400,1500 840,1500";
  return (
    <g transform={`translate(${offset} 0)`}>
      <defs>
        <radialGradient id={`sfp-fo-${side}`} cx={side === "A" ? "0.32" : "0.68"} cy="0.5" r="0.62">
          <stop offset="0" stopColor={mixHex(color, NIGHT, 0.12)} />
          <stop offset="1" stopColor={mixHex(color, NIGHT, 0.66)} />
        </radialGradient>
      </defs>
      <polygon points={points} fill={`url(#sfp-fo-${side})`} />
      {Array.from({ length: 8 }, (_, index) => {
        const y = 60 + index * 128;
        const run = ((t * 1400 + index * 263) % 1500) - 300;
        const x = side === "A" ? run - 400 : 2320 - run - 360;
        return <rect key={index} x={x} y={y} width={360} height={8} rx={4} fill={FACE} opacity={0.12} />;
      })}
    </g>
  );
}

function Seam({ t, show }: { t: number; show: number }) {
  if (show <= 0) return null;
  const points: string[] = [];
  for (let index = 0; index <= 16; index++) {
    const v = index / 16;
    const x = mix(1120, 840, v) + (index % 2 === 0 ? -26 : 26) + wobble(t * 4, index) * 8;
    points.push(`${x},${mix(-400, 1500, v)}`);
  }
  return (
    <g opacity={show}>
      <polyline points={points.join(" ")} fill="none" stroke={INK} strokeWidth={36} strokeLinejoin="round" />
      <polyline points={points.join(" ")} fill="none" stroke={TOY.butter.hex} strokeWidth={16} strokeLinejoin="round" />
    </g>
  );
}

export function FaceOffShot() {
  const t = useLocalTime();
  const meet = 0.16;
  const slideA = spring(t, { stiffness: 320, damping: 26 });
  const slideB = spring(t - 0.03, { stiffness: 320, damping: 26 });
  const roll = mix(-1, -6, spring(t, SPRINGS.gentle)) + wobble(t, 4) * 0.4;
  const push = mix(1.02, 1.09, progress(t, 0, END, ease.inOutSine));

  // Crouch, then the charge: both dash at the middle and the clash cuts away.
  const crouch = progress(t, CROUCH, CHARGE - CROUCH, ease.out);
  const charge = progress(t, CHARGE, END - CHARGE, ease.in);
  const sharkX = mix(HERO.x, SHARK_X, spring(t, { stiffness: 240, damping: 22 })) + charge * 300;
  const toasterX = mix(2350, TOASTER_X, spring(t - 0.06, { stiffness: 210, damping: 15 })) - charge * 300;
  const toasterLand = 0.3;

  const sharkPose = {
    mood: "angry" as const,
    look: 0.7,
    lean: -crouch * 10 * (1 - charge) + charge * 16 + wobble(t, 2) * 2,
    squash: crouch * 0.16 * (1 - charge) - charge * 0.14 + jiggle(t, VS_AT + 0.1, 7, 18) * 0.06,
  };
  const toasterPose = {
    flip: true,
    mood: "angry" as const,
    look: 0.7,
    lean: crouch * 10 * (1 - charge) - charge * 16 + wobble(t, 5) * 2,
    squash: crouch * 0.16 * (1 - charge) - charge * 0.14 + jiggle(t, toasterLand, 7, 18) * 0.22,
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ transformOrigin: "960px 600px", transform: `rotate(${roll}deg) scale(${push})` }}>
        <svg className="absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
          <Corner side="A" t={t} offset={(slideA - 1) * 1700} />
          <Corner side="B" t={t} offset={(1 - slideB) * 1700} />
          <Seam t={t} show={progress(t, meet, 0.06)} />
        </svg>
        <Toy kind="shark" x={sharkX} y={HERO.y} scale={HERO.scale} pose={sharkPose} extras={{ tux: true, clock: t }} />
        <Toy kind="toaster" x={toasterX} y={HERO.y} scale={HERO.scale} pose={toasterPose} extras={{ clock: t }} />
      </div>

      <NamePlate name={CAST.shark.name} side="left" enter={spring(t - 0.34, SPRINGS.smooth)} y={900} color={TOY.teal.hex} />
      <NamePlate name={CAST.toaster.name} side="right" enter={spring(t - 0.44, SPRINGS.smooth)} y={900} color={TOY.butter.hex} />
      <Slam text="VS" at={VS_AT} out={CROUCH + 0.05} x={960} y={500} size={270} tone="gold" rotate={-6} burst={TOY.tomato.hex} burstSize={1.45} />
      <Flash at={meet} duration={0.2} strength={0.4} />
    </div>
  );
}
