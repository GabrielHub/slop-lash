"use client";

import { Burst, PhoneMock, flight } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, interpolate, mix, progress, spring } from "@/tutorial/timeline";
import { Doodle, HAT_DOODLE, HEAD_DOODLE, JETPACK_DOODLE, SHARK_DOODLE, TUX_DOODLE, type Ink } from "../doodles";
import { CREAM, FREDOKA, INK, NIGHT, Slam, Spotlight, TOY, jiggle, useBeat } from "../look";
import { UpgradeScreen } from "../phone";
import { Toy } from "../toys";

// "Between rounds, add one thing. A hat. A jetpack. A second head." The
// cactus runs the ROUND 2 card across, then the phone draws one thing on
// over the faded shark and it flies onto the toy. Each new thing replaces
// the last: one thing only.

const PHONE_W = 380;
const PHONE = { left: 170, top: 292 };
const PHONE_SCALE = PHONE_W / 418;
const CANVAS = { x: PHONE.left + (14 + 195) * PHONE_SCALE, y: PHONE.top + (14 + 70 + 52 + 173) * PHONE_SCALE };
const TOY_AT = { x: 1290, y: 880 };
const TOY_SCALE = 1.3;

type Item = { strokes: readonly Ink[]; label: string; at: number; draw: [number, number]; erase: number };

/** A pop that springs in at `at` and poofs out at `out`. */
function popInOut(t: number, at: number, out: number): number {
  if (t < at) return 0;
  const inAmount = spring(t - at, SPRINGS.jelly);
  return inAmount * (1 - progress(t, out, 0.14, ease.in));
}

function RingCard({ t, from, to }: { t: number; from: number; to: number }) {
  if (t < from || t > to) return null;
  // Runs in, stops dead in the spot holding the card up; the slam cuts it away.
  const x = interpolate(t, [from, from + 0.5, to], [-260, 960, 985], ease.out);
  const running = t < from + 0.5;
  const bob = running ? Math.abs(Math.sin((t - from) * 26)) * 30 : jiggle(t, from + 0.5, 7, 20) * -14;
  return (
    <>
      <Toy kind="cactus" x={x} y={880} scale={0.8} pose={{ hop: bob, lean: 8, mood: "smug" }} />
      <div className="absolute" style={{ left: x - 30, top: 880 - 288 - 250 - bob, transform: "rotate(-5deg)" }}>
        <div className="absolute left-[150px] top-[180px] h-[200px] w-[16px] rounded-full" style={{ background: TOY.cocoa.hex, border: `4px solid ${INK}` }} />
        <div
          className="relative grid h-[200px] w-[320px] place-items-center rounded-[22px]"
          style={{ background: CREAM, border: `6px solid ${INK}`, boxShadow: "0 18px 30px -16px rgba(0,0,0,0.6)" }}
        >
          <span className="uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 40, color: TOY.tomato.hex, lineHeight: 1 }}>
            Round
          </span>
          <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 110, color: INK, lineHeight: 0.9 }}>2</span>
        </div>
      </div>
    </>
  );
}

