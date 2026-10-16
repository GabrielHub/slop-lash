"use client";

import type { ReactNode } from "react";
import { useLocalTime } from "@/tutorial/clock";
import { Camera, Count, cameraPose, flight, toScreen, type CameraKey, type CameraPose } from "@/tutorial/kit";
import { clamp, ease, interpolate, mix, progress, spring } from "@/tutorial/timeline";
import { LETTERS, type PlayerName } from "../tutorial/content";
import { At, BulbRing, MarqueeSign, Spotlight, Tile, Token } from "../tutorial/parts";
import { CheckMark } from "../tutorial/screens";
import { BetChip } from "./chip";
import { Glint, WipeIn, pulse } from "./stage";
import { AT, GLIDE, SETTLE } from "./times";

/**
 * The spot's micro-story, on one stage under one camera: the question lands
 * on a marquee, four answers wipe in, the bet chip hunts along the players
 * and drops on Sam, everyone locks in, Orecchiette lights, Sam's wrong, and
 * the chip pays out to you.
 */

type Point = { x: number; y: number };

// ---------------------------------------------------------------------------
// Layout (board px)
// ---------------------------------------------------------------------------

const SIGN = { y: 540, width: 1640, height: 520, tuckY: 222, tuckScale: 0.5 };

const TILE = { width: 820, height: 150, gapX: 40, gapY: 28, top: 395 };
const GRID_LEFT = (1920 - (TILE.width * 2 + TILE.gapX)) / 2;
const CHOICES = ["Farfalle", "Orecchiette", "Penne", "Fusilli"] as const;
const KEY = 1;

function tileBox(index: number) {
  return {
    left: GRID_LEFT + (index % 2) * (TILE.width + TILE.gapX),
    top: TILE.top + Math.floor(index / 2) * (TILE.height + TILE.gapY),
  };
}

const PILL = { width: 360, height: 150, gap: 40, y: 885 };
const PILL_LEFT = (1920 - (4 * PILL.width + 3 * PILL.gap)) / 2;
const TOKEN = { pill: 112, tile: 92 };

interface Member {
  name: PlayerName;
  label: string;
  /** The tile they lock in. */
  pick: number;
  /** Their place on that tile, counted in from its right end. */
  slot: number;
  you?: boolean;
}

/** You are Ana (ringed in gold); you bet on Sam. */
const CAST: readonly Member[] = [
  { name: "Ana", label: "You", pick: 1, slot: 0, you: true },
  { name: "Sam", label: "Sam", pick: 2, slot: 0 },
  { name: "Jo", label: "Jo", pick: 1, slot: 1 },
  { name: "Max", label: "Max", pick: 3, slot: 0 },
];
const SAM = 1;
const SAM_PICK = CAST[SAM].pick;
const YOU_RING = "var(--gold)";

const pillLeft = (index: number) => PILL_LEFT + index * (PILL.width + PILL.gap);
const home = (index: number): Point => ({ x: pillLeft(index) + 18 + TOKEN.pill / 2, y: PILL.y });
function park(index: number): Point {
  const box = tileBox(CAST[index].pick);
  return { x: box.left + TILE.width - 66 - CAST[index].slot * 104, y: box.top + TILE.height / 2 };
}
const riseAt = (index: number) => AT.players + index * 0.06;
/** One tight ripple, over a board that is otherwise still. */
const flyAt = (index: number) => AT.fly + index * 0.04;
const FLIGHT = 0.4;

/** Where player `index`'s token is: on their pill, in flight, or parked on their pick. */
function tokenAt(t: number, index: number) {
  const trip = flight(t, {
    at: flyAt(index),
    duration: FLIGHT,
    from: home(index),
    to: park(index),
    lift: 60,
    easing: ease.inOut,
  });
  return { x: trip.x, y: trip.y, size: mix(TOKEN.pill, TOKEN.tile, trip.progress), flown: trip.progress };
}

// ---------------------------------------------------------------------------
// Camera, chip path, lights
// ---------------------------------------------------------------------------

const SAM_PARK = park(SAM);
/** The zoom centres Sam's whole tile, alone on stage once the others step out. */
const SAM_FOCUS = { x: tileBox(SAM_PICK).left + TILE.width / 2, y: tileBox(SAM_PICK).top + TILE.height / 2 };
const SAM_ZOOM = 1.7;

