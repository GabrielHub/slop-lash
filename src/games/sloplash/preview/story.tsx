"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/room/avatar";
import { useLocalTime } from "@/tutorial/clock";
import {
  Burst,
  Camera,
  STAMP_IMPACT,
  Stamp,
  cameraPose,
  flight,
  shakeOffset,
  toScreen,
  type CameraKey,
} from "@/tutorial/kit";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { BOT, DANA, KIT, MO, PROMPT, RAFI, YOU, colorOf, type CastMember } from "../tutorial/content";
import { Crown } from "../tutorial/parts";
import { Beams } from "./beams";
import { Glitch, flickerOn, glitchBursts } from "./glitch";
import { BEATS as B } from "./times";

/**
 * The micro-story, on one stage: the prompt glitches onto the wall, two
 * answers slam in head to head with their authors hidden, every vote piles
 * onto the left, FLAWLESS, and the authors flip: the loser was the AI.
 */

const CARD = { width: 800, height: 540 } as const;
const LEFT = { x: 490, y: 500 } as const;
const RIGHT = { x: 1430, y: 500 } as const;
const TOP = LEFT.y - CARD.height / 2;
const BOTTOM = LEFT.y + CARD.height / 2;
const TOKEN = 150;
/** Where each author's token sits: on its card's top-left corner. */
const AUTHOR_X = { left: LEFT.x - CARD.width / 2 + 64, right: RIGHT.x - CARD.width / 2 + 64 } as const;
const HOOK_Y = 520;
const HEADER_Y = 118;
const SUPER_Y = 900;

/** The human who wrote the winner, and everyone else at the table, who votes. */
const AUTHOR = MO;
const VOTERS = [YOU, RAFI, KIT, DANA] as const;
const CHIP = 116;
const STACK = (index: number) => ({
  x: LEFT.x - CARD.width / 2 + 58 + CHIP / 2 + index * 80,
  y: BOTTOM - 52 - CHIP / 2,
});
const lands = B.votes.map((at) => at + B.flight);

/** The push onto the AI's reveal: its token, its name, the top of its answer. */
const PUSH = { x: AUTHOR_X.right + 330, y: TOP + 160, zoom: 1.42 } as const;
/** The spotlight's centre on the board: the AI's card, a little high. */
const SPOT = { x: RIGHT.x, y: TOP + 190 } as const;

