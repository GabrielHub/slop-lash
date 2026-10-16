"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/room/avatar";
import { useTime } from "@/tutorial/clock";
import { PHONE_SCREEN, Tap, TypeOn } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { COPY, letterOf } from "../ui/copy";
import { LATEST, MATCH, ROUND_TWO_REPLY, TEXTS, type Cast } from "./data";
import { C, blend, fin, fout, nope } from "./fx";
import { CheckBadge, Dots, Lock, MatchFace } from "./parts";

/**
 * Controller screens, drawn at the phone's own 390x844 and scaled by
 * `PhoneMock`. Type is big for a phone: the board shrinks it about 0.8x.
 */

/** Characters a second so `text` types out between `from` and `to`. */
export function cpsFor(text: string, from: number, to: number, min = 14, max = 60): number {
  return clamp(text.length / Math.max(0.1, to - from), min, max);
}

function Send({ pressAt, label = COPY.send }: { pressAt: number; label?: string }) {
  const t = useTime();
  const press = t >= pressAt && t < pressAt + 0.14 ? 0.94 : 1;
  return (
    <div className="relative mt-[18px]">
      <div
        className="grid h-[92px] place-items-center rounded-[28px] bg-punch font-display text-[38px] font-black text-accent-ink"
        style={{ transform: `scale(${press})` }}
      >
        {label}
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Tap at={pressAt} size={86} />
      </div>
    </div>
  );
}

/** The "Locked in" moment (`CompletionCard`), from `at`. */
function LockedIn({ text, at }: { text: string; at: number }) {
  const t = useTime();
  const pop = spring(t - at, SPRINGS.pop);
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center text-center"
      style={{ opacity: fin(t, at, 0.15), transform: `scale(${mix(0.8, 1, pop)})` }}
    >
      <div className="mb-[22px] grid size-[132px] place-items-center rounded-full border-[3px] border-win/40 bg-win-soft">
        <CheckBadge at={at + 0.08} size={96} />
      </div>
      <p className="font-display text-[50px] font-black text-win">{COPY.lockedIn}</p>
      <p className="mt-[12px] px-[10px] font-sans text-[34px] leading-[1.22] text-ink-dim">“{text}”</p>
    </div>
  );
}

function Header({ who }: { who: Cast }) {
  return (
    <div className="flex items-center gap-[14px]">
      <Avatar name={who.name} modelId={who.modelId} size="60px" />
      <p className="font-display text-[38px] font-black text-ink">{who.name}</p>
    </div>
  );
}

/** WRITE: one player's composer, typing `text`, then Send at `sendAt`. */
export function WriterScreen({
  who,
  text,
  typeAt,
  sendAt,
}: {
  who: Cast;
  text: string;
  typeAt: number;
  sendAt: number;
}) {
  const t = useTime();
  const done = sendAt + 0.22;
  const cps = cpsFor(text, typeAt, sendAt - 0.25);
  return (
    <div className="absolute inset-0 flex flex-col px-[24px] pb-[34px] pt-[74px]">
      <Header who={who} />
      {t < done ? (
        <>
          <div className="mt-auto min-h-[300px] rounded-[30px] border-[3px] border-punch bg-surface px-[24px] py-[20px] font-sans text-[38px] leading-[1.22] text-ink">
            {t < typeAt ? (
              <span className="text-ink-dim">{COPY.yourOpener}</span>
            ) : (
              <TypeOn text={text} at={typeAt} cps={cps} />
            )}
          </div>
          <Send pressAt={sendAt} />
        </>
      ) : (
        <LockedIn text={text} at={done} />
      )}
    </div>
  );
}

/** Heights of the three prompt cards on the opener screen, phone px. */
const OPENER_CARD_H = [170, 212, 170];
const OPENER_TOP = 168;
const OPENER_GAP = 16;

/**
 * OPENER, round 1: "Pick one to reply to" over the match's prompts; a tap at
 * `pickAt` picks the third, the others fold into chips, and the opener types
 * from `typeAt`, sent at `sendAt`.
 */