const CAMERA: readonly CameraKey[] = [
  { at: 0 },
  { at: AT.push },
  { at: AT.push + 0.65, y: 720, zoom: 1.1 },
  { at: AT.pull, y: 720, zoom: 1.1 },
  { at: AT.pull + 0.5 },
  { at: AT.zoom },
  { at: AT.zoom + 0.42, ...SAM_FOCUS, zoom: SAM_ZOOM },
  // Then it creeps in on Sam, so the held miss never sits dead still.
  { at: AT.wipe + 0.4, ...SAM_FOCUS, zoom: SAM_ZOOM + 0.08 },
];

const CHIP = { hunt: 200, perch: 0.8, offset: 0.55 };
const HOVER_Y = PILL.y - 190;
const ENTRY_X = 2260;
/** Max, then Jo, then Sam: the chip hops right to left. */
const HUNT = [3, 2, 1] as const;
const HOP = 0.24;
const hoverX = (index: number) => home(index).x;
/** The chip lands on Sam's token. */
const SLAM_LAND = AT.slam + 0.12;

/** The chip's x as it rolls in and hunts along the pills. */
function huntX(t: number) {
  if (t < AT.hunt[0]) return mix(ENTRY_X, hoverX(HUNT[0]), progress(t, AT.chip, AT.hunt[0] - AT.chip, ease.out));
  let x = hoverX(HUNT[0]);
  for (let hop = 1; hop < HUNT.length; hop++) {
    x = mix(x, hoverX(HUNT[hop]), progress(t, AT.hunt[hop] - HOP, HOP, ease.inOut));
  }
  return x;
}

interface ChipPose {
  x: number;
  y: number;
  size: number;
  rotate: number;
  scale: number;
}

/** The bet chip in board px, from rolling in until it leaves Sam. */
function chipWorld(t: number): ChipPose | null {
  if (t < AT.chip) return null;
  const x = huntX(t);
  // It rolls: its turn is the distance still to go over its radius, so it ends upright on Sam.
  const rotate = (((x - hoverX(SAM)) / (CHIP.hunt / 2)) * 180) / Math.PI;
  const windUp = progress(t, AT.slam - 0.16, 0.16, ease.out);
  if (t < AT.slam) return { x, y: HOVER_Y - windUp * 26, size: CHIP.hunt, rotate, scale: 1 + windUp * 0.04 };
  const token = tokenAt(t, SAM);
  const perch = {
    x: token.x + token.size * CHIP.offset,
    y: token.y - token.size * CHIP.offset,
    size: token.size * CHIP.perch,
  };
  const drop = progress(t, AT.slam, SLAM_LAND - AT.slam, ease.in);
  if (drop < 1) {
    return {
      x: mix(x, perch.x, drop),
      y: mix(HOVER_Y - 26, perch.y, drop),
      size: mix(CHIP.hunt, perch.size, drop),
      rotate: drop * 12,
      scale: 1.04,
    };
  }
  return { ...perch, rotate: 12, scale: mix(1.14, 1, spring(t - SLAM_LAND, SETTLE)) };
}

interface LightKey {
  at: number;
  a: Point;
  b: Point;
  strength: number;
}

const BOARD_WASH = { a: { x: 560, y: 560 }, b: { x: 1360, y: 560 } };
const ON_SIGN = { x: 960, y: 520 };
const onPill = (index: number) => ({ x: home(index).x + 40, y: PILL.y });
const KEY_TILE = { x: tileBox(KEY).left + TILE.width / 2, y: tileBox(KEY).top + TILE.height / 2 };