export function UpgradeShot() {
  const b = useBeat();
  const t = b.t;
  const add = b.word("upgrade", "add");
  const thing = b.word("upgrade", "thing");
  const hat = b.word("upgrade", "hat");
  const jetpack = b.word("upgrade", "jetpack");
  const head = b.word("upgrade", "head");

  const items: Item[] = [
    { strokes: HAT_DOODLE, label: "A top hat", at: hat, draw: [thing + 0.12, hat - 0.3], erase: hat + 0.3 },
    { strokes: JETPACK_DOODLE, label: "A jetpack", at: jetpack, draw: [hat + 0.38, jetpack - 0.26], erase: jetpack + 0.3 },
    { strokes: HEAD_DOODLE, label: "A second head", at: head, draw: [jetpack + 0.4, head - 0.28], erase: 99 },
  ];

  const phoneIn = spring(t - (add - 0.1), { stiffness: 190, damping: 21 });
  const toyIn = spring(t - (add - 0.05), SPRINGS.smooth);
  const current = items.findLast((item) => t >= item.at);

  const hatOn = popInOut(t, hat, jetpack - 0.04);
  const jetOn = popInOut(t, jetpack, head - 0.04);
  const headOn = popInOut(t, head, 99);
  const squash = items.reduce((sum, item) => sum + jiggle(t, item.at, 7, 22) * 0.18, 0);

  return (
    <div className="absolute inset-0">
      <Spotlight x={mix(960, TOY_AT.x, toyIn)} width={900} floor={880} intensity={0.85} />
      <RingCard t={t} from={-0.05} to={add - 0.03} />

      {/* The champion, trying things on. */}
      {t > add - 0.1 && (
        <div style={{ transform: `translateX(${(1 - toyIn) * 900}px)` }}>
          <Toy
            kind="shark"
            x={TOY_AT.x}
            y={TOY_AT.y}
            scale={TOY_SCALE}
            pose={{ squash, mood: t > head ? "wow" : "happy", look: -0.4 }}
            extras={{ tux: true, hat: hatOn, jetpack: jetOn, head2: headOn, clock: t }}
          />
          {items.map((item) =>
            t > item.at - 0.02 && t < item.at + 0.7 ? (
              <div key={item.label} className="absolute" style={{ left: TOY_AT.x, top: TOY_AT.y - 300 }}>
                <Burst at={item.at} count={18} speed={700} gravity={900} size={18} shape="star" colors={[TOY.butter.hex, "#FFF4DC", TOY.tangerine.hex]} seed={item.at} />
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* "One thing": the label swaps with each new thing. */}
      {current && (
        <div
          className="absolute flex items-center gap-[14px] rounded-full px-[26px] py-[8px]"
          style={{
            left: TOY_AT.x,
            top: 300,
            transform: `translate(-50%, -50%) rotate(-2deg) scale(${1 + jiggle(t, current.at, 8, 20) * 0.12})`,
            background: NIGHT,
            border: `4px solid ${TOY.butter.hex}`,
          }}
        >
          <span className="uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 30, color: TOY.butter.hex }}>
            One thing:
          </span>
          <span className="uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, color: "#FFF4DC" }}>
            {current.label}
          </span>
        </div>
      )}

      {/* The phone: draw it on, over the faded champion. */}
      {t > add - 0.1 && (
        <div className="absolute" style={{ left: PHONE.left - (1 - phoneIn) * 700, top: PHONE.top, transform: `rotate(${mix(-12, -3, phoneIn)}deg)` }}>
          <PhoneMock width={PHONE_W}>
            <UpgradeScreen
              layers={[
                { strokes: SHARK_DOODLE, opacity: 0.22 },
                { strokes: TUX_DOODLE, opacity: 0.22 },
                ...items.map((item) => ({
                  strokes: item.strokes,
                  progress: progress(t, item.draw[0], item.draw[1] - item.draw[0], ease.inOutSine),
                  opacity: 1 - progress(t, item.erase, 0.15),
                })),
              ]}
            />
          </PhoneMock>
        </div>
      )}

      {/* Each finished thing flies from the canvas onto the toy. */}
      {items.map((item) => {
        const leave = item.draw[1] + 0.02;
        if (t < leave || t > item.at + 0.02) return null;
        const path = flight(t, { at: leave, duration: item.at - leave, from: CANVAS, to: { x: TOY_AT.x, y: TOY_AT.y - 330 }, lift: 220, easing: ease.inOut });
        return (
          <div
            key={item.label}
            className="pointer-events-none absolute"
            style={{
              left: path.x - 80,
              top: path.y - 80,
              width: 160,
              height: 160,
              background: CREAM,
              border: `5px solid ${INK}`,
              borderRadius: 18,
              transform: `rotate(${path.progress * 200}deg) scale(${mix(1, 0.4, clamp(path.progress))})`,
            }}
          >
            <Doodle size={150} layers={[{ strokes: item.strokes }]} />
          </div>
        );
      })}

      <Slam text="Add one thing" at={add - 0.02} x={960} y={170} size={140} tone="gold" rotate={-3} />
    </div>
  );
}
