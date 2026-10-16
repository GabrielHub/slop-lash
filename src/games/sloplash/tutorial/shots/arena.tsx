"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { Avatar } from "@/room/avatar";
import { useLocalCues, useLocalTime } from "@/tutorial/clock";
import {
  BOARD,
  Burst,
  Camera,
  PHONE_SCREEN,
  STAMP_IMPACT,
  Stamp,
  cameraPose,
  centredPhone,
  flight,
  phonePoint,
  phoneScale,
  shakeOffset,
  toScreen,
  type CameraKey,
  type CameraPose,
} from "@/tutorial/kit";
import {
  SPRINGS,
  clamp,
  ease,
  hash01,
  mix,
  progress,
  spring,
  type LocalCues,
} from "@/tutorial/timeline";
import {
  KIT,
  MY_ANSWER,
  PROMPT,
  RAFI,
  RIVAL_ANSWER,
  VOTERS,
  YOU,
  type CastMember,
} from "../content";
import {
  AuthorScreen,
  BALLOT,
  BallotScreen,
  Crown,
  Float,
  Phone,
  REACTIONS,
  Sticker,
  Touch,
  VotedScreen,
  WRITER,
  WriterScreen,
} from "../parts";
import { keyAt, typed } from "./write";

/**
 * Rival, Vote and Score on one stage: your answer meets the rival's, the TV
 * puts them head to head, phones vote (yours can't), reactions fly, then the
 * reveal counts the points and stamps the sweep.
 */

// The TV's layout, in board px at full screen.
const CARD = { width: 720, height: 380 } as const;
const LEFT = { x: 550, y: 535 } as const;
const RIGHT = { x: 1370, y: 535 } as const;
const PROMPT_Y = 245;
const PILLS_Y = 152;
const BAND_Y = 806;
const CHIP = 62;
const CHIP_X = (index: number) => 1010 + index * 78;
/** Where the n-th voter's face sits in a card's stack. */
const STACK = (index: number) => ({ x: LEFT.x - CARD.width / 2 + 74 + index * 50, y: LEFT.y + 128 });
const SCORE = { x: LEFT.x + CARD.width / 2 - 52, y: LEFT.y + 130 } as const;
/** Seconds from a vote landing to its "+100" reaching the score. */
const PLUS_TRAVEL = 0.45;

/** The camera framing that shows the TV as a set on the right of the board. */
const TV_SHOT = { x: 442, y: 647, zoom: 0.56 } as const;

// Phones in front of the TV.
const PHONE = { x: 390, y: 540, width: 360 } as const;
const RIVAL_PHONE = { x: 1370, y: 570, width: 330 } as const;
const PHONE_FRAME = centredPhone(PHONE.x, PHONE.y, PHONE.width);
const RIVAL_FRAME = centredPhone(RIVAL_PHONE.x, RIVAL_PHONE.y, RIVAL_PHONE.width);

export function arenaBeats(b: LocalCues) {
  const someone = b.word("rival", "somebody");
  const same = b.word("rival", "same");
  const make = b.word("rival", "make");
  const tapAt = b.word("tap", "one", 1) + 0.05;
  const votes = b.word("tap", "votes") + 0.15;
  const flights = [0, 1, 2, 3].map((index) => b.word("points", "vote") + 0.12 + index * 0.24);
  return {
    drop: 0.02,
    someone,
    typeFrom: someone + 0.5,
    typeTo: Math.max(someone + 1.1, same - 0.15),
    same,
    make,
    rivalOut: make + 0.12,
    funnier: b.word("rival", "funnier."),
    faceoff: b.at("faceoff"),
    head1: b.word("faceoff", "head"),
    head2: b.word("faceoff", "head", 1),
    right: b.word("faceoff", "right"),
    big: b.word("faceoff", "big"),
    tap: b.at("tap"),
    others: [votes, votes + 0.42, votes + 0.84],
    deliberate: b.word("tap", "for"),
    tapAt,
    kitLand: tapAt + 0.58,
    voted: b.word("tap", "that's"),
    self: b.at("self"),
    poke: b.word("self", "vote") - 0.1,
    tryAt: b.word("self", "yourself."),
    nice: b.word("self", "nice") - STAMP_IMPACT,
    react: b.at("react"),
    throws: [
      b.word("react", "laugh,") + 0.05,
      b.word("react", "throw") + 0.05,
      b.word("react", "throw") + 0.42,
    ],
    points: b.at("points"),
    flights,
    lands: flights.map((start) => start + 0.45),
    hundred: b.word("points", "hundred"),
    sweep: b.at("sweep"),
    every: b.word("sweep", "every"),
    flawless: b.wordEnd("sweep", "vote,") - 0.06,
    bonus: b.word("sweep", "fifty"),
  };
}