/** Where the two stage lights point (board px) and how bright, keyed through the story. */
const LIGHTS: readonly LightKey[] = [
  { at: 0, a: { x: -420, y: 980 }, b: { x: 2340, y: 980 }, strength: 0 },
  { at: 0.35, a: { x: 1300, y: 640 }, b: { x: 620, y: 640 }, strength: 1 },
  { at: 0.95, a: ON_SIGN, b: ON_SIGN, strength: 1 },
  { at: AT.tuck, a: ON_SIGN, b: ON_SIGN, strength: 1 },
  { at: AT.tuck + 0.55, ...BOARD_WASH, strength: 0.4 },
  { at: AT.hunt[0] - 0.25, ...BOARD_WASH, strength: 0.4 },
  { at: AT.hunt[0], a: onPill(HUNT[0]), b: onPill(HUNT[0]), strength: 0.8 },
  { at: AT.hunt[1], a: onPill(HUNT[1]), b: onPill(HUNT[1]), strength: 0.8 },
  { at: AT.hunt[2], a: onPill(HUNT[2]), b: onPill(HUNT[2]), strength: 0.9 },
  { at: AT.pull, a: onPill(SAM), b: onPill(SAM), strength: 0.9 },
  { at: AT.pull + 0.5, ...BOARD_WASH, strength: 0.4 },
  // They hold still while the tokens fly, then snap onto the answer.
  { at: AT.reveal - 0.12, ...BOARD_WASH, strength: 0.4 },
  { at: AT.reveal + 0.12, a: KEY_TILE, b: KEY_TILE, strength: 0.85 },
  { at: AT.clear, a: KEY_TILE, b: KEY_TILE, strength: 0.85 },
  // The camera's focus is the screen's centre, so they stay on Sam's tile and then the payout card.
  { at: AT.zoom + 0.3, a: SAM_FOCUS, b: SAM_FOCUS, strength: 0.9 },
];
const LIGHT_TIMES = LIGHTS.map((key) => key.at);
const SOURCES = [
  { x: 170, y: -80 },
  { x: 1750, y: -80 },
] as const;

function track(t: number, pick: (key: LightKey) => number) {
  return interpolate(t, LIGHT_TIMES, LIGHTS.map(pick), ease.inOut);
}

