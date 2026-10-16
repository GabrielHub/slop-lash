"use client";

import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/room/avatar";
import { useCues, useTime } from "@/tutorial/clock";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { CAST, MATCH, type CastId } from "./data";
import { C, alpha, fin, sp, tf } from "./fx";

/**
 * The narrator's side of the chat: the match's best friend, vetting the group.
 * Her voice note plays as the tutorial's own voice (its waveform scrubs with
 * the recording), and she sends bubbles and stickers into the group chat.
 */

export const FRIEND = { label: `${MATCH.name}'s best friend`, initials: "BFF" } as const;
export const GROUP = { title: `${MATCH.name}'s matches`, members: ["zoe", "tess", "remy", "claude"] as CastId[] };

/** Her face: a gradient circle, violet into rose, reading "BFF". */
export function FriendAvatar({ size = 84, talking = 0 }: { size?: number; talking?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {talking > 0.01 && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: `0 0 0 ${size * 0.05 + talking * size * 0.07}px ${alpha(C.rose, 35 * talking)}`,
          }}
        />
      )}
      <div
        className="absolute inset-0 grid place-items-center rounded-full"
        style={{
          background: `linear-gradient(150deg, ${C.violet}, ${C.rose} 75%)`,
          boxShadow: `0 0 0 ${Math.max(2, size * 0.04)}px var(--surface)`,
        }}
      >
        <span
          className="font-display font-black leading-none tracking-[-0.02em] text-accent-ink"
          style={{ fontSize: size * 0.32 }}
        >
          {FRIEND.initials}
        </span>
      </div>
    </div>
  );
}

const BARS = 40;
/** A recording's silhouette: louder in the middle of phrases, never flat. */
const BAR_HEIGHTS = Array.from({ length: BARS }, (_, index) => {
  const base = 0.28 + hash01(index * 3.7 + 1) * 0.55;
  const phrase = 0.65 + 0.35 * Math.sin(index * 0.55) ** 2;
  return clamp(base * phrase + 0.12, 0.18, 1);
});