export function OpenerScreen({
  pickAt,
  typeAt,
  sendAt,
}: {
  pickAt: number;
  typeAt: number;
  sendAt: number;
}) {
  const t = useTime();
  const text = TEXTS[3].text;
  const picked = 2;
  const fold = spring(t - pickAt - 0.12, SPRINGS.smooth);
  const composer = spring(t - (pickAt + 0.3), SPRINGS.smooth);
  const cps = cpsFor(text, typeAt, sendAt - 0.2);
  const tops = OPENER_CARD_H.map(
    (_, index) =>
      OPENER_TOP + OPENER_CARD_H.slice(0, index).reduce((sum, height) => sum + height + OPENER_GAP, 0),
  );
  const pickedTop = mix(tops[picked], 262, fold);
  return (
    <div className="absolute inset-0 px-[22px] pt-[74px]">
      <p className="font-display text-[38px] font-black leading-tight text-ink">{COPY.pickOne}</p>
      {/* The other prompts fold into a row of chips. */}
      <div
        className="absolute left-[22px] right-[22px] top-[166px] flex gap-[10px]"
        style={{ opacity: fin(t, pickAt + 0.18, 0.25), transform: `translateY(${(1 - fold) * 20}px)` }}
      >
        {[0, 1].map((index) => (
          <span
            key={index}
            className="flex h-[66px] min-w-0 flex-1 items-center rounded-full border-[3px] border-edge bg-surface px-[20px] font-sans text-[28px] font-bold text-punch"
          >
            <span className="truncate">{MATCH.prompts[index].prompt}</span>
          </span>
        ))}
      </div>
      {MATCH.prompts.map((card, index) => {
        const chosen = index === picked;
        const top = chosen ? pickedTop : tops[index];
        const gone = chosen ? 0 : fold;
        return (
          <div
            key={card.prompt}
            className="absolute left-[22px] right-[22px] rounded-[26px] border-[3px] px-[22px] py-[16px]"
            style={{
              top,
              minHeight: OPENER_CARD_H[index],
              borderColor: chosen ? blend("var(--edge)", C.rose, fin(t, pickAt, 0.12)) : "var(--edge)",
              background: chosen
                ? blend("var(--surface)", `color-mix(in srgb, ${C.rose} 12%, var(--surface))`, fin(t, pickAt, 0.12))
                : "var(--surface)",
              opacity: 1 - gone,
              transform: `scale(${mix(1, 0.85, gone)})`,
            }}
          >
            <p className="font-sans text-[31px] font-bold leading-tight text-punch">{card.prompt}</p>
            <p className="mt-[6px] font-sans text-[33px] leading-[1.18] text-ink">{card.answer}</p>
          </div>
        );
      })}
      <div
        className="absolute left-[22px] top-[288px] text-[24px]"
        style={{ top: pickedTop + 26 }}
      >
        <Tap at={pickAt} size={90} />
      </div>
      {/* The composer. */}
      <div
        className="absolute inset-x-[22px] bottom-[34px]"
        style={{ opacity: clamp(composer * 2), transform: `translateY(${(1 - composer) * 60}px)` }}
      >
        <div className="min-h-[214px] rounded-[30px] border-[3px] border-punch bg-surface px-[24px] py-[18px] font-sans text-[36px] leading-[1.22] text-ink">
          {t < typeAt ? (
            <span className="text-ink-dim">{COPY.yourOpener}</span>
          ) : (
            <TypeOn text={text} at={typeAt} cps={cps} />
          )}
        </div>
        <Send pressAt={sendAt} />
      </div>
    </div>
  );
}

/** OPENER, round 2 on: their latest line arrives at `lineAt`; a reply types from `typeAt`. */
export function ReplyScreen({ lineAt, typeAt, typeEnd }: { lineAt: number; typeAt: number; typeEnd: number }) {
  const t = useTime();
  const line = spring(t - lineAt, SPRINGS.pop);
  const typing = t < lineAt;
  const cps = cpsFor(ROUND_TWO_REPLY, typeAt, typeEnd);
  return (
    <div className="absolute inset-0 flex flex-col px-[22px] pb-[34px] pt-[74px]">
      <div className="flex items-center gap-[14px]">
        <MatchFace size={64} />
        <p className="font-display text-[38px] font-black text-ink">{MATCH.name}</p>
      </div>
      <div className="mt-auto flex items-end gap-[12px]">
        <MatchFace size={52} />
        {typing ? (
          <div className="rounded-[30px] rounded-bl-[8px] border-[3px] border-edge bg-surface px-[26px] py-[24px]">
            <Dots size={14} />
          </div>
        ) : (
          <div
            className="origin-bottom-left rounded-[30px] rounded-bl-[8px] border-[3px] border-edge bg-surface px-[22px] py-[16px] font-sans text-[33px] leading-[1.2] text-ink"
            style={{ transform: `scale(${mix(0.6, 1, line)})`, opacity: clamp(line * 3) }}
          >
            {LATEST}
          </div>
        )}
      </div>
      <div className="mt-[22px] min-h-[160px] rounded-[30px] border-[3px] border-punch bg-surface px-[24px] py-[18px] font-sans text-[36px] leading-[1.22] text-ink">
        {t < typeAt ? (
          <span className="text-ink-dim">{COPY.yourReply}</span>
        ) : (
          <TypeOn text={ROUND_TWO_REPLY} at={typeAt} cps={cps} />
        )}
      </div>
      <Send pressAt={Infinity} />
    </div>
  );
}

