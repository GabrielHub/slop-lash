"use client";

import { PhoneMock, Tap } from "@/tutorial/kit";
import { SPRINGS, ease, mix, progress, spring, springTo, wobble } from "@/tutorial/timeline";
import { FREDOKA, INK, Letterbox, NIGHT, Slam, TOY, jiggle, mixHex, useBeat } from "../look";
import { BetScreen } from "../phone";
import { CAST, Toy } from "../toys";
import { Flashes } from "./open";

// "Before every fight, bet on who wins." The face-off: letterbox, a Dutch
// roll, the two corners split by a lightning seam, then a phone rises with
// "Who wins?" and one tap bets on the shark.

const PHONE_W = 340;
/** The shark's button on the bet screen, in screen px. */
const SHARK_BUTTON = { x: 195, y: 352 };

function Corner({ side, t }: { side: "A" | "B"; t: number }) {
  const color = side === "A" ? TOY.ocean.hex : TOY.tomato.hex;
  const deep = mixHex(color, "#140B10", 0.62);
  const points = side === "A" ? "-300,-300 1120,-300 840,1400 -300,1400" : "1120,-300 2300,-300 2300,1400 840,1400";
  return (
    <>
      <defs>
        <radialGradient id={`sft-fo-${side}`} cx={side === "A" ? "0.3" : "0.7"} cy="0.45" r="0.6">
          <stop offset="0" stopColor={mixHex(color, "#140B10", 0.25)} />
          <stop offset="1" stopColor={deep} />
        </radialGradient>
      </defs>
      <polygon points={points} fill={`url(#sft-fo-${side})`} />
      {Array.from({ length: 9 }, (_, index) => {
        const y = 80 + index * 110;
        const run = ((t * 900 + index * 237) % 1400) - 300;
        const x = side === "A" ? run - 400 : 2320 - run;
        return <rect key={index} x={x} y={y} width={340} height={6} rx={3} fill="#FFF4DC" opacity={0.07} />;
      })}
    </>
  );
}

/** The jagged seam between the corners. */
function Seam({ t }: { t: number }) {
  const points: string[] = [];
  for (let index = 0; index <= 16; index++) {
    const v = index / 16;
    const x = mix(1120, 840, v) + (index % 2 === 0 ? -22 : 22) + wobble(t * 3, index) * 6;
    points.push(`${x},${mix(-300, 1400, v)}`);
  }
  return (
    <>
      <polyline points={points.join(" ")} fill="none" stroke={INK} strokeWidth={30} strokeLinejoin="round" />
      <polyline points={points.join(" ")} fill="none" stroke={TOY.butter.hex} strokeWidth={14} strokeLinejoin="round" />
    </>
  );
}

function NameBar({ side, t, at }: { side: "A" | "B"; t: number; at: number }) {
  const kind = side === "A" ? "shark" : "toaster";
  const enter = spring(t - at, SPRINGS.smooth);
  return (
    <div
      className="absolute top-[744px] flex flex-col"
      style={{
        [side === "A" ? "left" : "right"]: 120,
        alignItems: side === "A" ? "flex-start" : "flex-end",
        transform: `translateX(${(1 - enter) * (side === "A" ? -700 : 700)}px)`,
      }}
    >
      <span
        className="rounded-[14px] px-[26px] py-[6px] uppercase"
        style={{ background: NIGHT, color: "#FFF4DC", fontFamily: FREDOKA, fontWeight: 700, fontSize: 52, lineHeight: 1.1, border: `4px solid ${side === "A" ? TOY.teal.hex : TOY.butter.hex}` }}
      >
        {CAST[kind].name}
      </span>
      <span className="mt-[8px] px-[10px] text-[30px] font-semibold" style={{ color: "#FFF4DC", textShadow: `0 2px 0 ${INK}` }}>
        {side === "A" ? "Sam's corner" : "Rio's corner"}
      </span>
    </div>
  );
}

export function FaceOffShot() {
  const b = useBeat();
  const t = b.t;
  const before = b.word("bet", "before");
  const fight = b.word("bet", "fight", 0);
  const bet = b.word("bet", "bet");
  const wins = b.word("bet", "wins");

  const roll = mix(-8, -4, progress(t, 0, 2.6, ease.out));
  const push = mix(1.05, 1.12, progress(t, 0, 2.6, ease.inOutSine));
  const sharkIn = springTo(t, 0, -900, 0, { stiffness: 170, damping: 19 });
  const toasterIn = springTo(t, 0.06, 900, 0, { stiffness: 170, damping: 19 });
  const phoneAt = bet - 0.12;
  const phoneIn = spring(t - phoneAt, { stiffness: 190, damping: 20 });
  const tapAt = wins + 0.02;
  const picked = t >= tapAt;
  const pickAmount = spring(t - tapAt, SPRINGS.pop);
  const cheer = jiggle(t, tapAt + 0.05, 6, 18);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ transformOrigin: "960px 560px", transform: `rotate(${roll}deg) scale(${push})` }}>
        <svg className="absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
          <Corner side="A" t={t} />
          <Corner side="B" t={t} />
          <Seam t={t} />
        </svg>
        <Flashes t={t} times={[0.25, 0.55, 0.9, 1.3, 1.75, 2.2]} seed={9} />
        <Toy
          kind="shark"
          x={560 + sharkIn}
          y={930}
          scale={1.5}
          pose={{ mood: picked ? "smug" : "angry", lean: 6 + wobble(t, 2) * 2, look: 0.6, squash: cheer * 0.12, hop: picked ? Math.max(0, cheer) * 30 : 0 }}
          extras={{ tux: true, clock: t }}
        />
        <Toy
          kind="toaster"
          x={1370 + toasterIn}
          y={930}
          scale={1.5}
          pose={{ flip: true, mood: "angry", lean: -6 + wobble(t, 5) * 2, look: 0.6, squash: jiggle(t, tapAt + 0.12, 6, 16) * 0.1 }}
          extras={{ clock: t }}
        />
      </div>
      <NameBar side="A" t={t} at={0.15} />
      <NameBar side="B" t={t} at={0.22} />

      <Slam text="Face-off" at={before} x={960} y={250} size={200} tone="tangerine" rotate={-6} settle={{ at: phoneAt, x: 960, y: 196, scale: 0.62 }} />
      <Slam text="VS" at={fight - 0.02} out={phoneAt - 0.15} x={960} y={600} size={170} tone="gold" rotate={-4} />

      {/* "Who wins?" */}
      {t > phoneAt && (
        <div className="absolute" style={{ left: 960 - PHONE_W / 2, top: mix(1120, 268, phoneIn), transform: `rotate(${mix(8, -2, phoneIn)}deg)` }}>
          <PhoneMock width={PHONE_W}>
            <BetScreen pick={picked ? "A" : null} pickAmount={pickAmount} />
            <div className="absolute" style={{ left: SHARK_BUTTON.x - 44, top: SHARK_BUTTON.y - 44 }}>
              <Tap at={tapAt} size={88} />
            </div>
          </PhoneMock>
        </div>
      )}
      <Letterbox at={0} height={120} />
    </div>
  );
}
