"use client";

import type { CSSProperties, ReactNode } from "react";
import { CheckIcon, CrownIcon } from "@/components/icons";
import { Avatar } from "@/room/avatar";
import { useLocalTime } from "@/tutorial/clock";
import { PHONE_SCREEN, PhoneMock, STAMP_IMPACT, type Tone } from "@/tutorial/kit";
import {
  SPRINGS,
  clamp,
  ease,
  hash01,
  interpolate,
  mix,
  progress,
  spring,
  wobble,
} from "@/tutorial/timeline";
import { colorOf, type CastMember } from "./content";

/**
 * The tutorial's props: players, phones and their screens, the TV's answer
 * cards and rubber stamps. Mocks of the real SlopLash screens, simplified and
 * set bigger so they read from the couch. Every value that moves is passed
 * in, so the shots own the choreography.
 */

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** A player token: avatar, name, and the AI badge for a model. */
export function Token({
  member,
  size = 128,
  name = true,
  you = false,
  className = "",
  style,
}: {
  member: CastMember;
  size?: number;
  name?: boolean;
  /** Marks the viewer's own token. */
  you?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`flex flex-col items-center gap-[14px] ${className}`} style={style}>
      <div className="relative">
        <Avatar name={member.name} modelId={member.modelId} size={`${size}px`} />
        {member.modelId && (
          <span
            className="absolute -bottom-[6px] -right-[14px] rounded-[12px] bg-ai-soft px-[12px] py-[3px] font-display font-black uppercase tracking-[0.1em] text-ai"
            style={{
              fontSize: Math.round(size * 0.22),
              boxShadow: "0 0 0 4px var(--bg)",
            }}
          >
            AI
          </span>
        )}
      </div>
      {name && (
        <span
          className={`font-display font-extrabold leading-none ${you ? "text-punch" : member.modelId ? "text-ai" : "text-ink"}`}
          style={{ fontSize: Math.max(30, Math.round(size * 0.28)) }}
        >
          {member.name}
        </span>
      )}
    </div>
  );
}

/** A name sticker slapped on a phone's corner: whose phone this is. */
export function Sticker({ member, rotate = -6 }: { member: CastMember; rotate?: number }) {
  return (
    <div
      className="flex items-center gap-[12px] rounded-full border-[3px] bg-surface py-[8px] pl-[8px] pr-[22px] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.5)]"
      style={{ borderColor: colorOf(member), transform: `rotate(${rotate}deg)` }}
    >
      <Avatar name={member.name} modelId={member.modelId} size="52px" />
      <span className="font-display text-[34px] font-black leading-none text-ink">
        {member.name === "You" ? "Your phone" : `${member.name}'s phone`}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stamps, crowns, touches
// ---------------------------------------------------------------------------

const TONE_TEXT: Record<Tone, string> = {
  punch: "text-punch",
  teal: "text-teal",
  gold: "text-gold",
  win: "text-win",
  fail: "text-fail",
  ink: "text-ink",
};

/** Worn rubber: the same noise mask as the game's own stamp. */
const WORN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.7 1.75'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E\")";

/**
 * The game's rubber stamp, slammed at `at`: it winds in big and over-tilted,
 * lands on its tilt about STAMP_IMPACT later and throws one ink ring.
 */
export function RubberStamp({
  children,
  at,
  tone = "punch",
  tilt = -3,
  size = 72,
  out,
  className = "",
}: {
  children: ReactNode;
  at: number;
  tone?: Tone;
  tilt?: number;
  /** Font size in px. */
  size?: number;
  out?: number;
  className?: string;
}) {
  const t = useLocalTime();
  if (t < at) return null;
  const drop = spring(t - at, SPRINGS.slam);
  const leave = out === undefined ? 0 : progress(t, out, 0.22, ease.in);
  if (leave >= 1) return null;
  const ring = progress(t, at + STAMP_IMPACT, 0.45, ease.out);
  return (
    <span
      className={`relative inline-flex items-center justify-center whitespace-nowrap font-display font-black uppercase leading-[0.95] tracking-[0.12em] ${TONE_TEXT[tone]} ${className}`}
      style={{
        fontSize: size,
        opacity: progress(t, at, 0.06) * (1 - leave),
        transform: `rotate(${mix(tilt - 9, tilt, drop)}deg) scale(${mix(2.4, 1, drop) * (1 - leave * 0.1)})`,
      }}
    >
      <span
        className="block text-center"
        style={{
          padding: "0.42em 0.8em 0.36em",
          border: "0.14em solid currentColor",
          borderRadius: "0.2em",
          outline: "0.045em solid currentColor",
          outlineOffset: "-0.3em",
          background: "color-mix(in srgb, currentColor 12%, var(--surface))",
          maskImage: WORN,
          WebkitMaskImage: WORN,
          maskSize: "180px 180px",
          WebkitMaskSize: "180px 180px",
        }}
      >
        {children}
      </span>
      {ring > 0 && ring < 1 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            border: "0.14em solid currentColor",
            borderRadius: "0.2em",
            opacity: (1 - ring) * 0.6,
            transform: `scale(${1 + ring * 0.35})`,
          }}
        />
      )}
    </span>
  );
}