/**
 * DOUBLE: Tess's ballot. Her own line (B) is locked as "Yours"; a tap on it
 * at `tryAt` is refused; a tap on D at `voteAt` votes.
 */
export function BallotScreen({ tryAt, voteAt }: { tryAt: number; voteAt: number }) {
  const t = useTime();
  const own = 1;
  const voted = 3;
  const wiggle = nope(t, tryAt + 0.05, 16, 0.55);
  const refused = fin(t, tryAt + 0.02, 0.12) * fout(t, tryAt + 0.9, 0.4);
  const picked = fin(t, voteAt, 0.15);
  return (
    <div className="absolute inset-0 flex flex-col px-[20px] pb-[30px] pt-[74px]">
      <p className="font-display text-[36px] font-black leading-tight text-ink">{COPY.whichOne}</p>
      <ul className="mt-auto flex flex-col gap-[14px]">
        {TEXTS.map((entry, index) => {
          const mine = index === own;
          const chosen = index === voted ? picked : 0;
          return (
            <li
              key={entry.text}
              className="relative flex items-start gap-[12px] rounded-[24px] border-[3px] px-[14px] py-[12px]"
              style={{
                borderColor: mine ? blend("var(--edge)", C.red, refused) : blend("var(--edge)", C.rose, chosen),
                background: blend("var(--surface)", `color-mix(in srgb, ${C.rose} 12%, var(--surface))`, chosen),
                transform: mine ? `translateX(${wiggle}px)` : `scale(${1 + chosen * 0.02})`,
              }}
            >
              <span className="grid size-[46px] shrink-0 place-items-center rounded-full border-2 border-edge bg-raised font-display text-[28px] font-black text-ink">
                {letterOf(index)}
              </span>
              <span
                className="min-w-0 flex-1 font-sans text-[30px] leading-[1.18] text-ink"
                style={{ opacity: mine ? 0.35 : 1 }}
              >
                {entry.text}
              </span>
              {mine && (
                <span
                  className="absolute left-1/2 top-1/2 flex items-center gap-[8px] whitespace-nowrap rounded-full border-[3px] bg-surface py-[4px] pl-[18px] pr-[12px] font-sans text-[32px] font-bold"
                  style={{
                    borderColor: blend("var(--edge-strong)", C.red, refused),
                    color: blend("var(--ink)", C.red, refused),
                    transform: `translate(-50%, -50%) rotate(-4deg) scale(${1 + refused * 0.2})`,
                    boxShadow: "0 10px 24px -12px rgba(0,0,0,0.6)",
                  }}
                >
                  {COPY.yours}
                  <Lock size={30} />
                </span>
              )}
              {index === voted && (
                <span className="absolute -right-[10px] -top-[14px]">
                  <CheckBadge at={voteAt + 0.1} size={52} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {/* Fingertips: the refused try, then the vote. */}
      <div className="pointer-events-none absolute left-[200px]" style={{ top: 415 }}>
        <Tap at={tryAt} size={90} />
      </div>
      <div className="pointer-events-none absolute left-[200px]" style={{ top: 735 }}>
        <Tap at={voteAt} size={90} />
      </div>
    </div>
  );
}

/** A phone screen that slides out left as the next slides in, at `at`. */
export function PageSwipe({
  at,
  first,
  second,
}: {
  at: number;
  first: ReactNode;
  second: ReactNode;
}) {
  const t = useTime();
  const p = progress(t, at, 0.5, ease.emphasized);
  const width = PHONE_SCREEN.width;
  return (
    <>
      {p < 1 && (
        <div className="absolute inset-0" style={{ transform: `translateX(${-p * width}px)` }}>
          {first}
        </div>
      )}
      {p > 0 && (
        <div className="absolute inset-0" style={{ transform: `translateX(${(1 - p) * width}px)` }}>
          {second}
        </div>
      )}
    </>
  );
}