export function Story() {
  const t = useLocalTime();
  const shakes = [
    shakeOffset(t, B.leftIn + 0.1, 10, 0.3),
    shakeOffset(t, B.rightIn + 0.1, 10, 0.3),
    shakeOffset(t, B.vs + 0.06, 18, 0.4),
    shakeOffset(t, B.flawless + STAMP_IMPACT, 26, 0.5),
    shakeOffset(t, B.flipRight + 0.15, 14, 0.35),
    ...lands.map((at) => shakeOffset(t, at, 6, 0.2)),
  ];
  const x = shakes.reduce((sum, offset) => sum + offset.x, 0);
  const y = shakes.reduce((sum, offset) => sum + offset.y, 0);
  // The AI's crash takes over the screen before the cut.
  const crash = progress(t, B.glitch, B.cut - B.glitch, ease.in);
  const frame = Math.floor(t * 30);
  const tear = crash > 0 ? (hash01(frame * 3.3) - 0.5) * 140 * crash : 0;
  // The rig: up for the hook, down for the game, a flare on the stamp.
  const lights =
    (flickerOn(t, 0.02, B.promptLock, 9) ? 0.85 : 0.2) * (1 - progress(t, B.promptUp, 0.6, ease.inOut)) +
    (t >= B.flawless + STAMP_IMPACT ? Math.exp(-(t - B.flawless - STAMP_IMPACT) * 2.5) * 0.6 : 0);
  const full = { x: 960, y: 540, zoom: 1 };
  const keys: CameraKey[] = [
    { at: 0, ...full, zoom: 1.05 },
    { at: B.promptUp, ...full },
    { at: B.askOut, ...full, zoom: 1.015 },
    { at: B.flawless, ...full },
    { at: B.flawless + 0.5, ...full, zoom: 1.02 },
    { at: B.push, ...full },
    { at: B.push + 0.38, ...PUSH },
    { at: B.pull, ...PUSH, zoom: PUSH.zoom + 0.05 },
    { at: B.pull + 0.36, ...full },
    { at: B.cut, ...full, zoom: 1.03 },
  ];
  const spot = progress(t, B.push, 0.3, ease.out) * (1 - progress(t, B.pull, 0.3, ease.in));
  return (
    <div
      className="absolute inset-0"
      style={{
        transform: `translate(${x + tear}px, ${y}px)`,
        opacity: crash > 0 && hash01(frame * 5.1) > 0.7 ? 0.35 : 1,
      }}
    >
      <Beams amount={Math.min(1, lights)} />
      <Camera keys={keys}>
        <Prompt />
        <Card side={-1} answer={<>Anyone here know how to land?</>} />
        <Card
          side={1}
          answer={
            <>
              We&apos;re out of <span className="whitespace-nowrap">Wi-Fi.</span> And fuel.
            </>
          }
        />
        <VsBadge />
        <Votes />
        <Author x={AUTHOR_X.left} member={AUTHOR} flip={B.flipLeft} seed={2} />
        <Author x={AUTHOR_X.right} member={BOT} flip={B.flipRight} seed={5} />
      </Camera>
      <ImpactFlash
        hits={[
          { at: B.vs + 0.04, tone: "var(--punch)" },
          { at: B.flawless + STAMP_IMPACT, tone: "var(--teal)" },
        ]}
      />
      {spot > 0 && <Spotlight amount={spot} at={toScreen(SPOT, cameraPose(t, keys))} />}
      <Super text="Which one's the AI?" accent={["AI?"]} at={B.ask} out={B.askOut} />
      <Super text="Humans 1. AI 0." accent={["AI", "0."]} at={B.score} />
    </div>
  );
}

/** A two-frame flash in the hit's colour on the big hits. */
function ImpactFlash({ hits }: { hits: readonly { at: number; tone: string }[] }) {
  const t = useLocalTime();
  const hit = hits.find((candidate) => t >= candidate.at && t < candidate.at + 0.07);
  if (!hit) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: hit.tone, opacity: t < hit.at + 0.035 ? 0.24 : 0.1 }}
    />
  );
}

