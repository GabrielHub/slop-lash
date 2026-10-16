"use client";

import type { ReactNode } from "react";
import { clamp, mix } from "@/tutorial/timeline";
import { DEMO, LETTERS, MINUS, TOPIC, type PlayerName } from "./content";
import { TV_SCREEN, Token } from "./parts";

/**
 * The real QuizSlop screens, simplified and drawn big: phones at
 * `PHONE_SCREEN` size (390 x 844) and the TV at `TV_SCREEN` size. Each takes
 * its state as plain numbers so a shot can drive it from time.
 */

function Check({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function CheckMark({ size }: { size: number }) {
  return <Check size={size} />;
}

/** The phone's top row: whose phone this is. */
export function PhoneOwner({ name }: { name: PlayerName }) {
  return (
    <div className="absolute left-[22px] top-[58px] flex items-center gap-[10px]">
      <Token name={name} size={40} />
      <span className="font-display text-[26px] font-bold text-ink-dim">{name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

export const BET_TARGETS: readonly PlayerName[] = ["Sam", "Jo", "Max"];

/** Where player button `index` sits on the bet screen, in screen px. */
export function betButton(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return { u: 18 + column * 184, v: 352 + row * 128, width: 170, height: 114 };
}

/**
 * Ana's phone during bets: the player list, then (as `placed` rises) the
 * "You bet Sam misses" confirmation. `focus` is which button the finger hovers.
 */
export function BetScreen({ placed, pressed }: { placed: number; pressed: number }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0" style={{ opacity: 1 - placed }}>
        <p className="absolute left-[22px] top-[64px] text-[24px] font-semibold text-ink-dim">
          {TOPIC}
        </p>
        <h2 className="absolute inset-x-[22px] top-[104px] font-display text-[38px] font-bold leading-[1.1] text-ink">
          Pick who gets it wrong
        </h2>
        <p className="absolute inset-x-[22px] top-[208px] text-[24px] font-bold leading-[1.35]">
          <span className="block text-win">Sam misses → you +150</span>
          <span className="block text-fail">Sam&apos;s right → you {MINUS}150</span>
        </p>
        <p className="absolute left-[22px] top-[294px] text-[22px] text-ink-dim">2 bets left</p>
        {BET_TARGETS.map((name, index) => {
          const spot = betButton(index);
          const on = index === 0 ? pressed : 0;
          return (
            <div
              key={name}
              className="absolute flex items-center gap-[14px] rounded-[22px] border-[3px] p-[14px]"
              style={{
                left: spot.u,
                top: spot.v,
                width: spot.width,
                height: spot.height,
                borderColor: `color-mix(in srgb, var(--punch) ${Math.round(on * 100)}%, var(--edge))`,
                background: `color-mix(in srgb, var(--punch) ${Math.round(on * 10)}%, var(--surface))`,
                boxShadow: on > 0.01 ? `0 0 0 ${on * 4}px color-mix(in srgb, var(--punch) 45%, transparent)` : undefined,
              }}
            >
              <Token name={name} size={56} />
              <span className="text-[30px] font-bold text-ink">{name}</span>
            </div>
          );
        })}
        <p className="absolute inset-x-0 top-[748px] text-center text-[22px] font-bold text-ink-dim">
          Skip, no bet
        </p>
      </div>
      <div
        className="absolute inset-x-0 top-[150px] flex flex-col items-center gap-[14px] text-center"
        style={{ opacity: placed, transform: `translateY(${(1 - placed) * 24}px)` }}
      >
        <Token name="Sam" size={150} />
        <p className="font-display text-[36px] font-bold leading-tight text-ink">
          You bet Sam misses
        </p>
        <p className="text-[24px] font-bold text-win">Sam misses → you +150</p>
        <p className="text-[22px] text-ink-dim">1 bet left</p>
        <p className="mt-[20px] text-[22px] text-ink-dim">Eyes on the TV</p>
      </div>
      <p
        className="absolute inset-x-0 top-[748px] text-center text-[22px] font-bold text-ink-dim"
        style={{ opacity: placed }}
      >
        Undo bet
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer
// ---------------------------------------------------------------------------

/** Where choice `index` sits on the answer screen, in screen px. */
export function choiceButton(index: number) {
  return { u: 18, v: 372 + index * 112, width: 354, height: 100 };
}

/**
 * A phone's question: the prompt and four lettered choices. `locked` (0 to 1)
 * turns the picked choice teal with a check and fades the rest; `alert` shows
 * the "{Name} bets you'll miss" card on top.
 */
export function AnswerScreen({
  owner,
  question = DEMO,
  locked = 0,
  pick = question.correct,
  lit = [1, 1, 1, 1],
  pulse = [0, 0, 0, 0],
  alert,
  alertShown = 0,
}: {
  owner: PlayerName;
  question?: { topic: string; prompt: string; choices: readonly string[]; correct: number };
  locked?: number;
  pick?: number;
  /** Per choice, 0 to 1: how far each button has come in. */
  lit?: readonly number[];
  /** Per choice, 0 to 1: a quick highlight as the host counts them. */
  pulse?: readonly number[];
  alert?: PlayerName;
  alertShown?: number;
}) {
  return (
    <div className="absolute inset-0">
      <PhoneOwner name={owner} />
      <p
        className="absolute right-[22px] top-[64px] text-[24px] font-semibold text-ink-dim"
        style={{ opacity: 1 - locked }}
      >
        {question.topic}
      </p>
      <p
        className="absolute right-[22px] top-[56px] font-display text-[34px] font-bold text-teal"
        style={{ opacity: locked }}
      >
        Locked in
      </p>
      <h2 className="absolute inset-x-[22px] top-[132px] font-display text-[34px] font-bold leading-[1.15] text-ink">
        {question.prompt}
      </h2>
      {question.choices.map((choice, index) => {
        const spot = choiceButton(index);
        const picked = index === pick ? locked : 0;
        const faded = index === pick ? 0 : locked;
        const shown = lit[index] ?? 1;
        const glow = pulse[index] ?? 0;
        return (
          <div
            key={choice}
            className="absolute flex items-center gap-[16px] rounded-[22px] border-[3px] px-[14px]"
            style={{
              left: spot.u,
              top: spot.v,
              width: spot.width,
              height: spot.height,
              borderColor: `color-mix(in srgb, var(--teal) ${Math.round(Math.max(picked, glow * 0.8) * 100)}%, var(--edge))`,
              background: `color-mix(in srgb, var(--teal) ${Math.round(Math.max(picked, glow * 0.6) * 14)}%, var(--surface))`,
              opacity: mix(1, 0.35, faded) * clamp(shown * 2),
              transform: `translateY(${(1 - shown) * 30}px) scale(${1 + glow * 0.05})`,
            }}
          >
            <span
              className="grid size-[64px] shrink-0 place-items-center rounded-[16px] font-display text-[32px] font-black"
              style={{
                background: `color-mix(in srgb, var(--teal) ${Math.round(picked * 100)}%, var(--raised))`,
                color: picked > 0.5 ? "var(--accent-ink)" : "var(--ink)",
              }}
            >
              {picked > 0.5 ? <Check size={34} /> : LETTERS[index]}
            </span>
            <span className="text-[30px] font-semibold text-ink">{choice}</span>
          </div>
        );
      })}
      {alert && alertShown > 0.01 && (
        <div
          className="absolute inset-x-[16px] top-[52px] flex flex-col gap-[12px] rounded-[28px] border-[3px] border-punch bg-canvas p-[22px]"
          style={{
            opacity: clamp(alertShown * 1.6),
            transform: `scale(${mix(0.9, 1, alertShown)})`,
            boxShadow:
              "inset 0 0 0 999px color-mix(in srgb, var(--punch) 10%, transparent), 0 30px 50px -20px rgba(0,0,0,0.5)",
          }}
        >
          <Token name={alert} size={56} />
          <span className="font-display text-[40px] font-bold leading-[1.1] text-ink">
            {alert} bets you&apos;ll miss
          </span>
          <span className="text-[24px] text-ink">
            Get it right and {alert} loses 150.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The TV during bets
// ---------------------------------------------------------------------------

/** A pill like the stage's: "They miss → you +150". */
export function Pill({
  tone,
  children,
  size = 40,
}: {
  tone: "win" | "fail" | "gold";
  children: ReactNode;
  size?: number;
}) {
  const classes =
    tone === "win" ? "bg-win-soft text-win" : tone === "fail" ? "bg-fail-soft text-fail" : "bg-gold-soft text-gold";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-[0.6em] py-[0.18em] font-bold ${classes}`}
      style={{ fontSize: size }}
    >
      {children}
    </span>
  );
}

/**
 * The TV's round opener during bets: "Ana's topic", the title, "Pick who gets
 * it wrong", the two stakes and who has decided. Each part takes 0 to 1.
 */
export function BetTv({
  kicker,
  title,
  body,
  pills,
  tracker,
  decided,
}: {
  kicker: number;
  title: number;
  body: number;
  pills: number;
  tracker: number;
  /** 0 to 1: Ana's tracker token turns done. */
  decided: number;
}) {
  const rise = (amount: number, distance = 30) => ({
    opacity: clamp(amount * 1.5),
    transform: `translateY(${(1 - amount) * distance}px)`,
  });
  const players: PlayerName[] = ["Ana", "Sam", "Jo", "Max"];
  return (
    <div className="absolute inset-0 flex flex-col items-center" style={{ width: TV_SCREEN.width, height: TV_SCREEN.height }}>
      <p
        className="mt-[86px] flex items-center gap-[16px] font-display text-[48px] font-bold text-punch"
        style={rise(kicker)}
      >
        <Token name="Ana" size={64} />
        Ana&apos;s topic
      </p>
      <h2
        className="mt-[10px] font-display text-[150px] font-black leading-none text-gold qs-marquee-text"
        style={{ opacity: clamp(title * 1.4), transform: `translateY(${(1 - title) * 80}px) scale(${mix(0.9, 1, title)})` }}
      >
        {TOPIC}
      </h2>
      <p className="mt-[34px] font-display text-[64px] text-ink" style={rise(body)}>
        Pick who gets it wrong
      </p>
      <div className="mt-[18px] flex gap-[28px]" style={rise(pills, 20)}>
        <Pill tone="win" size={46}>They miss → you +150</Pill>
        <Pill tone="fail" size={46}>They&apos;re right → you {MINUS}150</Pill>
      </div>
      <div className="mt-[34px] flex items-center gap-[22px]" style={rise(tracker, 16)}>
        {players.map((name) => {
          const done = name === "Ana" ? decided : 0;
          return (
            <span key={name} className="relative" style={{ opacity: mix(0.45, 1, done) }}>
              <Token name={name} size={64} />
              <span
                className="absolute -bottom-[6px] -right-[6px] grid size-[30px] place-items-center rounded-full bg-win text-accent-ink"
                style={{ transform: `scale(${done})` }}
              >
                <Check size={20} />
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