/** The two stage lights, aimed at board points through the camera. */
function Lights({ t, pose }: { t: number; pose: CameraPose }) {
  const strength = track(t, (key) => key.strength);
  const targets = [
    toScreen({ x: track(t, (key) => key.a.x), y: track(t, (key) => key.a.y) }, pose),
    toScreen({ x: track(t, (key) => key.b.x), y: track(t, (key) => key.b.y) }, pose),
  ];
  return (
    <div className="pointer-events-none absolute inset-0">
      {SOURCES.map((source, index) => {
        const target = targets[index];
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const length = clamp(Math.hypot(dx, dy) * 1.3, 900, 1900);
        const angle = (-Math.atan2(dx, dy) * 180) / Math.PI;
        return (
          <Spotlight
            key={index}
            x={source.x}
            y={source.y}
            angle={angle + Math.sin(t * 0.9 + index * 2) * 1.2}
            length={length}
            spread={length * 0.38}
            strength={strength}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

/**
 * 0 to 1: the sign and tiles step back while the camera leans in on the bet,
 * and come back `returnDelay` after it starts pulling out (the band is gone by then).
 */
function betDim(t: number, returnDelay: number) {
  return progress(t, AT.push, 0.35, ease.inOut) * (1 - progress(t, AT.pull + returnDelay, 0.3, ease.inOut));
}

function QuestionSign({ t }: { t: number }) {
  const enter = spring(t - AT.sign, SETTLE);
  const tuck = spring(t - AT.tuck, GLIDE);
  // Out of the way whenever the camera leans in, so it is never cropped by the frame.
  const dim = Math.max(betDim(t, 0.26), clearOut(t));
  // Hidden, its seventy-odd bulbs would still repaint every frame.
  if (dim >= 0.999) return null;
  return (
    <At x={960} y={mix(SIGN.y, SIGN.tuckY, tuck)}>
      <div
        style={{
          transform: `translateY(${(1 - enter) * -40}px) scale(${mix(0.9, 1, enter) * mix(1, SIGN.tuckScale, tuck)})`,
          opacity: progress(t, AT.sign, 0.16) * (1 - dim),
        }}
      >
        <MarqueeSign
          width={SIGN.width}
          height={SIGN.height}
          band={46}
          bulb={20}
          spacing={58}
          power={progress(t, AT.sign, 0.7, ease.inOut)}
          chase={1.5}
        >
          <div className="text-center font-display text-[150px] font-black leading-[1.08] tracking-[-0.01em]">
            <WipeIn at={AT.lines[0]} duration={0.3}>
              <span className="whitespace-nowrap text-ink">Which pasta means</span>
            </WipeIn>
            <WipeIn at={AT.lines[1]} duration={0.3}>
              <span className="whitespace-nowrap text-gold qs-marquee-text">“little ears”?</span>
            </WipeIn>
          </div>
        </MarqueeSign>
      </div>
    </At>
  );
}

/** 0 to 1: everything but Sam's tile and token steps out, before the camera goes in on him. */
function clearOut(t: number) {
  return progress(t, AT.clear, 0.18, ease.in);
}

function Tiles({ t }: { t: number }) {
  const dim = betDim(t, 0.04);
  const clear = clearOut(t);
  const revealed = t >= AT.reveal;
  const settled = progress(t, AT.reveal + 0.06, 0.25);
  return (
    <>
      {CHOICES.map((choice, index) => {
        const box = tileBox(index);
        const key = index === KEY;
        const out = index === SAM_PICK ? 0 : clear;
        // Gone, the key tile's bulb ring would still repaint every frame.
        if (out >= 0.999) return null;
        const lift = key ? pulse(t, AT.reveal + 0.08, 0.34) * 0.035 : 0;
        return (
          <div
            key={choice}
            className="absolute"
            style={{
              left: box.left,
              top: box.top,
              opacity: (1 - dim) * (1 - out) * (key || index === SAM_PICK ? 1 : mix(1, 0.6, settled)),
              transform: `scale(${1 + lift})`,
            }}
          >
            <WipeIn at={AT.tiles + index * 0.07} duration={0.3}>
              <Tile
                letter={LETTERS[index]}
                text={choice}
                width={TILE.width}
                height={TILE.height}
                font={78}
                state={revealed && !key ? "dim" : "idle"}
              />
            </WipeIn>
            {index === SAM_PICK && t >= AT.miss && (
              <div className="absolute inset-0">
                <WipeIn at={AT.miss} duration={0.18} edge={null}>
                  <WrongTile letter={LETTERS[index]} text={choice} />
                </WipeIn>
              </div>
            )}
            {key && revealed && (
              <>
                <div className="absolute inset-0">
                  <WipeIn at={AT.reveal} duration={0.2} edge="#fffbea">
                    <Tile letter={LETTERS[index]} text={choice} width={TILE.width} height={TILE.height} font={78} state="lit" />
                  </WipeIn>
                </div>
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
                  <Glint at={AT.reveal + 0.22} duration={0.45} width={200} />
                </div>
                <div className="absolute -left-[22px] -top-[22px]">
                  <BulbRing
                    width={TILE.width + 44}
                    height={TILE.height + 44}
                    radius={44}
                    spacing={52}
                    size={16}
                    power={progress(t, AT.reveal, 0.4)}
                    chase={2}
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Sam's pick, struck red when he misses. */
function WrongTile({ letter, text }: { letter: string; text: string }) {
  return (
    <div
      className="flex items-center gap-[22px] rounded-[26px] border-[3px] border-fail bg-surface px-[18px]"
      style={{
        width: TILE.width,
        height: TILE.height,
        boxShadow: "inset 0 0 0 999px var(--fail-soft), 0 0 0 6px color-mix(in srgb, var(--fail) 22%, transparent)",
      }}
    >
      <span
        className="grid shrink-0 place-items-center rounded-[18px] bg-fail font-display font-black text-accent-ink"
        style={{ width: TILE.height - 44, height: TILE.height - 44, fontSize: 78 * 0.95 }}
      >
        {letter}
      </span>
      <span className="font-semibold leading-tight text-fail" style={{ fontSize: 78 }}>
        {text}
      </span>
    </div>
  );
}

function Pills({ t }: { t: number }) {
  const chip = chipWorld(t);
  const hunting = t >= AT.hunt[0] - 0.3 && t < SLAM_LAND;
  return (
    <>
      {CAST.map((member, index) => {
        const rise = spring(t - riseAt(index), SETTLE);
        // They drop away together, before any token moves.
        const leave = progress(t, AT.drop, 0.2, ease.in);
        if (rise <= 0.001 || leave >= 1) return null;
        const near = hunting && chip ? clamp(1 - Math.abs(chip.x - hoverX(index)) / 220) : 0;
        const bet = index === SAM ? progress(t, SLAM_LAND, 0.06) : 0;
        const flash = index === SAM ? pulse(t, SLAM_LAND, 0.1) : 0;
        const hot = Math.max(near * 0.7, bet);
        return (
          <div
            key={member.name}
            className="absolute flex items-center rounded-[40px] border-[4px]"
            style={{
              left: pillLeft(index),
              top: PILL.y - PILL.height / 2,
              width: PILL.width,
              height: PILL.height,
              paddingLeft: 18 + TOKEN.pill + 24,
              opacity: clamp(rise * 2) * (1 - leave),
              transform: `translateY(${(1 - rise) * 240 + leave * 60}px)`,
              borderColor: `color-mix(in srgb, var(--punch) ${Math.round(hot * 100)}%, var(--edge))`,
              background: `color-mix(in srgb, ${flash > 0 ? "#fffbea" : "var(--punch)"} ${Math.round(flash > 0 ? flash * 70 : bet * 14)}%, var(--surface))`,
              boxShadow: `0 0 0 ${hot * 8}px color-mix(in srgb, var(--punch) 30%, transparent), 0 24px 40px -24px rgba(0,0,0,0.55)`,
            }}
          >
            <span
              className={`font-display text-[72px] font-bold leading-none ${member.you ? "text-gold" : "text-ink"}`}
            >
              {member.label}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** A ring of light bursting out from a hit, for its impact frame. */
function Impact({ t, at, x, y, size }: { t: number; at: number; x: number; y: number; size: number }) {
  const p = progress(t, at, 0.4, ease.out);
  if (p <= 0 || p >= 1) return null;
  return (
    <At x={x} y={y}>
      <div
        className="rounded-full border-gold"
        style={{
          width: size,
          height: size,
          borderWidth: mix(14, 2, p),
          transform: `scale(${mix(0.7, 2.3, p)})`,
          opacity: 1 - p,
        }}
      />
    </At>
  );
}

function Badge({ size, tone, children, shown }: { size: number; tone: "win" | "fail"; children: ReactNode; shown: number }) {
  if (shown <= 0.001) return null;
  return (
    <span
      className={`absolute grid place-items-center rounded-full font-display font-black leading-none text-accent-ink ${tone === "win" ? "bg-win" : "bg-fail"}`}
      style={{
        width: size,
        height: size,
        right: -size * 0.18,
        bottom: -size * 0.12,
        fontSize: size * 0.62,
        transform: `scale(${shown})`,
        boxShadow: "0 0 0 4px var(--surface)",
      }}
    >
      {children}
    </span>
  );
}

function Tokens({ t }: { t: number }) {
  const clear = clearOut(t);
  return (
    <>
      {CAST.map((member, index) => {
        const rise = spring(t - (riseAt(index) + 0.04), SETTLE);
        const out = index === SAM ? 0 : clear;
        if (rise <= 0.001 || out >= 0.999) return null;
        const token = tokenAt(t, index);
        const right = member.pick === KEY;
        const wrongAt = index === SAM ? AT.miss : AT.reveal + 0.2;
        const wrong = !right && t >= wrongAt;
        const ring = member.you ? YOU_RING : wrong ? "var(--fail)" : undefined;
        const land = token.flown >= 1 ? pulse(t, flyAt(index) + FLIGHT, 0.2) * 0.08 : 0;
        const plus = member.you ? spring(t - AT.plus, SETTLE) : 0;
        const check = right && !member.you ? spring(t - (AT.plus + 0.08), SETTLE) : 0;
        const miss = index === SAM ? spring(t - AT.miss, SETTLE) : 0;
        return (
          <At key={member.name} x={token.x} y={token.y + (1 - rise) * 240}>
            <div className="relative" style={{ opacity: clamp(rise * 2) * (1 - out), transform: `scale(${1 + land})` }}>
              <Token name={member.name} size={token.size} ring={ring} />
              <Badge size={token.size * 0.46} tone="win" shown={check}>
                <CheckMark size={token.size * 0.3} />
              </Badge>
              <Badge size={token.size * 0.5} tone="fail" shown={miss}>
                ✕
              </Badge>
              {plus > 0.001 && (
                // Your points on a big badge above your token: right-aligned to it, clear of the tucked sign.
                <span
                  className="absolute whitespace-nowrap rounded-[40px] bg-win px-[0.3em] font-display text-[120px] font-black leading-[1.16] text-accent-ink"
                  style={{
                    right: -14,
                    bottom: token.size + 14,
                    transformOrigin: "85% 100%",
                    transform: `translateY(${(1 - plus) * 30}px) scale(${mix(0.5, 1, plus)})`,
                    opacity: clamp(plus * 3),
                    boxShadow: "0 0 0 6px var(--surface), 0 20px 36px -16px rgba(0,0,0,0.55)",
                  }}
                >
                  +100
                </span>
              )}
            </div>
          </At>
        );
      })}
      <Impact t={t} at={SLAM_LAND} x={home(SAM).x} y={home(SAM).y} size={TOKEN.pill} />
      <Impact t={t} at={AT.miss} x={SAM_PARK.x} y={SAM_PARK.y} size={TOKEN.tile} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Supers and the payout (screen space)
// ---------------------------------------------------------------------------

/** A word in a slot: `from` rolls up and out as `to` rolls up in, as `swap` goes 0 to 1. */
function Slot({ from, to, swap, toClassName = "" }: { from: string; to: string; swap: number; toClassName?: string }) {
  return (
    <span className="grid overflow-hidden" style={{ height: "1.12em" }}>
      <span style={{ gridArea: "1 / 1", transform: `translateY(${-swap * 105}%)` }}>{from}</span>
      <span className={toClassName} style={{ gridArea: "1 / 1", transform: `translateY(${(1 - swap) * 105}%)` }}>
        {to}
      </span>
    </span>
  );
}

/** The bet's lower third: "Who gets it wrong?" while the chip hunts, flipped to "Sam" as it lands. */
function BetBand({ t }: { t: number }) {
  const swap = progress(t, SLAM_LAND, 0.22, ease.inOut);
  const flash = pulse(t, SLAM_LAND, 0.12);
  return (
    <At x={960} y={280}>
      <WipeIn at={AT.band} duration={0.32} out={AT.bandOut} outDuration={0.24}>
        <div
          className="flex h-[184px] items-stretch overflow-hidden rounded-[36px]"
          style={{ boxShadow: "0 30px 60px -24px rgba(0,0,0,0.6)" }}
        >
          <div
            className="grid w-[200px] place-items-center"
            style={{ background: `color-mix(in srgb, #fffbea ${Math.round(flash * 70)}%, var(--punch))` }}
          >
            <BetChip size={146} />
          </div>
          <div className="flex items-center border-y-[5px] border-r-[5px] border-punch bg-surface pl-[46px] pr-[56px]">
            <span className="flex items-center whitespace-nowrap font-display text-[112px] font-black leading-[1.12] text-ink">
              <Slot from="Who" to="Sam" swap={swap} toClassName="text-punch" />
              <span className="ml-[0.24em]">gets it wrong</span>
              <Slot from="?" to="." swap={swap} />
            </span>
          </div>
        </div>
      </WipeIn>
    </At>
  );
}

const CARD = { x: 960, y: 560, width: 1180, height: 400 };
const CARD_ORIGIN = { x: CARD.x - CARD.width / 2, y: CARD.y - CARD.height / 2 };
const CARD_TOKEN = { x: 640, y: 528, size: 210 };
const CARD_CHIP = { x: CARD_TOKEN.x + 90, y: CARD_TOKEN.y - 90, size: 140 };
/** The chip leaves Sam, flips across and lands on you just as the card finishes opening. */
const PAY_FLIGHT = { at: AT.payoff + 0.08, duration: 0.5 };
const PAY_LAND = PAY_FLIGHT.at + PAY_FLIGHT.duration;
const CARD_OPEN = PAY_LAND - 0.34;
const COUNT = 0.42;

function Payout({ t }: { t: number }) {
  if (t < AT.payoff) return null;
  const flash = pulse(t, PAY_LAND, 0.12);
  const thump = pulse(t, PAY_LAND + COUNT, 0.22) * 0.05;
  return (
    <>
      <At x={CARD.x} y={CARD.y}>
        <WipeIn at={CARD_OPEN} duration={0.3} from="centre" edge={null}>
          <div
            className="relative rounded-[48px] border-[5px] border-win bg-surface"
            style={{
              width: CARD.width,
              height: CARD.height,
              boxShadow: `inset 0 0 0 999px color-mix(in srgb, var(--win) ${Math.round(9 + flash * 24)}%, transparent), 0 40px 80px -40px rgba(0,0,0,0.7)`,
            }}
          >
            <div
              className="absolute"
              style={{ left: CARD_TOKEN.x - CARD_ORIGIN.x, top: CARD_TOKEN.y - CARD_ORIGIN.y, transform: "translate(-50%, -50%)" }}
            >
              <Token name="Ana" size={CARD_TOKEN.size} ring={YOU_RING} />
            </div>
            <span
              className="absolute -translate-x-1/2 font-display text-[72px] font-bold leading-none text-gold"
              style={{ left: CARD_TOKEN.x - CARD_ORIGIN.x, top: CARD_TOKEN.y - CARD_ORIGIN.y + CARD_TOKEN.size / 2 + 18 }}
            >
              You
            </span>
            <span
              className="absolute top-1/2 font-display text-[250px] font-black leading-none text-win"
              style={{
                left: 440,
                transform: `translateY(-52%) scale(${1 + thump})`,
                transformOrigin: "20% 50%",
                opacity: progress(t, PAY_LAND - 0.04, 0.06),
              }}
            >
              <Count from={0} to={150} at={PAY_LAND} duration={COUNT} format={(value) => `+${Math.round(value)}`} />
            </span>
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[44px]">
              <Glint at={PAY_LAND + COUNT - 0.05} duration={0.5} width={220} />
            </div>
          </div>
        </WipeIn>
      </At>
      <Impact t={t} at={PAY_LAND} x={CARD_CHIP.x} y={CARD_CHIP.y} size={CARD_CHIP.size} />
    </>
  );
}

/** The bet chip, drawn over everything in screen px so it can leave the camera for the payout. */
function ChipLayer({ t, pose }: { t: number; pose: CameraPose }) {
  let x: number;
  let y: number;
  let size: number;
  let transform: string;
  let spin = 0;
  if (t < AT.payoff) {
    const chip = chipWorld(t);
    if (!chip) return null;
    const at = toScreen(chip, pose);
    x = at.x;
    y = at.y;
    size = chip.size * pose.zoom;
    transform = `rotate(${chip.rotate}deg) scale(${chip.scale})`;
  } else {
    const startPose = cameraPose(AT.payoff, CAMERA);
    const start = chipWorld(AT.payoff)!;
    const from = toScreen(start, startPose);
    const trip = flight(t, { ...PAY_FLIGHT, from, to: CARD_CHIP, lift: 240, easing: ease.inOut });
    // A dip before it leaves, one clean flip on the way, a crisp settle on landing.
    const dip = t < PAY_FLIGHT.at ? 0.9 : 1;
    const flip = Math.cos(trip.progress * Math.PI * 2);
    const settle = trip.progress >= 1 ? mix(1.14, 1, spring(t - PAY_LAND, SETTLE)) : 1;
    x = trip.x;
    y = trip.y;
    size = mix(start.size * startPose.zoom, CARD_CHIP.size, trip.progress);
    transform = `rotate(${mix(12, -8, trip.progress)}deg) scale(${Math.max(0.06, Math.abs(flip)) * dip * settle}, ${dip * settle})`;
    // Landed, it keeps turning slowly on your token, so the held card never sits dead still.
    spin = Math.max(0, t - PAY_LAND) * 70;
  }
  return (
    <At x={x} y={y}>
      <div style={{ transform }}>
        <BetChip size={size} spin={spin} />
      </div>
    </At>
  );
}

/** 0 to 1: the whole board clears as the chip leaves Sam, so the payout card gets a bare, lit stage. */
function stageOut(t: number) {
  return progress(t, AT.payoff + 0.1, 0.22, ease.inOut);
}

export function Show() {
  const t = useLocalTime();
  const pose = cameraPose(t, CAMERA);
  const stage = 1 - stageOut(t);
  return (
    <div className="absolute inset-0">
      <Lights t={t} pose={pose} />
      <Camera keys={CAMERA}>
        {stage > 0.001 && (
          <div className="absolute inset-0" style={{ opacity: stage }}>
            <QuestionSign t={t} />
            <Tiles t={t} />
            <Pills t={t} />
            <Tokens t={t} />
          </div>
        )}
      </Camera>
      <BetBand t={t} />
      <Payout t={t} />
      <ChipLayer t={t} pose={pose} />
    </div>
  );
}