/** The rig narrows to a spotlight on the AI's card while the camera is on it. */
function Spotlight({ amount, at }: { amount: number; at: { x: number; y: number } }) {
  // The wings fall into the set's dark: the canvas on the dark set, deep ink on the cream one.
  return (
    <div
      className="pointer-events-none absolute inset-0 [--sl-spot:color-mix(in_srgb,var(--bg)_88%,transparent)] [[data-theme=light]_&]:[--sl-spot:color-mix(in_srgb,var(--ink)_55%,transparent)]"
      style={{
        opacity: amount,
        background: `radial-gradient(ellipse 800px 540px at ${at.x}px ${at.y}px, transparent 56%, var(--sl-spot) 100%)`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

/** Big and centred for the hook, then it shrinks into the one-line header over the cards. */
function Prompt() {
  const t = useLocalTime();
  if (t < B.promptOn) return null;
  const glitch = 1 - progress(t, B.promptOn, B.promptLock - B.promptOn + 0.1, ease.in);
  const shown = flickerOn(t, B.promptOn, B.promptLock, 3);
  const lock = t >= B.promptLock ? Math.exp(-(t - B.promptLock) * 8) : 0;
  const hold = progress(t, B.promptLock, B.promptUp - B.promptLock);
  const up = progress(t, B.promptUp, 0.4, ease.inOut);
  const bigOut = progress(up, 0.3, 0.45);
  const smallIn = progress(up, 0.45, 0.5, ease.out);
  // Out of the way while the camera is on the AI.
  const aside = progress(t, B.push, 0.3) * (1 - progress(t, B.pull, 0.3));
  return (
    <>
      {bigOut < 1 && (
        <div
          className="absolute left-1/2 w-[1640px]"
          style={{
            top: HOOK_Y,
            opacity: (shown ? 1 : 0) * (1 - bigOut),
            transform: `translate(-50%, -50%) translateY(${mix(0, HEADER_Y - HOOK_Y, up)}px) scale(${mix(1, 0.56, up) * (1 + lock * 0.06 + hold * 0.035)})`,
          }}
        >
          <Glitch amount={glitch} seed={3} split={22} tear={70}>
            {(tone) => (
              <p
                className="text-center font-display text-[132px] font-black leading-[1.02] tracking-[-0.015em] text-gold-ink text-balance"
                style={{
                  color: tone ?? undefined,
                  textShadow: tone
                    ? undefined
                    : `0 0 ${Math.round(20 + lock * 50)}px color-mix(in srgb, var(--gold) ${Math.round(18 + lock * 40)}%, transparent)`,
                }}
              >
                {PROMPT}
              </p>
            )}
          </Glitch>
        </div>
      )}
      {smallIn > 0 && (
        <p
          className="absolute left-1/2 whitespace-nowrap font-display text-[74px] font-extrabold leading-none text-gold-ink"
          style={{
            top: HEADER_Y,
            opacity: smallIn * (1 - aside * 0.75),
            transform: `translate(-50%, -50%) scale(${mix(1.12, 1, smallIn)})`,
          }}
        >
          {PROMPT}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

/** An answer card slamming in from its side; the left one collects every vote. */
function Card({ side, answer }: { side: -1 | 1; answer: ReactNode }) {
  const t = useLocalTime();
  const left = side < 0;
  const at = left ? B.leftIn : B.rightIn;
  if (t < at) return null;
  const centre = left ? LEFT : RIGHT;
  const fly = spring(t - at, { stiffness: 520, damping: 22 });
  const skew = (1 - clamp(fly)) * 14 * -side;
  const win = left ? progress(t, B.flawless + STAMP_IMPACT, 0.3, ease.out) : 0;
  const dim = left ? 0 : progress(t, B.flawless + STAMP_IMPACT, 0.4, ease.out);
  const landed = lands.filter((land) => t >= land);
  const lastLand = landed.at(-1);
  const bump = left && lastLand !== undefined ? Math.exp(-(t - lastLand) * 10) : 0;
  // A slow idle float once landed, so the held beats never sit dead still.
  const idle = clamp(t - at - 0.4);
  const bobY = wobble(t * 1.1, left ? 1 : 4) * 6 * idle;
  const bobR = wobble(t * 0.8, left ? 2 : 7) * 0.35 * idle;
  return (
    <div
      className="absolute"
      style={{
        left: centre.x - CARD.width / 2,
        top: TOP,
        width: CARD.width,
        height: CARD.height,
        opacity: progress(t, at, 0.06),
        transform: `translate(${mix(side * 1500, 0, fly)}px, ${bobY}px) skewX(${skew}deg) rotate(${mix(side * 6, 0, fly) + bobR}deg) scale(${(1 + bump * 0.025) * (1 - dim * 0.04)})`,
      }}
    >
      <div
        className="absolute inset-0 rounded-[48px] border-[5px] bg-surface"
        style={{
          borderColor:
            win > 0 ? `color-mix(in srgb, var(--gold) ${Math.round(win * 100)}%, var(--edge))` : "var(--edge)",
          boxShadow: `0 40px 80px -40px rgba(0,0,0,0.55)${win > 0 ? `, 0 0 0 ${Math.round(win * 10)}px color-mix(in srgb, var(--gold) 28%, transparent), 0 0 ${Math.round(win * 90)}px color-mix(in srgb, var(--gold) 30%, transparent)` : ""}`,
        }}
      />
      <div className="absolute inset-x-[58px] top-[100px] bottom-[164px] flex items-center">
        <p
          className="font-display text-[86px] font-bold leading-[1.04] tracking-[-0.01em] text-ink text-balance"
          style={{ opacity: 1 - dim * 0.55 }}
        >
          {answer}
        </p>
      </div>
      <div className="absolute bottom-[46px] right-[58px]">{left ? <Score /> : <NoScore />}</div>
      {left && (
        <>
          <FlawlessStamp />
          <div className="absolute" style={{ left: CARD.width / 2, top: STAMP_BIG_Y }}>
            <Burst
              at={B.flawless + STAMP_IMPACT}
              count={24}
              speed={1200}
              gravity={1500}
              size={24}
              duration={0.9}
              seed={6}
              colors={["var(--teal)", "var(--gold)", "var(--punch)"]}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Where the FLAWLESS stamp lands across the winning card, card px. */
const STAMP_BIG_Y = CARD.height * 0.42;

/**
 * FLAWLESS slams big across the winning card, so it reads at thumbnail size,
 * holds while the bonus counts up, then settles small into the card's
 * top-right corner, clear of the author's name tag.
 */
function FlawlessStamp() {
  const t = useLocalTime();
  const settle = spring(t - B.settle, SPRINGS.smooth);
  return (
    <div
      className="absolute z-10"
      style={{
        left: CARD.width / 2,
        top: STAMP_BIG_Y,
        transform: `translate(${(CARD.width / 2 - 190) * settle}px, ${(-8 - STAMP_BIG_Y) * settle}px) translate(-50%, -50%) rotate(${2 * settle}deg) scale(${mix(1, 0.6, settle)})`,
      }}
    >
      <Stamp worn heavy text="Flawless" at={B.flawless} tone="teal" size={96} rotate={-7} />
    </div>
  );
}

/** The left card's points: +100 a vote, then FLAWLESS's bonus takes it to +600. */
function Score() {
  const t = useLocalTime();
  const arrived = lands.filter((land) => t >= land);
  if (arrived.length === 0) return null;
  const bonus = t >= B.bonus;
  const value = bonus ? mix(400, 600, progress(t, B.bonus, 0.4, ease.out)) : arrived.length * 100;
  const last = bonus ? B.bonus : arrived.at(-1)!;
  const pop = Math.exp(-(t - last) * (bonus ? 5 : 9));
  return (
    <p
      className="font-mono text-[108px] font-black leading-none tabular-nums text-gold-ink"
      style={{
        transform: `scale(${1 + pop * 0.28})`,
        transformOrigin: "100% 70%",
        textShadow: `0 0 ${Math.round(14 + pop * 30)}px color-mix(in srgb, var(--gold) ${Math.round(30 + pop * 40)}%, transparent)`,
      }}
    >
      +{Math.round(value)}
    </p>
  );
}

function NoScore() {
  const t = useLocalTime();
  const at = B.flawless + STAMP_IMPACT;
  if (t < at) return null;
  return (
    <p
      className="font-mono text-[108px] font-black leading-none tabular-nums text-ink-dim"
      style={{
        opacity: progress(t, at, 0.25),
        transform: `translateY(${(1 - progress(t, at, 0.3, ease.out)) * 24}px)`,
      }}
    >
      +0
    </p>
  );
}

function VsBadge() {
  const t = useLocalTime();
  if (t < B.vs) return null;
  const drop = spring(t - B.vs, SPRINGS.slam);
  return (
    <div className="absolute" style={{ left: 960, top: LEFT.y + 10 }}>
      <Burst at={B.vs + 0.06} count={16} speed={820} gravity={1000} size={20} duration={0.8} seed={8} />
      <div
        className="grid size-[176px] place-items-center rounded-full border-[6px] border-edge-strong bg-vs font-display text-[80px] font-black leading-none text-ink"
        style={{
          opacity: progress(t, B.vs, 0.05),
          transform: `translate(-50%, -50%) scale(${mix(3, 1, drop)}) rotate(${mix(-40, 0, drop)}deg)`,
          boxShadow: "0 20px 50px -20px rgba(0,0,0,0.6)",
        }}
      >
        VS
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The votes
// ---------------------------------------------------------------------------

/** A human's token in their own colour, solid so it reads at thumbnail size. */
function Chip({ member, size }: { member: CastMember; size: number }) {
  return (
    <div
      className="grid place-items-center rounded-full font-display font-black leading-none text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.52),
        background: colorOf(member),
        boxShadow: `inset 0 ${-Math.round(size * 0.07)}px 0 rgba(0,0,0,0.22), inset 0 ${Math.round(size * 0.05)}px 0 rgba(255,255,255,0.25)`,
      }}
    >
      {member.name[0]}
    </div>
  );
}

/** Each friend's token flies up from below the screen and lands in the left card's stack. */
function Votes() {
  const t = useLocalTime();
  if (t < B.votes[0]) return null;
  return (
    <>
      {VOTERS.map((member, index) => {
        const at = B.votes[index]!;
        if (t < at) return null;
        const slot = STACK(index);
        const go = flight(t, {
          at,
          duration: B.flight,
          from: { x: slot.x + 300 + index * 110, y: 1240 },
          to: slot,
          lift: 280,
          easing: ease.out,
        });
        const land = spring(t - at - B.flight, SPRINGS.slam);
        const landed = go.progress >= 1;
        return (
          <div
            key={member.name}
            className="absolute"
            style={{
              left: go.x,
              top: go.y,
              zIndex: 10 - index,
              transform: `translate(-50%, -50%) rotate(${landed ? 0 : (1 - go.progress) * -240}deg) scale(${landed ? mix(1.5, 1, land) : mix(1.6, 1.25, go.progress)})`,
            }}
          >
            <div
              className="rounded-full"
              style={{ boxShadow: "0 0 0 8px var(--surface), 0 16px 30px -10px rgba(0,0,0,0.5)" }}
            >
              <Chip member={member} size={CHIP} />
            </div>
          </div>
        );
      })}
      {lands.map((land, index) => (
        <div key={index} className="absolute" style={{ left: STACK(index).x, top: STACK(index).y }}>
          <Burst
            at={land}
            count={8}
            speed={560}
            gravity={900}
            size={16}
            duration={0.5}
            seed={20 + index}
            colors={["var(--gold)", "var(--punch)"]}
          />
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The authors
// ---------------------------------------------------------------------------

/** A "?" on the card's corner until `flip`, when it turns over to show who wrote it. */
function Author({ x, member, flip, seed }: { x: number; member: CastMember; flip: number; seed: number }) {
  const t = useLocalTime();
  if (t < B.mystery) return null;
  const ai = member.modelId !== null;
  const pop = spring(t - B.mystery - (ai ? 0.08 : 0), SPRINGS.pop);
  const turn = progress(t, flip, 0.3, ease.inOut);
  const face = turn >= 0.5;
  const land = face ? spring(t - flip - 0.15, SPRINGS.slam) : 0;
  // The mystery tokens twitch now and then; the AI, once shown, glitches and wilts.
  const frame = Math.floor(t * 20);
  const twitch = !face && hash01(frame * 2.7 + seed * 11) > 0.9 ? 0.5 : 0;
  const crash = progress(t, B.glitch, B.cut - B.glitch);
  const glitch =
    ai && face ? Math.max(glitchBursts(t, [flip + 0.15, flip + 0.8, flip + 1.25], 0.35), crash) : twitch;
  const wilt = ai && face ? progress(t, flip + 0.55, 0.6, ease.out) : 0;
  return (
    <div className="absolute z-20 isolate" style={{ left: x, top: TOP + 4 }}>
      <div
        style={{
          transform: `translate(-50%, -50%) translateY(${wilt * 16}px) rotate(${wilt * 14}deg) scale(${mix(0.2, 1, pop) * (face ? mix(1.35, 1, land) : 1)}) scaleX(${Math.abs(Math.cos(turn * Math.PI))})`,
        }}
      >
        <Glitch amount={glitch} seed={seed} split={16} tear={34}>
          {(tone) => (face ? <Face member={member} tone={tone} /> : <Mystery tone={tone} />)}
        </Glitch>
      </div>
      {face && <NameTag member={member} at={flip + 0.18} />}
      {face && !ai && (
        <div className="absolute" style={{ left: -78, top: -TOKEN / 2 - 118 }}>
          <Crown at={flip + 0.32} size={156} tilt={-14} />
        </div>
      )}
    </div>
  );
}

function Mystery({ tone }: { tone: string | null }) {
  return (
    <div
      className="grid place-items-center rounded-full font-display text-[104px] font-black leading-none"
      style={{
        width: TOKEN,
        height: TOKEN,
        color: tone ?? "var(--ink-dim)",
        background: tone ? "transparent" : "var(--raised)",
        boxShadow: tone ? `inset 0 0 0 8px ${tone}` : "0 0 0 8px var(--bg), inset 0 0 0 6px var(--edge-strong)",
      }}
    >
      ?
    </div>
  );
}

function Face({ member, tone }: { member: CastMember; tone: string | null }) {
  if (tone) {
    return <div className="rounded-full" style={{ width: TOKEN, height: TOKEN, boxShadow: `inset 0 0 0 10px ${tone}` }} />;
  }
  return (
    <div className="rounded-full" style={{ boxShadow: "0 0 0 8px var(--bg)" }}>
      {member.modelId ? (
        <Avatar name={member.name} modelId={member.modelId} size={`${TOKEN}px`} />
      ) : (
        <Chip member={member} size={TOKEN} />
      )}
    </div>
  );
}

/** The author's name sliding out of their token along the card's top edge. */
function NameTag({ member, at }: { member: CastMember; at: number }) {
  const t = useLocalTime();
  if (t < at) return null;
  const grow = spring(t - at, SPRINGS.pop);
  const ai = member.modelId !== null;
  return (
    <div
      className="absolute flex items-center gap-[18px] rounded-full border-[5px] bg-surface py-[10px] pl-[96px] pr-[30px]"
      style={{
        left: 0,
        top: 0,
        zIndex: -1,
        borderColor: ai ? "var(--ai-badge)" : "var(--gold)",
        transformOrigin: "0 50%",
        transform: `translate(0, -50%) scaleX(${mix(0.2, 1, clamp(grow, 0, 1.2))})`,
        opacity: progress(t, at, 0.08),
        boxShadow: "0 20px 40px -20px rgba(0,0,0,0.5)",
      }}
    >
      <span className={`font-display text-[80px] font-black leading-none ${ai ? "text-ai" : "text-gold-ink"}`}>
        {member.name}
      </span>
      {ai && (
        <span className="rounded-[16px] bg-ai px-[16px] py-[8px] font-display text-[60px] font-black leading-none tracking-[0.06em] text-accent-ink">
          AI
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supers
// ---------------------------------------------------------------------------

/** A line slammed in word by word along the bottom, like a stamp per word. */
function Super({
  text,
  accent,
  at,
  out,
}: {
  text: string;
  accent: readonly string[];
  at: number;
  out?: number;
}) {
  const t = useLocalTime();
  if (t < at || (out !== undefined && t > out + 0.5)) return null;
  const words = text.split(" ");
  return (
    <div
      className="absolute inset-x-0 flex justify-center"
      style={{ top: SUPER_Y, transform: "translateY(-50%)" }}
    >
      <p className="whitespace-nowrap font-display text-[108px] font-black leading-none tracking-[-0.01em] text-ink">
        {words.map((word, index) => {
          const start = at + index * 0.09;
          const slam = spring(t - start, SPRINGS.slam);
          const leave = out === undefined ? 0 : progress(t, out + index * 0.04, 0.24, ease.in);
          return (
            <span
              key={index}
              className={`inline-block ${accent.includes(word) ? "text-ai" : ""}`}
              style={{
                marginRight: index < words.length - 1 ? "0.24em" : undefined,
                opacity: progress(t, start, 0.05) * (1 - leave),
                transform: `translateY(${leave * 50}px) scale(${t < start ? 0 : mix(2, 1, slam)}) rotate(${mix(-8, 0, slam)}deg)`,
              }}
            >
              {word}
            </span>
          );
        })}
      </p>
    </div>
  );
}
