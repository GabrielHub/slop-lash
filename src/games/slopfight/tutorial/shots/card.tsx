"use client";

import { Burst } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { ArenaPostcard, type ArenaId } from "../arenas";
import { FREDOKA, NIGHT, Spotlight, TOY, jiggle, useBeat } from "../look";
import { Plate } from "../phone";
import { CAST, Toy, TrophyShape, type ToyKind } from "../toys";

// "Three arenas. Six fights. Short on fighters? The house brings its own."
// Tonight's card: three arena postcards flip in, six bouts drop in under
// them, the empty corners wobble, and the house drops in two of its own.

const COLS = [480, 960, 1440];
const CARD_W = 420;
const CARD_TOP = 164;
const TILE_TOP = [528, 650];
const TILE_W = CARD_W + 24;
const ARENA_ORDER: ArenaId[] = ["garage", "kitchen", "rooftop"];

type Bout = { col: number; row: number; a?: ToyKind; b?: ToyKind; label?: string; final?: boolean };

const BOUTS: Bout[] = [
  { col: 0, row: 0, a: "shark", b: "duck" },
  { col: 0, row: 1, a: "toaster", b: "cactus" },
  { col: 1, row: 0, a: "duck", b: "cactus" },
  { col: 1, row: 1, a: "shark", b: "toaster" },
  { col: 2, row: 0, label: "Third place" },
  { col: 2, row: 1, label: "The Final", final: true },
];

const HOUSE: ToyKind[] = ["duck", "cactus"];

/** A corner on the card: the champion's plate, or a wobbling "?" until the house fills it. */
function Slot({ kind, t, short, fighters, own, index }: { kind: ToyKind; t: number; short: number; fighters: number; own: number; index: number }) {
  const house = HOUSE.includes(kind);
  if (!house) return <Plate kind={kind} size={84} mood={kind === "toaster" ? "angry" : "happy"} />;
  const flipAt = own + index * 0.07;
  const flip = progress(t, flipAt, 0.24, ease.inOut);
  const showPlate = flip >= 0.5;
  const squeeze = Math.abs(Math.cos(flip * Math.PI));
  const wobble = (jiggle(t, short + index * 0.05, 5, 18) + jiggle(t, fighters + index * 0.05, 5, 18)) * 16;
  const alarm = t > short - 0.05 && !showPlate;
  return (
    <span className="relative" style={{ transform: `scaleX(${squeeze}) rotate(${showPlate ? 0 : wobble}deg) scale(${showPlate ? 1 + jiggle(t, flipAt + 0.12, 7, 20) * 0.12 : 1})` }}>
      {showPlate ? (
        <Plate kind={kind} size={84} />
      ) : (
        <span
          className={`grid size-[84px] place-items-center rounded-[18px] border-[4px] border-dashed ${alarm ? "border-fail bg-fail/12 text-fail" : "border-edge-strong text-ink-dim"}`}
          style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 46 }}
        >
          ?
        </span>
      )}
    </span>
  );
}

function BoutTile({ bout, number, t, at, short, fighters, own }: { bout: Bout; number: number; t: number; at: number; short: number; fighters: number; own: number }) {
  const drop = spring(t - at, SPRINGS.pop);
  if (t < at) return null;
  return (
    <div
      className={`absolute flex h-[104px] items-center gap-[16px] rounded-[22px] border-[3px] px-[16px] ${
        bout.final ? "border-gold bg-gold/15" : "border-edge-strong bg-surface"
      }`}
      style={{
        left: COLS[bout.col] - TILE_W / 2,
        top: TILE_TOP[bout.row],
        width: TILE_W,
        transform: `translateY(${(1 - drop) * -60}px) scale(${mix(0.7, 1, drop)})`,
        opacity: clamp(drop * 3),
        boxShadow: "0 18px 36px -22px rgba(0,0,0,0.6)",
      }}
    >
      <span
        className="grid size-[50px] shrink-0 place-items-center rounded-full font-mono text-[30px] font-bold"
        style={{ background: NIGHT, color: bout.final ? TOY.butter.hex : "#FFF4DC" }}
      >
        {number}
      </span>
      {bout.label ? (
        <span className="flex flex-1 items-center justify-between">
          <span className={`uppercase ${bout.final ? "text-gold" : "text-ink"}`} style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 40, lineHeight: 1 }}>
            {bout.label}
          </span>
          {bout.final ? (
            <svg viewBox="-100 -180 200 190" width={64} height={62} aria-hidden="true">
              <TrophyShape size={1} />
            </svg>
          ) : (
            <span className="grid size-[56px] place-items-center rounded-full border-[4px] font-mono text-[28px] font-bold" style={{ background: TOY.cocoa.hex, borderColor: TOY.cocoa.dark, color: "#FFF4DC" }}>
              3
            </span>
          )}
        </span>
      ) : (
        <span className="flex flex-1 items-center justify-center gap-[18px]">
          <Slot kind={bout.a!} t={t} short={short} fighters={fighters} own={own} index={number} />
          <span className="text-ink-dim" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 34, fontStyle: "italic" }}>
            VS
          </span>
          <Slot kind={bout.b!} t={t} short={short} fighters={fighters} own={own} index={number + 0.5} />
        </span>
      )}
    </div>
  );
}

