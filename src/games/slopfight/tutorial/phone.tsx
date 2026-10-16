"use client";

import type { ReactNode } from "react";
import { PHONE_SCREEN } from "@/tutorial/kit";
import { clamp, ease, mix, progress } from "@/tutorial/timeline";
import { Doodle, type Ink } from "./doodles";
import { CREAM, INK, TOY } from "./look";
import { CAST, ToyArt, type ToyKind } from "./toys";

// The phone's SlopFight screens, simplified and set big enough to read from
// the couch. All drawn at PHONE_SCREEN size (390 x 844) inside a PhoneMock.

const W = PHONE_SCREEN.width;

export function Kicker({ children, tone = "text-punch" }: { children: ReactNode; tone?: string }) {
  return (
    <p className={`font-display text-[19px] font-extrabold uppercase tracking-[0.2em] ${tone}`}>{children}</p>
  );
}

/** The screen's column under the island. */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`absolute inset-0 flex flex-col gap-[18px] px-[22px] pb-[30px] pt-[70px] ${className}`}>
      {children}
    </div>
  );
}

/** The thumb button, pressed while `pressed` is true. */
export function BigButton({
  children,
  pressed = 0,
  tone = "bg-punch text-accent-ink",
  className = "",
}: {
  children: ReactNode;
  /** 0..1 press depth. */
  pressed?: number;
  tone?: string;
  className?: string;
}) {
  return (
    <div
      className={`grid h-[78px] w-full place-items-center rounded-[22px] font-display text-[28px] font-bold ${tone} ${className}`}
      style={{
        transform: `translateY(${pressed * 5}px) scale(${1 - pressed * 0.04})`,
        boxShadow: `0 ${8 - pressed * 6}px 0 0 color-mix(in srgb, var(--punch) 55%, #2a1a1f)`,
      }}
    >
      {children}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[52px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1-5L16 4l4 4L9 19z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[52px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

function Choice({
  tone,
  icon,
  title,
  hint,
  pressed = 0,
}: {
  tone: "punch" | "teal";
  icon: ReactNode;
  title: string;
  hint: string;
  pressed?: number;
}) {
  return (
    <div
      className={`flex min-h-[150px] w-full items-center gap-[16px] rounded-[28px] border-[3px] px-[20px] ${
        tone === "punch" ? "border-punch/60 bg-punch/12 text-punch" : "border-teal/60 bg-teal-soft text-teal"
      }`}
      style={{ transform: `scale(${1 - pressed * 0.05})` }}
    >
      {icon}
      <span className="flex flex-col">
        <span className="font-display text-[38px] font-bold leading-tight text-ink">{title}</span>
        <span className="text-[19px] leading-snug text-ink-dim">{hint}</span>
      </span>
    </div>
  );
}

/** Build: "How do you want to make it?" */
export function ChoiceScreen({ pressDraw = 0 }: { pressDraw?: number }) {
  return (
    <Screen>
      <div className="flex flex-col items-center gap-[6px] pt-[16px] text-center">
        <Kicker>Build your champion</Kicker>
        <h2 className="font-display text-[36px] font-bold leading-[1.1] text-ink">How do you want to make it?</h2>
      </div>
      <div className="mt-[12px] flex flex-col gap-[16px]">
        <Choice tone="punch" icon={<PencilIcon />} title="Draw it" hint="Bad drawings welcome." pressed={pressDraw} />
        <Choice tone="teal" icon={<TypeIcon />} title="Describe it" hint="One line. The Foundry does the rest." />
      </div>
    </Screen>
  );
}

const INKS = [TOY.charcoal.hex, TOY.tomato.hex, TOY.tangerine.hex, TOY.moss.hex, TOY.ocean.hex, TOY.grape.hex];

/** The drawing canvas with its inks: `layers` of doodle strokes. */
export function DrawScreen({
  title,
  layers,
  ink = 0,
  sendPress = 0,
  switchLabel = "Describe it instead",
  backdrop,
}: {
  title: string;
  layers: { strokes: readonly Ink[]; progress?: number; opacity?: number }[];
  ink?: number;
  sendPress?: number;
  switchLabel?: string;
  backdrop?: ReactNode;
}) {
  const size = W - 44;
  return (
    <Screen className="gap-[14px]">
      <h2 className="font-display text-[31px] font-bold leading-tight text-ink">{title}</h2>
      <div
        className="relative overflow-hidden rounded-[20px] border-[3px] border-edge"
        style={{ width: size, height: size, background: CREAM }}
      >
        {backdrop}
        <Doodle layers={layers} size={size - 6} className="absolute inset-0" />
      </div>
      <div className="flex items-center justify-between px-[4px]">
        {INKS.map((hex, index) => (
          <span
            key={hex}
            className="grid size-[44px] place-items-center rounded-full"
            style={{ boxShadow: index === ink ? `0 0 0 4px var(--surface), 0 0 0 7px ${hex}` : undefined }}
          >
            <span className="size-[36px] rounded-full" style={{ background: hex, border: `3px solid ${INK}` }} />
          </span>
        ))}
        <span className="grid size-[44px] place-items-center rounded-full border-[3px] border-dashed border-edge-strong" />
      </div>
      <div className="flex items-center gap-[10px]">
        <span className="rounded-full bg-raised px-[16px] py-[8px] text-[19px] font-bold text-ink">Undo</span>
        <span className="rounded-full bg-raised px-[16px] py-[8px] text-[19px] font-bold text-ink">Clear</span>
        <span className="ml-auto text-[19px] font-bold text-teal">{switchLabel}</span>
      </div>
      <div className="mt-auto">
        <BigButton pressed={sendPress}>Send to the Foundry</BigButton>
      </div>
    </Screen>
  );
}

/** Describe: a line typed into the box. */
export function DescribeScreen({ text, shown }: { text: string; shown: number }) {
  const count = Math.round(clamp(shown) * text.length);
  return (
    <Screen className="gap-[14px]">
      <h2 className="font-display text-[31px] font-bold leading-tight text-ink">Describe your champion</h2>
      <div className="min-h-[200px] rounded-[20px] border-[3px] border-teal bg-surface p-[18px] text-[32px] font-semibold leading-snug text-ink">
        {text.slice(0, count)}
        <span className="ml-[2px] inline-block h-[34px] w-[3px] translate-y-[6px] bg-teal" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[19px] font-bold text-teal">Draw it instead</span>
        <span className="font-mono text-[19px] text-ink-dim">{count}/280</span>
      </div>
      <div className="mt-auto">
        <BigButton pressed={0}>Send to the Foundry</BigButton>
      </div>
    </Screen>
  );
}

/** A champion on the cream plate, as the phone shows it. */
export function Plate({ kind, size, mood = "happy" }: { kind: ToyKind; size: number; mood?: "happy" | "angry" }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[20px]"
      style={{ width: size, height: size, background: CREAM, boxShadow: `inset 0 -8px 0 0 ${CAST[kind].color}55` }}
    >
      <ToyArt kind={kind} size={size * 0.86} mood={mood} extras={{ tux: kind === "shark" }} style={{ marginTop: -size * 0.06 }} />
    </span>
  );
}

function FighterButton({
  kind,
  sub,
  picked,
  pickAmount,
  side,
}: {
  kind: ToyKind;
  sub: string;
  picked: boolean;
  pickAmount: number;
  side: "A" | "B";
}) {
  return (
    <div
      className={`relative flex min-h-[176px] w-full items-center gap-[14px] rounded-[28px] border-[4px] p-[12px] ${
        picked ? "border-punch bg-punch/12" : "border-edge bg-surface"
      }`}
    >
      <span className="rounded-[20px]" style={{ boxShadow: `inset 0 -8px 0 0 var(${side === "A" ? "--teal" : "--gold"})` }}>
        <Plate kind={kind} size={136} mood={kind === "toaster" ? "angry" : "happy"} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <span className="font-display text-[30px] font-bold leading-[1.05] text-ink">{CAST[kind].name}</span>
        <span className="text-[19px] font-semibold text-ink-dim">{sub}</span>
      </span>
      {picked && (
        <span
          className="absolute -top-[18px] right-[14px] rounded-full bg-punch px-[14px] py-[6px] font-display text-[19px] font-extrabold uppercase tracking-wider text-accent-ink shadow"
          style={{ transform: `scale(${pickAmount}) rotate(${-6 * pickAmount}deg)` }}
        >
          Your pick
        </span>
      )}
    </div>
  );
}

/** Face-off: "Who wins?", one tap to bet. */
export function BetScreen({ pick, pickAmount = 1 }: { pick: "A" | "B" | null; pickAmount?: number }) {
  return (
    <Screen className="justify-center">
      <div className="flex flex-col items-center gap-[4px] text-center">
        <Kicker>Round 2 · Fight 2 of 2</Kicker>
        <h2 className="font-display text-[46px] font-bold leading-tight text-ink">Who wins?</h2>
      </div>
      <div className="flex flex-col gap-[8px]">
        <FighterButton kind="shark" sub="Biped · Sam" side="A" picked={pick === "A"} pickAmount={pickAmount} />
        <div className="text-center font-display text-[26px] font-black italic text-ink-dim">VS</div>
        <FighterButton kind="toaster" sub="Biped · Rio" side="B" picked={pick === "B"} pickAmount={pickAmount} />
      </div>
    </Screen>
  );
}

export function PhoneHealth({ name, health, max, side }: { name: string; health: number; max: number; side: "A" | "B" }) {
  const pct = clamp(health / max) * 100;
  return (
    <div className="rounded-[20px] bg-surface p-[14px]">
      <div className="mb-[8px] flex items-baseline justify-between gap-2">
        <span className="truncate font-display text-[25px] font-bold text-ink">{name}</span>
        <span className="font-mono text-[21px] font-bold tabular-nums text-ink-dim">{Math.ceil(health)}</span>
      </div>
      <div className="relative h-[28px] overflow-hidden rounded-full bg-raised">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${pct <= 25 ? "bg-fail" : side === "A" ? "bg-teal" : "bg-gold"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Fight: two health bars and the Hype! button, mashed at `taps` (local seconds). */
export function HypeScreen({
  t,
  taps,
  health,
}: {
  t: number;
  taps: readonly number[];
  health: { A: number; B: number };
}) {
  let press = 0;
  let count = 0;
  for (const tap of taps) {
    if (t >= tap) count++;
    press = Math.max(press, t >= tap ? 1 - progress(t, tap, 0.14, ease.out) : 0);
  }
  return (
    <Screen className="gap-[12px]">
      <PhoneHealth name="Sir Chompsalot" health={health.A} max={110} side="A" />
      <PhoneHealth name="Crumb Lord" health={health.B} max={120} side="B" />
      <div className="relative mt-auto flex flex-col items-center gap-[14px] pb-[20px]">
        <div
          className="relative grid size-[260px] place-items-center rounded-full bg-punch font-display text-[62px] font-black uppercase tracking-wide text-accent-ink"
          style={{
            transform: `translateY(${press * 8}px) scale(${1 - press * 0.08})`,
            boxShadow: `0 ${12 - press * 9}px 0 0 color-mix(in srgb, var(--punch) 55%, #2a1a1f)`,
          }}
        >
          Hype!
          {taps.map((tap, index) => {
            const life = progress(t, tap, 0.6, ease.out);
            if (t < tap || life >= 1) return null;
            return (
              <span
                key={index}
                className="pointer-events-none absolute font-display text-[40px] font-black text-punch"
                style={{
                  right: 10 + (index % 3) * 26,
                  top: -10,
                  transform: `translateY(${-life * 70}px) scale(${mix(0.8, 1.25, life)})`,
                  opacity: 1 - life,
                }}
              >
                +1
              </span>
            );
          })}
        </div>
        <p className="text-[19px] font-semibold text-ink-dim">{count > 0 ? "The crowd gets louder." : "Mash it."}</p>
      </div>
    </Screen>
  );
}

/** Upgrade: "Add one thing", drawing on a new layer over the faded champion. */
export function UpgradeScreen({ layers }: { layers: { strokes: readonly Ink[]; progress?: number; opacity?: number }[] }) {
  return (
    <DrawScreen
      title="Draw on Sir Chompsalot"
      layers={layers}
      ink={1}
      switchLabel="Write it instead"
      backdrop={<div className="absolute inset-0" style={{ background: CREAM }} />}
    />
  );
}