/** A gold crown dropping on its slam spring at `at`. */
export function Crown({ at, size = 96, tilt = -12 }: { at: number; size?: number; tilt?: number }) {
  const t = useLocalTime();
  if (t < at) return null;
  const drop = spring(t - at, SPRINGS.slam);
  return (
    <div
      style={{
        width: size,
        height: size,
        opacity: progress(t, at, 0.08),
        transform: `translateY(${mix(-140, 0, drop)}px) rotate(${tilt}deg) scale(${mix(1.3, 1, drop)})`,
        filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.3))",
      }}
    >
      <CrownIcon className="h-full w-full text-gold" />
    </div>
  );
}

/**
 * A fingertip: a soft dot gliding between `path` points (board px) and
 * pressing at each `taps` time with a ripple.
 */
export function Touch({
  path,
  taps,
  size = 70,
  from,
  to,
}: {
  path: readonly { at: number; x: number; y: number }[];
  taps: readonly number[];
  size?: number;
  /** Local seconds it fades in and out. */
  from: number;
  to: number;
}) {
  const t = useLocalTime();
  if (t < from || t > to + 0.3) return null;
  const times = path.map((point) => point.at);
  const x = path.length === 1 ? path[0]!.x : interpolate(t, times, path.map((p) => p.x), ease.inOut);
  const y = path.length === 1 ? path[0]!.y : interpolate(t, times, path.map((p) => p.y), ease.inOut);
  const shown = progress(t, from, 0.2, ease.out) * (1 - progress(t, to, 0.3, ease.in));
  let press = 0;
  let ripple = 0;
  for (const tap of taps) {
    const local = t - tap;
    if (local >= -0.08 && local < 0.16) press = Math.max(press, 1 - Math.abs(local - 0.04) / 0.12);
    if (local >= 0 && local < 0.6) ripple = Math.max(ripple, 1 - local / 0.6);
  }
  const rippleScale = 1 + (1 - ripple) * 1.4;
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: shown }}
    >
      {ripple > 0 && (
        <div
          className="absolute inset-0 rounded-full border-[5px] border-ink"
          style={{ transform: `scale(${rippleScale})`, opacity: ripple * 0.7 }}
        />
      )}
      <div
        className="absolute inset-0 rounded-full border-[4px] border-ink"
        style={{
          background: "color-mix(in srgb, var(--ink) 30%, transparent)",
          transform: `scale(${1 - clamp(press) * 0.22})`,
          boxShadow: "0 10px 24px -6px rgba(0,0,0,0.45)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

export const PHONE_WIDTH = 380;
/** Board px per phone-screen px for a `PHONE_WIDTH` phone. */
export const PHONE_SCALE = PHONE_WIDTH / (PHONE_SCREEN.width + 28);

/** Where a point on the phone screen (screen px) sits on the board, for a phone centred at (cx, cy). */
export function onPhone(cx: number, cy: number, sx: number, sy: number, width = PHONE_WIDTH) {
  const scale = width / (PHONE_SCREEN.width + 28);
  const height = (PHONE_SCREEN.height + 28) * scale;
  return {
    x: cx - width / 2 + (14 + sx) * scale,
    y: cy - height / 2 + (14 + sy) * scale,
  };
}

/** A phone centred on (x, y) with a pose, holding a screen. */
export function Phone({
  x,
  y,
  width = PHONE_WIDTH,
  dx = 0,
  dy = 0,
  rotate = 0,
  scale = 1,
  opacity = 1,
  children,
  sticker,
}: {
  x: number;
  y: number;
  width?: number;
  dx?: number;
  dy?: number;
  rotate?: number;
  scale?: number;
  opacity?: number;
  children?: ReactNode;
  sticker?: ReactNode;
}) {
  if (opacity <= 0.001) return null;
  const height = (PHONE_SCREEN.height + 28) * (width / (PHONE_SCREEN.width + 28));
  return (
    <div
      className="absolute"
      style={{
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
        opacity,
        transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(${scale})`,
      }}
    >
      <div
        className="pointer-events-none absolute -inset-[60px] rounded-[120px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--teal) 22%, transparent), transparent)",
        }}
      />
      <PhoneMock width={width}>{children}</PhoneMock>
      {sticker && <div className="absolute -top-[44px] left-[46%] z-10">{sticker}</div>}
    </div>
  );
}

/** The writer's prompt dots: one per prompt, teal once sent. */
function Dots({ sent }: { sent: readonly number[] }) {
  return (
    <div className="flex items-center gap-[12px]">
      {sent.map((amount, index) => (
        <span
          key={index}
          className="size-[18px] rounded-full"
          style={{
            background: `color-mix(in srgb, var(--teal) ${Math.round(amount * 100)}%, var(--edge-strong))`,
            transform: `scale(${1 + Math.sin(clamp(amount) * Math.PI) * 0.5})`,
          }}
        />
      ))}
    </div>
  );
}

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

/** The phone keyboard, with the key just typed lit. */
function Keyboard({ active, shown }: { active: string | null; shown: number }) {
  const lit = active?.toLowerCase() ?? null;
  if (shown <= 0) return null;
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex h-[250px] flex-col gap-[10px] bg-raised px-[6px] pb-[34px] pt-[12px]"
      style={{ transform: `translateY(${(1 - shown) * 260}px)` }}
    >
      {KEY_ROWS.map((row, rowIndex) => (
        <div key={row} className="flex justify-center gap-[6px]">
          {rowIndex === 2 && <span className="h-[44px] w-[50px] rounded-[8px] bg-edge" />}
          {row.split("").map((key) => (
            <span
              key={key}
              className={`grid h-[44px] w-[32px] place-items-center rounded-[8px] font-sans text-[22px] ${lit === key ? "bg-teal text-accent-ink" : "bg-surface text-ink"}`}
              style={{ transform: lit === key ? "translateY(-6px) scale(1.25)" : undefined }}
            >
              {key}
            </span>
          ))}
          {rowIndex === 2 && <span className="h-[44px] w-[50px] rounded-[8px] bg-edge" />}
        </div>
      ))}
      <div className="flex justify-center gap-[6px]">
        <span className="h-[44px] w-[86px] rounded-[8px] bg-edge" />
        <span
          className={`h-[44px] w-[200px] rounded-[8px] ${lit === " " ? "bg-teal" : "bg-surface"}`}
        />
        <span className="h-[44px] w-[86px] rounded-[8px] bg-edge" />
      </div>
    </div>
  );
}

/** Layout of the writer screen, in phone-screen px. */
export const WRITER = {
  prompt: 92,
  box: { top: 248, height: 196 },
  counter: 452,
  send: { top: 492, height: 84 },
  pad: 24,
} as const;

/** The writer: dots, the prompt in gold, the answer box, the counter and Send. */
export function WriterScreen({
  sent,
  prompt,
  promptX = 0,
  promptOpacity = 1,
  boxOpacity = promptOpacity,
  pending = 0,
  text,
  caret,
  focus = true,
  counter,
  counterHot = false,
  boxFlash = 0,
  ready,
  press = 0,
  activeKey = null,
  keyboard = 1,
  promptGlow = 0,
}: {
  sent: readonly number[];
  prompt: string;
  promptX?: number;
  promptOpacity?: number;
  boxOpacity?: number;
  /** 0..1: skeleton bars where a prompt is about to arrive. */
  pending?: number;
  text: string;
  caret: boolean;
  focus?: boolean;
  counter: number | null;
  counterHot?: boolean;
  /** A red blink of the box when the cap is hit. */
  boxFlash?: number;
  ready: boolean;
  press?: number;
  activeKey?: string | null;
  /** 0..1: the keyboard sliding up. */
  keyboard?: number;
  promptGlow?: number;
}) {
  const { pad } = WRITER;
  return (
    <div className="absolute inset-0">
      <div className="absolute" style={{ left: pad, top: 62 }}>
        <Dots sent={sent} />
      </div>
      <p
        className="absolute font-display text-[38px] font-bold leading-[1.12] text-gold-ink"
        style={{
          left: pad,
          right: pad,
          top: WRITER.prompt,
          opacity: promptOpacity,
          transform: `translateX(${promptX}px)`,
          textShadow:
            promptGlow > 0
              ? `0 0 ${Math.round(promptGlow * 22)}px color-mix(in srgb, var(--gold) ${Math.round(promptGlow * 80)}%, transparent)`
              : undefined,
        }}
      >
        {prompt}
      </p>
      {pending > 0 && (
        <div
          className="absolute flex flex-col gap-[14px]"
          style={{ left: pad, right: pad, top: WRITER.prompt + 4, opacity: pending }}
        >
          {[0.92, 0.6].map((width, index) => (
            <span
              key={index}
              className="block h-[34px] rounded-full bg-raised"
              style={{ width: `${width * 100}%` }}
            />
          ))}
        </div>
      )}
      <div
        className="absolute rounded-[22px] border-[3px] bg-surface px-[18px] py-[14px] font-sans text-[32px] leading-[1.22] text-ink"
        style={{
          left: pad,
          right: pad,
          top: WRITER.box.top,
          height: WRITER.box.height,
          borderColor:
            boxFlash > 0
              ? `color-mix(in srgb, var(--fail) ${Math.round(boxFlash * 100)}%, var(--teal))`
              : focus
                ? "var(--teal)"
                : "var(--edge)",
          opacity: boxOpacity,
          transform: `translateX(${promptX}px)`,
          overflow: "hidden",
        }}
      >
        {text.length === 0 && !caret ? (
          <span className="text-ink-dim">Type something funny</span>
        ) : (
          <span className="break-words">
            {text}
            {caret && (
              <span className="ml-[2px] inline-block h-[34px] w-[3px] translate-y-[6px] bg-teal" />
            )}
          </span>
        )}
      </div>
      {counter !== null && (
        <p
          className={`absolute font-mono text-[28px] font-bold tabular-nums ${counterHot ? "text-fail" : "text-ink-dim"}`}
          style={{ right: pad, top: WRITER.counter }}
        >
          {counter}/80
        </p>
      )}
      <div
        className={`absolute grid place-items-center rounded-[22px] font-sans text-[34px] font-bold ${ready ? "bg-punch text-accent-ink" : "bg-raised text-ink-dim"}`}
        style={{
          left: pad,
          right: pad,
          top: WRITER.send.top,
          height: WRITER.send.height,
          transform: `scale(${1 - press * 0.06})`,
        }}
      >
        Send
      </div>
      <Keyboard active={activeKey} shown={keyboard} />
    </div>
  );
}

/** Layout of the ballot, in phone-screen px. */
export const BALLOT = { first: 420, gap: 22, height: 168, pad: 24 } as const;

/** "Which is funnier?" with the two answers as big buttons. */
export function BallotScreen({
  prompt,
  answers,
  picked,
  pick = 0,
  voted = 0,
}: {
  prompt: string;
  answers: readonly [string, string];
  /** Which answer was tapped, if any. */
  picked: 0 | 1 | null;
  /** 0..1: the tapped answer lights and the other folds away. */
  pick?: number;
  /** 0..1: the header turns into "Voted". */
  voted?: number;
}) {
  const { pad } = BALLOT;
  return (
    <div className="absolute inset-0">
      <div className="absolute" style={{ left: pad, right: pad, top: 76 }}>
        <p
          className="font-display text-[44px] font-bold leading-[1.05] text-ink"
          style={{ opacity: 1 - voted }}
        >
          Which is funnier?
        </p>
        <p
          className="absolute left-0 top-0 flex items-center gap-[10px] font-display text-[44px] font-bold leading-[1.05] text-ink"
          style={{ opacity: voted }}
        >
          <CheckIcon size={48} className="text-teal" />
          Voted
        </p>
        <p
          className="mt-[18px] font-sans text-[28px] leading-[1.25] text-ink-dim"
          style={{ opacity: 1 - voted }}
        >
          {prompt}
        </p>
      </div>
      {answers.map((answer, index) => {
        const chosen = picked === index;
        const other = picked !== null && !chosen;
        const top = BALLOT.first + index * (BALLOT.height + BALLOT.gap);
        const lift = chosen && picked === 1 ? -(BALLOT.height + BALLOT.gap) * voted : 0;
        return (
          <div
            key={answer}
            className="absolute flex items-center rounded-[22px] border-[3px] bg-surface px-[22px] font-sans text-[32px] leading-[1.2] text-ink"
            style={{
              left: pad,
              right: pad,
              top: top + lift,
              height: BALLOT.height,
              borderColor: chosen
                ? `color-mix(in srgb, var(--teal) ${Math.round(pick * 100)}%, var(--edge))`
                : "var(--edge)",
              opacity: other ? 1 - pick : 1,
              transform: other ? `scale(${1 - pick * 0.1})` : undefined,
            }}
          >
            <span className="min-w-0 flex-1">{answer}</span>
            {chosen && pick > 0 && (
              <span
                className="ml-[10px] shrink-0 text-teal"
                style={{ transform: `scale(${spring(pick * 0.5, SPRINGS.pop)})` }}
              >
                <CheckIcon size={44} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** An author's phone during the vote: "You're up!", their answer, and nothing to tap. */
export function AuthorScreen({ answer, lock = 0, shake = 0 }: { answer: string; lock?: number; shake?: number }) {
  return (
    <div className="absolute inset-0 px-[24px]">
      <p className="absolute left-[24px] top-[80px] font-display text-[52px] font-black leading-none text-teal">
        You&apos;re up!
      </p>
      <div
        className="absolute left-[24px] right-[24px] top-[164px] rounded-[22px] border-[3px] bg-surface p-[22px] font-sans text-[32px] leading-[1.22] text-ink"
        style={{
          borderColor: `color-mix(in srgb, var(--fail) ${Math.round(lock * 100)}%, color-mix(in srgb, var(--teal) 40%, transparent))`,
          transform: `translateX(${shake}px)`,
        }}
      >
        {answer}
        {lock > 0 && (
          <div
            className="absolute inset-0 grid place-items-center rounded-[19px]"
            style={{ background: `color-mix(in srgb, var(--surface) ${Math.round(lock * 72)}%, transparent)` }}
          >
            <LockGlyph
              className="text-fail"
              style={{
                width: 120,
                height: 120,
                opacity: clamp(lock * 2),
                transform: `scale(${mix(1.8, 1, spring(lock * 0.6, SPRINGS.slam))})`,
              }}
            />
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-[110px] flex flex-col items-center gap-[10px]">
        <span className="flex items-center gap-[14px] font-display text-[34px] font-bold text-ink">
          <span className="size-[16px] rounded-full bg-teal" />
          Eyes on the TV
        </span>
      </div>
    </div>
  );
}

export const REACTIONS = ["😂", "💀", "🔥", "💯", "👏"] as const;

/** After voting: "Voted", the pick, and the reaction strip. */
export function VotedScreen({ answer, lit }: { answer: string; lit: readonly number[] }) {
  return (
    <div className="absolute inset-0">
      <p className="absolute left-[24px] top-[80px] flex items-center gap-[10px] font-display text-[44px] font-bold leading-none text-ink">
        <CheckIcon size={48} className="text-teal" />
        Voted
      </p>
      <div className="absolute left-[24px] right-[24px] top-[160px] rounded-[22px] border-[3px] border-teal bg-surface p-[22px] font-sans text-[32px] leading-[1.22] text-ink">
        {answer}
      </div>
      <div className="absolute inset-x-[18px] bottom-[60px] flex justify-between">
        {REACTIONS.map((emoji, index) => {
          const on = lit[index] ?? 0;
          return (
            <span
              key={emoji}
              className="grid size-[64px] place-items-center rounded-full border-[3px] text-[34px]"
              style={{
                borderColor: on > 0 ? "var(--teal)" : "var(--edge)",
                background: on > 0 ? "var(--teal-soft)" : "var(--surface)",
                boxShadow: on > 0 ? "0 0 0 4px color-mix(in srgb, var(--teal) 45%, transparent)" : undefined,
                transform: `scale(${1 + Math.sin(clamp(on) * Math.PI) * 0.35})`,
              }}
            >
              {emoji}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function LockGlyph({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="currentColor" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.7" fill="var(--surface)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The TV
// ---------------------------------------------------------------------------

/** One floating reaction, rising from (x, y) from `at` with a wobble. */
export function Float({
  emoji,
  x,
  y,
  at,
  seed,
  rise = 300,
  duration = 1.6,
  size = 64,
}: {
  emoji: string;
  x: number;
  y: number;
  at: number;
  seed: number;
  rise?: number;
  duration?: number;
  size?: number;
}) {
  const t = useLocalTime();
  const local = t - at;
  if (local < 0 || local > duration) return null;
  const p = local / duration;
  const pop = spring(local, SPRINGS.pop);
  const sway = wobble(local * 2.2, seed) * 26;
  const drift = (hash01(seed) - 0.5) * 120 * p;
  const opacity = clamp(local / 0.1) * (1 - progress(local, duration * 0.6, duration * 0.4));
  return (
    <span
      className="pointer-events-none absolute leading-none"
      style={{
        left: x,
        top: y,
        fontSize: size,
        opacity,
        transform: `translate(-50%, -50%) translate(${sway + drift}px, ${-rise * ease.out(p)}px) scale(${mix(0.4, 1, pop)}) rotate(${wobble(local * 3, seed + 2) * 14}deg)`,
      }}
    >
      {emoji}
    </span>
  );
}