/** A house champion dropping in from the rafters with its "House" tag. */
function HouseDrop({ kind, x, land, t }: { kind: ToyKind; x: number; land: number; t: number }) {
  const fallTime = 0.42;
  if (t < land - fallTime) return null;
  const fall = progress(t, land - fallTime, fallTime, ease.in);
  const y = mix(-260, 870, fall);
  const k = jiggle(t, land, 7, 22);
  const tag = spring(t - (land + 0.1), SPRINGS.pop);
  return (
    <>
      <Toy
        kind={kind}
        x={x}
        y={y}
        scale={0.68}
        shadow={fall >= 1}
        pose={{ squash: fall < 1 ? -0.18 : k * 0.4, mood: t > land + 0.15 ? "smug" : "wow" }}
      />
      {t > land - 0.02 && (
        <div className="absolute" style={{ left: x, top: 870 }}>
          <Burst at={land} count={14} speed={520} gravity={1400} size={14} direction={-90} spread={150} colors={[TOY.butter.hex, "#FFF4DC"]} seed={x} />
        </div>
      )}
      {t > land + 0.1 && (
        <div
          className="absolute rounded-full px-[22px] py-[6px] uppercase"
          style={{
            left: x,
            top: 600,
            transform: `translate(-50%, -50%) rotate(${x < 960 ? -6 : 6}deg) scale(${tag})`,
            background: NIGHT,
            color: TOY.butter.hex,
            fontFamily: FREDOKA,
            fontWeight: 700,
            fontSize: 36,
            letterSpacing: "0.08em",
            border: `4px solid ${TOY.butter.hex}`,
          }}
        >
          House
        </div>
      )}
      {t > land + 0.2 && (
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-[28px] font-semibold text-ink-dim"
          style={{ left: x, top: 880, opacity: progress(t, land + 0.2, 0.3) }}
        >
          {CAST[kind].name}
        </span>
      )}
    </>
  );
}

export function CardShot() {
  const b = useBeat();
  const t = b.t;
  const three = b.word("fight", "three");
  const arenas = b.word("fight", "arenas");
  const six = b.word("fight", "six");
  const short = b.word("fight", "short");
  const fighters = b.word("fight", "fighters");
  const brings = b.word("fight", "brings");
  const own = b.word("fight", "own");

  const flips = [three - 0.08, three + 0.16, arenas + 0.12];
  const boutAt = (index: number) => six - 0.06 + index * 0.085;
  const header = spring(t - (three - 0.15), SPRINGS.smooth);
  const push = mix(1, 1.035, progress(t, 0, own + 0.6, ease.inOutSine));
  const quake = jiggle(t, brings - 0.02, 9, 40) * 8 + jiggle(t, brings + 0.12, 9, 40) * 6;

  return (
    <div className="absolute inset-0" style={{ transformOrigin: "960px 520px", transform: `translateY(${quake}px) scale(${push})` }}>
      <Spotlight x={960} width={1700} floor={880} intensity={0.55} />

      {/* Tonight's card. */}
      <div
        className="absolute left-1/2 top-[54px] flex items-center gap-[16px] rounded-full px-[30px] py-[8px] uppercase"
        style={{ transform: `translateX(-50%) translateY(${(1 - header) * -120}px)`, background: NIGHT, color: TOY.butter.hex, fontFamily: FREDOKA, fontWeight: 700, fontSize: 38, letterSpacing: "0.1em" }}
      >
        Tonight&apos;s card
      </div>

      {/* Three arenas. */}
      {ARENA_ORDER.map((id, index) => {
        const at = flips[index];
        if (t < at) return null;
        const flip = spring(t - at, { stiffness: 210, damping: 15 });
        const tilt = [-3, 1.5, 3][index];
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: COLS[index] - (CARD_W + 24) / 2,
              top: CARD_TOP,
              transformOrigin: "50% 0%",
              transform: `perspective(1400px) rotateX(${(1 - flip) * 80}deg) rotate(${tilt}deg)`,
              opacity: clamp((t - at) * 8),
            }}
          >
            <ArenaPostcard id={id} t={t} width={CARD_W} />
          </div>
        );
      })}

      {/* Six fights. */}
      {BOUTS.map((bout, index) => (
        <BoutTile key={index} bout={bout} number={index + 1} t={t} at={boutAt(index)} short={short} fighters={fighters} own={own} />
      ))}

      {/* The house brings its own. */}
      <HouseDrop kind="duck" x={124} land={brings - 0.02} t={t} />
      <HouseDrop kind="cactus" x={1796} land={brings + 0.12} t={t} />
    </div>
  );
}