/** How much she is talking at `t` (0 silent .. 1 mid-word), from the word timing. */
function useTalking(t: number): number {
  const cues = useCues();
  const line = cues.lineAt(t);
  if (!line || t > line.end + 0.1) return 0;
  const word = line.words.find((candidate) => t >= candidate.start - 0.03 && t <= candidate.end + 0.06);
  if (!word) return 0.15;
  const mid = (word.start + word.end) / 2;
  const half = Math.max(0.06, (word.end - word.start) / 2 + 0.06);
  return clamp(1 - Math.abs(t - mid) / half) * 0.7 + 0.3;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The voice note's size in its hero pose; the dock scales it down. */
export const NOTE = { width: 980, height: 150 } as const;
/** Docked, the note shrinks into the top-right corner: x 1386-1856, y 44-116. */
const DOCK_SCALE = 0.48;

/**
 * Her voice note: avatar, play button, a waveform that fills as she talks
 * (bars near the playhead dance on each word) and the elapsed time.
 */
export function VoiceNote() {
  const t = useTime();
  const cues = useCues();
  const start = cuesStart(cues);
  const end = cuesEnd(cues);
  const played = clamp((t - start) / (end - start));
  const playing = t >= start - 0.05 && t <= end + 0.1;
  const talking = useTalking(t);
  const head = played * BARS;
  return (
    <div
      className="flex items-center gap-[22px] rounded-[44px] rounded-bl-[14px] border-2 border-edge bg-surface px-[26px]"
      style={{
        width: NOTE.width,
        height: NOTE.height,
        boxShadow: "0 40px 70px -40px rgba(0,0,0,0.65)",
      }}
    >
      <FriendAvatar size={96} talking={talking} />
      <div className="grid size-[92px] shrink-0 place-items-center rounded-full bg-punch text-accent-ink">
        {playing ? (
          <svg viewBox="0 0 24 24" width={40} height={40} fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1.2" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width={44} height={44} fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </div>
      <div className="flex h-[96px] flex-1 items-center gap-[6px]">
        {BAR_HEIGHTS.map((height, index) => {
          const near = clamp(1 - Math.abs(index + 0.5 - head) / 4);
          const dance = playing ? near * talking * (0.35 + 0.35 * (wobble(t * 9, index) + 1)) : 0;
          const lit = index < head;
          return (
            <span
              key={index}
              className="block flex-1 rounded-full"
              style={{
                height: `${clamp(height + dance * 0.6, 0.12, 1) * 100}%`,
                background: lit ? C.rose : alpha(C.dim, 45),
              }}
            />
          );
        })}
      </div>
      <span className="w-[96px] shrink-0 text-right font-mono text-[36px] font-bold tabular-nums text-ink-dim">
        {formatClock(playing || t > end ? Math.min(t, end) - start : end - start)}
      </span>
    </div>
  );
}

function cuesStart(cues: ReturnType<typeof useCues>): number {
  return cues.at("intro") - 0.1;
}

function cuesEnd(cues: ReturnType<typeof useCues>): number {
  return cues.end("outro") + 0.2;
}

/** Where the voice note sits: centre stage for the hello, then docked top right. */
export function VoiceDock() {
  const t = useTime();
  const cues = useCues();
  const enter = cues.at("intro") - 0.5;
  const dock = cues.word("intro", "and") - 0.05;
  const shown = sp(t, enter, SPRINGS.pop);
  if (t < enter - 0.05) return null;
  const docked = spring(t - dock, SPRINGS.smooth);
  const scale = mix(1, DOCK_SCALE, docked) * mix(0.6, 1, clamp(shown));
  const hero = { x: 960, y: 590 };
  const parked = { x: 1856 - (NOTE.width * DOCK_SCALE) / 2, y: 44 + (NOTE.height * DOCK_SCALE) / 2 };
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 origin-top-left z-[35]"
      style={{
        transform: tf(mix(hero.x, parked.x, docked), mix(hero.y, parked.y, docked), scale),
        opacity: fin(t, enter, 0.15),
      }}
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <VoiceNote />
      </div>
    </div>
  );
}

/**
 * A die-cut sticker slapped on at `at`: it lands big and spun, settles on
 * `tilt`, and peels off at `out`.
 */
export function Sticker({
  children,
  at,
  out,
  tilt = -8,
  size = 110,
  tone,
  className = "",
  style,
}: {
  children: ReactNode;
  at: number;
  out?: number;
  tilt?: number;
  /** Font size, px (an emoji's size). */
  size?: number;
  /** A text sticker's fill; an emoji sticker has none. */
  tone?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useTime();
  if (t < at) return null;
  const slap = spring(t - at, SPRINGS.pop);
  const leave = out === undefined ? 0 : progress(t, out, 0.3, ease.in);
  if (leave >= 1) return null;
  const outline = "#fffafc";
  return (
    <div
      className={`inline-block ${className}`}
      style={{
        transform: `rotate(${mix(tilt - 24, tilt, slap) + leave * 30}deg) scale(${mix(1.7, 1, slap) * (1 - leave * 0.4)})`,
        opacity: progress(t, at, 0.06) * (1 - leave),
        filter: `drop-shadow(0 ${size * 0.08}px ${size * 0.12}px rgba(0,0,0,0.35))`,
        ...style,
      }}
    >
      {tone ? (
        <span
          className="block whitespace-nowrap rounded-[0.5em] px-[0.55em] py-[0.25em] font-display font-black uppercase leading-none tracking-[0.04em] text-accent-ink"
          style={{
            fontSize: size,
            background: tone,
            border: `${Math.max(4, size * 0.09)}px solid ${outline}`,
          }}
        >
          {children}
        </span>
      ) : (
        <span
          className="grid place-items-center rounded-full leading-none"
          style={{
            fontSize: size,
            width: size * 1.45,
            height: size * 1.45,
            background: outline,
          }}
        >
          {children}
        </span>
      )}
    </div>
  );
}

/** One of her text bubbles, with her face beside it, sliding up like a new message at `at`. */
export function FriendText({
  children,
  at,
  out,
  size = 40,
  face = true,
}: {
  children: ReactNode;
  at: number;
  out?: number;
  size?: number;
  face?: boolean;
}) {
  const t = useTime();
  if (t < at) return null;
  const rise = spring(t - at, SPRINGS.pop);
  const leave = out === undefined ? 0 : progress(t, out, 0.3, ease.in);
  return (
    <div
      className="flex items-end gap-[16px]"
      style={{
        opacity: clamp(rise * 3) * (1 - leave),
        transform: tf(0, (1 - rise) * 50 - leave * 40, mix(0.85, 1, rise)),
        transformOrigin: "bottom left",
      }}
    >
      <div style={{ opacity: face ? 1 : 0 }}>
        <FriendAvatar size={64} />
      </div>
      <div
        className="rounded-[40px] rounded-bl-[12px] border-2 border-edge bg-surface px-[32px] py-[20px] font-sans font-semibold leading-[1.2] text-ink"
        style={{ fontSize: size, boxShadow: "0 24px 50px -30px rgba(0,0,0,0.55)" }}
      >
        {children}
      </div>
    </div>
  );
}

/** The group chat's header: its members and its name. */
export function GroupHeader() {
  return (
    <div className="flex items-center gap-[22px] rounded-full border-2 border-edge bg-surface py-[14px] pl-[18px] pr-[34px]">
      <div className="flex">
        {GROUP.members.map((id, index) => (
          <div key={id} style={{ marginLeft: index === 0 ? 0 : -18 }}>
            <div className="rounded-full" style={{ boxShadow: "0 0 0 4px var(--surface)" }}>
              <MiniAvatar id={id} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <p className="font-display text-[38px] font-black leading-tight text-ink">{GROUP.title} 💘</p>
        <p className="font-sans text-[28px] font-medium leading-tight text-ink-dim">
          {FRIEND.label} added you
        </p>
      </div>
    </div>
  );
}

function MiniAvatar({ id }: { id: CastId }) {
  const who = CAST[id];
  return <Avatar name={who.name} modelId={who.modelId} size="64px" />;
}