type ArenaBeats = ReturnType<typeof arenaBeats>;

function cameraKeys(k: ArenaBeats): CameraKey[] {
  const full = { x: BOARD.width / 2, y: BOARD.height / 2, zoom: 1 };
  const push = { x: 860, y: 548, zoom: 1.06 };
  return [
    { at: 0, ...full },
    { at: k.big - 0.05, ...full },
    { at: k.big + 0.85, ...TV_SHOT },
    { at: k.points - 0.1, ...TV_SHOT },
    { at: k.points + 0.7, ...full },
    { at: k.flawless - 0.2, ...full },
    { at: k.flawless + 0.5, ...push },
    { at: k.bonus + 1.5, ...push },
  ];
}

export function ArenaShot() {
  const t = useLocalTime();
  const b = useLocalCues();
  const k = arenaBeats(b);
  const keys = cameraKeys(k);
  const camera = cameraPose(t, keys);
  const slam = shakeOffset(t, k.head2, 12, 0.4);
  const stampShake = shakeOffset(t, k.flawless + STAMP_IMPACT, 10, 0.4);
  const tvFill = clamp((1 - camera.zoom) / 0.3);

  return (
    <div
      className="absolute inset-0"
      style={{ transform: `translate(${slam.x + stampShake.x}px, ${slam.y + stampShake.y}px)` }}
    >
      <Camera keys={keys}>
        <Television fill={tvFill} />
        <Pills k={k} />
        <TopPrompt k={k} />
        <Cards k={k} />
        <Band k={k} />
        <Plates k={k} />
        <RivalLink k={k} />
        <Reactions k={k} />
      </Camera>
      <RivalPhone k={k} />
      <VoterPhones k={k} camera={camera} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

const BEZEL = 44;

/** The big screen: a bezel and stand around the board, seen once the camera pulls back. */
function Television({ fill }: { fill: number }) {
  if (fill <= 0) return null;
  return (
    <>
      <div
        className="absolute"
        style={{
          left: BOARD.width / 2 - 110,
          top: BOARD.height + BEZEL - 4,
          width: 220,
          height: 120,
          background: "linear-gradient(180deg, #1d1a25, #0f0d14)",
        }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{
          left: BOARD.width / 2 - 420,
          top: BOARD.height + BEZEL + 100,
          width: 840,
          height: 56,
          background: "linear-gradient(180deg, #2a2632, #0f0d14)",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)",
        }}
      />
      <div
        className="absolute rounded-[64px]"
        style={{
          left: -BEZEL,
          top: -BEZEL,
          width: BOARD.width + BEZEL * 2,
          height: BOARD.height + BEZEL * 2,
          border: `${BEZEL}px solid #14121a`,
          boxShadow:
            "0 0 0 3px #2c2836, 0 70px 120px -40px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(255,255,255,0.05)",
        }}
      />
      <div className="absolute inset-0 rounded-[22px] bg-canvas" style={{ opacity: fill }} />
    </>
  );
}

/** One pill per matchup this round; this one is the gold pill. */
function Pills({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  const at = k.faceoff + 0.3;
  if (t < at) return null;
  return (
    <div className="absolute flex items-center gap-[16px]" style={{ left: 960, top: PILLS_Y, transform: "translate(-50%, -50%)" }}>
      {Array.from({ length: 6 }, (_, index) => {
        const pop = spring(t - at - index * 0.04, SPRINGS.pop);
        return (
          <span
            key={index}
            className={`h-[22px] rounded-full ${index === 0 ? "w-[58px] bg-gold" : "w-[22px] bg-edge-strong"}`}
            style={{ transform: `scale(${clamp(pop, 0, 2)})` }}
          />
        );
      })}
    </div>
  );
}

/** The prompt in gold across the top: it rises out of the two cards' matching headers. */
function TopPrompt({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  const at = k.faceoff;
  if (t < at) return null;
  const rise = spring(t - at, SPRINGS.smooth);
  return (
    <p
      className="absolute left-0 right-0 text-center font-display text-[66px] font-bold leading-tight text-gold-ink"
      style={{
        top: PROMPT_Y - 44,
        opacity: progress(t, at, 0.25),
        transform: `translateY(${(1 - rise) * 120}px) scale(${mix(0.6, 1, rise)})`,
      }}
    >
      {PROMPT}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The answer cards
// ---------------------------------------------------------------------------

function Cards({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  // Rival: yours drops in from above; theirs leaves the rival's phone on Send.
  const drop = spring(t - k.drop, SPRINGS.slam);
  const out = spring(t - k.rivalOut, SPRINGS.smooth);
  const box = phonePoint(RIVAL_FRAME, PHONE_SCREEN.width / 2, WRITER.box.top + WRITER.box.height / 2);
  const boxScale = ((PHONE_SCREEN.width - WRITER.pad * 2) * phoneScale(RIVAL_PHONE.width)) / CARD.width;

  // Head to head: the cards pull back, then slam together.
  const pull = progress(t, k.head1, 0.3, ease.out) * 46;
  const snap = t >= k.head2 ? spring(t - k.head2, SPRINGS.slam) : 0;
  const apart = pull * (1 - snap);
  const nudge = t >= k.funnier ? Math.exp(-(t - k.funnier) * 6) * Math.sin((t - k.funnier) * 22) : 0;

  const header = 1 - progress(t, k.faceoff, 0.3, ease.out);
  const owners = 1 - progress(t, k.faceoff, 0.25, ease.out);

  // The reveal.
  const landed = k.lands.filter((at) => t >= at).length;
  const verdict = t >= k.sweep;

  return (
    <>
      {t >= k.rivalOut && (
        <TvCard
          x={RIGHT.x + apart}
          y={RIGHT.y}
          dx={mix(box.x - RIGHT.x, 0, out)}
          dy={mix(box.y - RIGHT.y, 0, out)}
          scale={mix(boxScale, 1, out)}
          answer={RIVAL_ANSWER}
          header={header}
          owner={owners > 0 ? { member: RAFI, opacity: owners } : null}
          dim={verdict ? progress(t, k.sweep, 0.4, ease.out) : 0}
          footer={
            verdict ? (
              <ScoreMath
                line="0 votes"
                score="+0"
                tone="text-ink-dim"
                pop={0}
                opacity={progress(t, k.sweep, 0.3)}
              />
            ) : null
          }
        />
      )}
      <TvCard
        x={LEFT.x - apart}
        y={LEFT.y}
        dy={mix(-760, 0, drop)}
        scale={1 + nudge * 0.05}
        answer={MY_ANSWER}
        header={header}
        owner={owners > 0 ? { member: YOU, opacity: owners } : null}
        glow={t >= k.funnier ? Math.max(0, 1 - (t - k.funnier) / 1.2) : 0}
        focus={verdict ? progress(t, k.sweep, 0.4, ease.out) : 0}
        footer={<MyScore k={k} landed={landed} />}
        stack={<Stack k={k} />}
        corner={
          <>
            <div className="absolute -left-[34px] -top-[66px]">
              <Crown at={k.sweep + 0.05} size={104} />
            </div>
            <div className="absolute -top-[30px] right-[36px]">
              <Stamp worn text="Flawless" at={k.flawless} tone="teal" size={46} />
            </div>
          </>
        }
      />
      <VsBadge at={k.head2} />
    </>
  );
}

function TvCard({
  x,
  y,
  dx = 0,
  dy = 0,
  scale = 1,
  answer,
  header,
  owner,
  dim = 0,
  focus = 0,
  glow = 0,
  footer,
  stack,
  corner,
}: {
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  scale?: number;
  answer: string;
  /** 0..1: the small prompt header the card carries before the TV takes over. */
  header: number;
  owner: { member: CastMember; opacity: number } | null;
  dim?: number;
  focus?: number;
  glow?: number;
  footer?: ReactNode;
  stack?: ReactNode;
  corner?: ReactNode;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: x - CARD.width / 2,
        top: y - CARD.height / 2,
        width: CARD.width,
        height: CARD.height,
        transform: `translate(${dx}px, ${dy}px) scale(${scale * (1 - dim * 0.04 + focus * 0.03)})`,
      }}
    >
      <div
        className="absolute inset-0 rounded-[38px] border-[3px] border-edge bg-surface shadow-[0_30px_60px_-34px_rgba(0,0,0,0.55)]"
        style={{
          borderColor: focus > 0 ? `color-mix(in srgb, var(--gold) ${Math.round(focus * 100)}%, var(--edge))` : undefined,
          boxShadow:
            glow > 0
              ? `0 0 0 ${Math.round(glow * 10)}px color-mix(in srgb, var(--punch) ${Math.round(glow * 45)}%, transparent)`
              : undefined,
        }}
      />
      {header > 0 && (
        <p
          className="absolute left-[40px] right-[40px] top-[30px] font-display text-[32px] font-bold leading-tight text-gold-ink"
          style={{ opacity: header, transform: `translateY(${(1 - header) * -30}px)` }}
        >
          {PROMPT}
        </p>
      )}
      <div
        className="absolute inset-x-[44px] flex items-center"
        style={{ top: mix(78, 40, 1 - header), bottom: 112 }}
      >
        <p
          className="font-display text-[62px] font-semibold leading-[1.08] text-ink text-balance"
          style={{ opacity: 1 - dim * 0.62 }}
        >
          <Unbroken text={answer} />
        </p>
      </div>
      <div className="absolute bottom-[28px] left-[40px] right-[40px] flex items-end justify-between">
        <div className="relative h-[64px] flex-1">{stack}</div>
        {footer}
      </div>
      {owner && (
        <div className="absolute -left-[24px] -top-[30px]" style={{ opacity: owner.opacity }}>
          <div className="rounded-full shadow-[0_0_0_5px_var(--surface)]">
            <Avatar name={owner.member.name} modelId={owner.member.modelId} size="70px" />
          </div>
        </div>
      )}
      {corner}
    </div>
  );
}

/** Text whose hyphenated words never break at the hyphen ("Wi-Fi"). */
export function Unbroken({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, index) => (
        <span key={index} className={word.includes("-") ? "whitespace-nowrap" : undefined}>
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function VsBadge({ at }: { at: number }) {
  const t = useLocalTime();
  if (t < at - 0.02) return null;
  const drop = spring(t - at + 0.02, SPRINGS.slam);
  return (
    <div className="absolute" style={{ left: 960, top: LEFT.y }}>
      <Burst at={at + 0.08} count={18} speed={760} gravity={900} size={16} duration={0.9} seed={8} />
      <div
        className="grid size-[104px] place-items-center rounded-full border-[3px] border-edge-strong bg-vs font-display text-[46px] font-black text-ink"
        style={{
          transform: `translate(-50%, -50%) scale(${mix(2.6, 1, drop)}) rotate(${mix(-30, 0, drop)}deg)`,
          opacity: progress(t, at - 0.02, 0.06),
        }}
      >
        VS
      </div>
    </div>
  );
}

/** "4 votes × 100" over "+400". */
function ScoreMath({
  line,
  score,
  tone,
  pop,
  opacity = 1,
  bonus,
}: {
  line: ReactNode;
  score: string;
  tone: string;
  pop: number;
  opacity?: number;
  bonus?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end text-right" style={{ opacity }}>
      <p className="flex items-center font-mono text-[30px] leading-none text-ink-dim">
        {line}
        {bonus}
      </p>
      <p
        className={`mt-[10px] font-mono text-[76px] font-black leading-none ${tone}`}
        style={{ transform: `scale(${1 + pop * 0.22})`, transformOrigin: "100% 60%" }}
      >
        {score}
      </p>
    </div>
  );
}

function MyScore({ k, landed }: { k: ArenaBeats; landed: number }) {
  const t = useLocalTime();
  if (landed === 0) return null;
  const lastArrival = k.lands.filter((at) => t >= at + PLUS_TRAVEL).at(-1);
  const landPop = lastArrival === undefined ? 0 : Math.exp(-(t - lastArrival - PLUS_TRAVEL) * 8);
  const bonusOn = t >= k.bonus;
  const arrived = k.lands.filter((at) => t >= at + PLUS_TRAVEL).length;
  const value = bonusOn ? mix(400, 600, progress(t, k.bonus + 0.12, 0.55, ease.out)) : arrived * 100;
  const bonusPop = bonusOn ? Math.exp(-(t - k.bonus - 0.12) * 4) * (t > k.bonus + 0.12 ? 1 : 0) : 0;
  const times = t >= k.hundred;
  const timesPop = spring(t - k.hundred, SPRINGS.pop);
  return (
    <ScoreMath
      line={
        <>
          <span>{`${landed} ${landed === 1 ? "vote" : "votes"}`}</span>
          {times && (
            <span
              className="ml-[10px] inline-block font-bold text-gold-ink"
              style={{ transform: `scale(${mix(0.4, 1, timesPop)})` }}
            >
              × 100
            </span>
          )}
        </>
      }
      bonus={
        bonusOn ? (
          <span
            className="ml-[12px] inline-block rounded-full bg-gold-soft px-[14px] py-[4px] font-bold text-gold-ink"
            style={{ transform: `scale(${mix(0.3, 1, spring(t - k.bonus, SPRINGS.pop))})` }}
          >
            +50%
          </span>
        ) : undefined
      }
      score={`+${Math.round(value)}`}
      tone="text-gold-ink"
      pop={Math.max(landPop, bonusPop)}
    />
  );
}

/** The voters' faces in your card, once their votes fly in. */
function Stack({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  return (
    <>
      {VOTERS.map((member, index) => {
        const land = k.lands[index]!;
        if (t < land) return null;
        const pop = spring(t - land, SPRINGS.pop);
        const pulseAt = k.every + index * 0.1;
        const pulse = t >= pulseAt ? Math.exp(-(t - pulseAt) * 7) * Math.sin((t - pulseAt) * 18) : 0;
        return (
          <div
            key={member.name}
            className="absolute bottom-0 rounded-full shadow-[0_0_0_5px_var(--surface)]"
            style={{
              left: index * 50,
              transform: `scale(${mix(1.5, 1, pop) + Math.abs(pulse) * 0.3})`,
              zIndex: 10 - index,
            }}
          >
            <Avatar name={member.name} modelId={member.modelId} size="64px" />
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// The ballot band, the flights, the names
// ---------------------------------------------------------------------------

/** When each ballot chip fills: three voters, then Kit's tap. */
function fillTimes(k: ArenaBeats) {
  return [...k.others, k.kitLand];
}

function Band({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  if (t < k.right) return null;
  const fills = fillTimes(k);
  const hint = progress(t, k.right, 0.3, ease.out) * (1 - progress(t, k.points, 0.3));
  return (
    <>
      <p
        className="absolute text-right font-sans text-[36px] text-ink-dim"
        style={{
          right: BOARD.width - CHIP_X(0) + 50,
          top: BAND_Y - 24,
          opacity: hint,
          transform: `translateY(${(1 - hint) * 14}px)`,
        }}
      >
        Vote on your phone
      </p>
      {VOTERS.map((member, index) => {
        const appear = spring(t - k.right - index * 0.05, SPRINGS.pop);
        const fill = fills[index]!;
        const filled = t >= fill;
        const fillPop = filled ? spring(t - fill, SPRINGS.pop) : 0;
        const unmaskAt = k.points + 0.12 + index * 0.06;
        const flip = progress(t, unmaskAt, 0.3, ease.inOut);
        const face = flip >= 0.5;
        const go = flight(t, {
          at: k.flights[index]!,
          duration: 0.45,
          from: { x: CHIP_X(index), y: BAND_Y },
          to: STACK(index),
          lift: 200,
          easing: ease.inOut,
        });
        if (go.progress >= 1) return null;
        const flying = go.progress > 0;
        return (
          <div
            key={member.name}
            className="absolute"
            style={{
              left: flying ? go.x : CHIP_X(index),
              top: flying ? go.y : BAND_Y,
              width: CHIP,
              height: CHIP,
              transform: `translate(-50%, -50%) scale(${clamp(appear, 0, 1.4)}) scaleX(${Math.abs(Math.cos(flip * Math.PI))})`,
            }}
          >
            {face ? (
              <div className="rounded-full shadow-[0_0_0_4px_var(--surface)]">
                <Avatar name={member.name} modelId={member.modelId} size={`${CHIP}px`} />
              </div>
            ) : filled ? (
              <span
                className="grid h-full w-full place-items-center rounded-full bg-teal text-accent-ink"
                style={{ transform: `scale(${mix(0.3, 1, fillPop)})` }}
              >
                <CheckIcon size={36} />
              </span>
            ) : (
              <span className="block h-full w-full rounded-full border-[3px] border-dashed border-edge-strong" />
            )}
          </div>
        );
      })}
      {k.lands.map((land, index) => (
        <PlusHundred key={index} at={land} index={index} />
      ))}
    </>
  );
}

/** "+100" popping off each vote as it lands and sliding along the face row into the score. */
function PlusHundred({ at, index }: { at: number; index: number }) {
  const t = useLocalTime();
  const local = t - at;
  if (local < 0 || local > PLUS_TRAVEL + 0.05) return null;
  const pop = spring(local, SPRINGS.pop);
  const chip = STACK(index);
  const go = flight(t, {
    at: at + 0.06,
    duration: PLUS_TRAVEL - 0.06,
    from: { x: chip.x + 78, y: chip.y - 4 },
    to: { x: SCORE.x - 80, y: SCORE.y - 4 },
    lift: 30,
    easing: ease.inOut,
  });
  return (
    <p
      className="absolute font-mono text-[46px] font-black leading-none text-gold-ink"
      style={{
        left: go.x,
        top: go.y,
        opacity: clamp(local / 0.05) * (1 - progress(go.progress, 0.8, 0.2)),
        transform: `translate(-50%, -50%) scale(${mix(0.3, 1, pop) * mix(1, 0.6, go.progress)})`,
        textShadow: "0 4px 16px color-mix(in srgb, var(--gold) 40%, transparent)",
      }}
    >
      +100
    </p>
  );
}

/** Who wrote what, unmasked under the cards at the verdict. */
function Plates({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  if (t < k.sweep + 0.2) return null;
  const plates = [
    { member: RAFI, x: RIGHT.x, at: k.sweep + 0.2, win: false },
    { member: YOU, x: LEFT.x, at: k.sweep + 0.36, win: true },
  ];
  return (
    <>
      {plates.map((plate) => {
        const reveal = progress(t, plate.at, 0.4, ease.emphasized);
        return (
          <div
            key={plate.member.name}
            className="absolute flex items-center gap-[18px]"
            style={{
              left: plate.x,
              top: BAND_Y,
              opacity: reveal,
              clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)`,
              transform: `translate(-50%, -50%) translateY(${(1 - reveal) * 8}px)`,
            }}
          >
            <Avatar name={plate.member.name} modelId={plate.member.modelId} size="64px" />
            <span
              className={`font-display text-[48px] font-bold leading-none ${plate.win ? "text-gold-ink" : "text-ink"}`}
            >
              {plate.member.name}
            </span>
          </div>
        );
      })}
      <div className="absolute" style={{ left: SCORE.x, top: SCORE.y - 20 }}>
        <Burst at={k.bonus + 0.12} count={16} speed={620} gravity={1200} size={14} duration={1} seed={3} colors={["var(--gold)", "var(--gold)", "var(--punch)"]} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rival
// ---------------------------------------------------------------------------

/** The rival's phone: the same prompt, their answer, Send. */
function RivalPhone({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  if (t > k.rivalOut + 0.8) return null;
  const enter = spring(t - k.someone, SPRINGS.smooth);
  if (t < k.someone) return null;
  const leave = progress(t, k.rivalOut + 0.05, 0.5, ease.in);
  const glow = sameGlow(t, k);
  const text = typed(t, RIVAL_ANSWER, k.typeFrom, k.typeTo);
  const send = phonePoint(RIVAL_FRAME, PHONE_SCREEN.width / 2, WRITER.send.top + WRITER.send.height / 2);
  return (
    <>
      <Phone
        x={RIVAL_PHONE.x}
        y={RIVAL_PHONE.y}
        width={RIVAL_PHONE.width}
        dx={(1 - enter) * 760}
        dy={leave * 900}
        rotate={(1 - enter) * 12 + leave * 10}
        sticker={<Sticker member={RAFI} rotate={6} />}
      >
        <WriterScreen
          sent={[0, 0]}
          prompt={PROMPT}
          text={t >= k.rivalOut ? "" : text}
          caret={t < k.rivalOut}
          counter={null}
          ready={text.length > 0 && t < k.rivalOut}
          press={t >= k.make - 0.02 && t < k.make + 0.14 ? 1 : 0}
          activeKey={keyAt(t, RIVAL_ANSWER, k.typeFrom, k.typeTo)}
          promptGlow={glow}
          promptOpacity={t >= k.rivalOut ? 0 : 1}
        />
      </Phone>
      <Touch
        from={k.make - 0.45}
        to={k.make + 0.35}
        path={[
          { at: k.make - 0.45, x: send.x + 40, y: send.y + 120 },
          { at: k.make - 0.05, x: send.x, y: send.y },
        ]}
        taps={[k.make]}
      />
    </>
  );
}

/** Both copies of the prompt glow together on "same prompt". */
function sameGlow(t: number, k: ArenaBeats): number {
  const local = t - k.same;
  if (local < 0 || local > 1.6) return 0;
  return Math.abs(Math.sin(local * Math.PI * 1.6)) * (1 - local / 1.6);
}

/** A gold line from your card's prompt to the rival's: the same prompt. */
function RivalLink({ k }: { k: ArenaBeats }) {
  const t = useLocalTime();
  if (t < k.same || t > k.rivalOut + 0.4) return null;
  const draw = progress(t, k.same, 0.5, ease.out);
  const fade = 1 - progress(t, k.rivalOut, 0.3);
  const from = { x: LEFT.x + 250, y: LEFT.y - CARD.height / 2 + 34 };
  const phonePrompt = phonePoint(RIVAL_FRAME, 30, WRITER.prompt + 20);
  const to = { x: phonePrompt.x - 10, y: phonePrompt.y };
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 150 };
  const label = spring(t - k.same - 0.25, SPRINGS.pop);
  return (
    <div className="absolute inset-0" style={{ opacity: fade }}>
      <svg className="absolute inset-0 overflow-visible" width={BOARD.width} height={BOARD.height}>
        <path
          d={`M ${from.x} ${from.y} Q ${mid.x} ${mid.y} ${to.x} ${to.y}`}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={1 - draw}
          pathLength={1}
        />
      </svg>
      {t >= k.same + 0.25 && (
        <span
          className="absolute rounded-full bg-gold px-[24px] py-[8px] font-display text-[34px] font-black uppercase tracking-[0.08em] text-accent-ink"
          style={{
            left: mid.x,
            top: (from.y + to.y) / 2 - 75,
            transform: `translate(-50%, -50%) scale(${mix(0.3, 1, label)}) rotate(-3deg)`,
          }}
        >
          Same prompt
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voters' phones and reactions
// ---------------------------------------------------------------------------

function VoterPhones({ k, camera }: { k: ArenaBeats; camera: CameraPose }) {
  const t = useLocalTime();
  // Kit's ballot, then your phone (you can't vote), then Kit's again to react.
  const kitIn = spring(t - k.tap + 0.1, SPRINGS.smooth);
  const kitOut = progress(t, k.self - 0.05, 0.35, ease.in);
  const youIn = spring(t - k.self - 0.12, SPRINGS.smooth);
  const youOut = progress(t, k.react - 0.05, 0.35, ease.in);
  const backIn = spring(t - k.react - 0.16, SPRINGS.smooth);
  const backOut = progress(t, k.points - 0.15, 0.4, ease.in);

  const buttons = [0, 1].map((index) =>
    phonePoint(
      PHONE_FRAME,
      PHONE_SCREEN.width / 2,
      BALLOT.first + index * (BALLOT.height + BALLOT.gap) + BALLOT.height / 2,
    ),
  );
  const pick = progress(t, k.tapAt, 0.25, ease.out);
  const voted = progress(t, k.voted, 0.35, ease.out);

  const answerBox = phonePoint(PHONE_FRAME, PHONE_SCREEN.width / 2, 250);
  const lock = progress(t, k.tryAt + 0.02, 0.35, ease.out);
  const shake =
    t >= k.tryAt ? Math.sin((t - k.tryAt) * 48) * 18 * Math.max(0, 1 - (t - k.tryAt) / 0.55) : 0;

  const strip = (index: number) =>
    phonePoint(PHONE_FRAME, 18 + 32 + index * ((PHONE_SCREEN.width - 36 - 64) / 4), PHONE_SCREEN.height - 92);
  const lit = REACTIONS.map((_, index) => {
    const at = k.throws[index];
    return at === undefined ? 0 : progress(t, at, 0.3, ease.out);
  });

  const chip = toScreen({ x: CHIP_X(3), y: BAND_Y }, camera);
  const card = toScreen({ x: LEFT.x - 40, y: LEFT.y - 60 }, camera);

  return (
    <>
      {t >= k.tap - 0.1 && t < k.self + 0.4 && (
        <Phone
          x={PHONE.x}
          y={PHONE.y}
          width={PHONE.width}
          dx={(1 - kitIn) * -760}
          dy={kitOut * 1300}
          rotate={(1 - kitIn) * -10}
          sticker={<Sticker member={KIT} rotate={5} />}
        >
          <BallotScreen
            prompt={PROMPT}
            answers={[MY_ANSWER, RIVAL_ANSWER]}
            picked={t >= k.tapAt ? 0 : null}
            pick={pick}
            voted={voted}
          />
        </Phone>
      )}
      <Touch
        from={k.deliberate}
        to={k.tapAt + 0.35}
        path={[
          { at: k.deliberate, x: buttons[1]!.x + 80, y: buttons[1]!.y + 40 },
          { at: k.deliberate + 0.45, x: buttons[1]!.x + 40, y: buttons[1]!.y },
          { at: k.deliberate + 0.95, x: buttons[0]!.x + 50, y: buttons[0]!.y + 10 },
          { at: k.tapAt - 0.45, x: buttons[1]!.x + 30, y: buttons[1]!.y - 10 },
          { at: k.tapAt - 0.04, x: buttons[0]!.x + 20, y: buttons[0]!.y },
        ]}
        taps={[k.tapAt]}
      />
      <Dot at={k.tapAt + 0.08} land={k.kitLand} from={buttons[0]!} to={chip} />

      {t >= k.self && t < k.react + 0.4 && (
        <>
          <Phone
            x={PHONE.x}
            y={PHONE.y}
            width={PHONE.width}
            dy={(1 - youIn) * 900 + youOut * 1300}
            rotate={(1 - youIn) * 6}
            sticker={<Sticker member={YOU} rotate={5} />}
          >
            <AuthorScreen answer={MY_ANSWER} lock={lock} shake={shake} />
          </Phone>
          <div
            className="absolute"
            style={{ left: PHONE.x, top: PHONE.y - 10, transform: `translateY(${youOut * 1300}px)` }}
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <Stamp worn text="Nice try" at={k.nice} tone="fail" size={70} />
            </div>
          </div>
        </>
      )}
      <Touch
        from={k.poke}
        to={k.tryAt + 0.5}
        path={[
          { at: k.poke, x: answerBox.x + 60, y: answerBox.y + 260 },
          { at: k.tryAt - 0.05, x: answerBox.x + 10, y: answerBox.y + 30 },
        ]}
        taps={[k.tryAt, k.tryAt + 0.26]}
      />

      {t >= k.react && t < k.points + 0.4 && (
        <Phone
          x={PHONE.x}
          y={PHONE.y}
          width={PHONE.width}
          dx={(1 - backIn) * -760 + backOut * -800}
          rotate={(1 - backIn) * -10 - backOut * 10}
          sticker={<Sticker member={KIT} rotate={5} />}
        >
          <VotedScreen answer={MY_ANSWER} lit={lit} />
        </Phone>
      )}
      <Touch
        from={k.throws[0]! - 0.4}
        to={k.throws[2]! + 0.4}
        path={[
          { at: k.throws[0]! - 0.4, x: strip(0).x + 40, y: strip(0).y - 120 },
          { at: k.throws[0]! - 0.04, x: strip(0).x, y: strip(0).y },
          { at: k.throws[1]! - 0.04, x: strip(1).x, y: strip(1).y },
          { at: k.throws[2]! - 0.04, x: strip(2).x, y: strip(2).y },
        ]}
        taps={k.throws}
      />
      {k.throws.map((at, index) => (
        <Thrown key={index} emoji={REACTIONS[index]!} at={at + 0.05} from={strip(index)} to={card} seed={index} />
      ))}
    </>
  );
}

/** Kit's vote: a teal dot from the tapped answer to the ballot band on the TV. */
function Dot({
  at,
  land,
  from,
  to,
}: {
  at: number;
  land: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  const t = useLocalTime();
  const go = flight(t, { at, duration: land - at, from, to, lift: 220, easing: ease.inOut });
  if (go.progress <= 0 || go.progress >= 1) return null;
  return (
    <span
      className="absolute grid size-[52px] place-items-center rounded-full bg-teal text-accent-ink shadow-[0_0_24px_color-mix(in_srgb,var(--teal)_60%,transparent)]"
      style={{ left: go.x - 26, top: go.y - 26, transform: `scale(${mix(1, 0.6, go.progress)})` }}
    >
      <CheckIcon size={30} />
    </span>
  );
}

/** A reaction thrown from the phone to the TV. */
function Thrown({
  emoji,
  at,
  from,
  to,
  seed,
}: {
  emoji: string;
  at: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  seed: number;
}) {
  const t = useLocalTime();
  const go = flight(t, { at, duration: 0.5, from, to: { x: to.x + (seed - 1) * 50, y: to.y }, lift: 260, easing: ease.out });
  if (go.progress <= 0 || go.progress >= 1) return null;
  return (
    <span
      className="pointer-events-none absolute text-[64px] leading-none"
      style={{
        left: go.x,
        top: go.y,
        transform: `translate(-50%, -50%) rotate(${go.progress * 360}deg) scale(${mix(1, 0.8, go.progress)})`,
      }}
    >
      {emoji}
    </span>
  );
}

/** Reactions rising off your card on the TV: the thrown ones, and the rest of the room's. */
function Reactions({ k }: { k: ArenaBeats }) {
  const floats: { emoji: string; at: number; x: number; seed: number }[] = [];
  k.throws.forEach((at, index) => {
    for (let n = 0; n < 2; n++) {
      floats.push({
        emoji: REACTIONS[index]!,
        at: at + 0.5 + n * 0.14,
        x: LEFT.x - 200 + hash01(index * 7 + n) * 400,
        seed: index * 10 + n,
      });
    }
  });
  for (let n = 0; n < 4; n++) {
    floats.push({
      emoji: REACTIONS[(n + 3) % REACTIONS.length]!,
      at: k.throws[0]! + 0.75 + n * 0.22,
      x: LEFT.x - 240 + hash01(40 + n) * 480,
      seed: 50 + n,
    });
  }
  return (
    <>
      {floats.map((float) => (
        <Float
          key={`${float.seed}`}
          emoji={float.emoji}
          x={float.x}
          y={LEFT.y - 70}
          at={float.at}
          seed={float.seed}
          rise={300}
          duration={Math.min(1.4, k.points - float.at)}
          size={104}
        />
      ))}
    </>
  );
}
