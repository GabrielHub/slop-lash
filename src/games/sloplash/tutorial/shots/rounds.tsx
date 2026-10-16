"use client";

import { Avatar } from "@/room/avatar";
import { useLocalTime } from "@/tutorial/clock";
import { shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { useBeats, type Beats } from "../beats";
import { KIT, RAFI, ROUND_VALUES, YOU, type CastMember } from "../content";
import { PixelText, pixelSize } from "../pixel";

/**
 * Double: three rounds as LED meters, each worth twice the last (x1, x2, x4),
 * then a leaderboard where the player in last leapfrogs to first on round 3.
 */

const CELL = 46;
const GAP = 8;
const PITCH = CELL + GAP;
const BASE_Y = 760;
const COLUMN_X = [330, 625, 920] as const;
const ROWS = [2, 4, 8] as const;
const TONES = ["var(--teal)", "var(--gold)", "var(--punch)"] as const;
const LABEL = pixelSize("400", 11, 3);

export function roundsBeats(b: Beats) {
  const columns = [
    b.at("double") + 0.12,
    b.word("double", "round,") + 0.12,
    b.word("double", "double!"),
  ];
  return {
    columns,
    board: b.word("double", "double!") + 0.35,
    leap: b.word("double", "never") - 0.05,
  };
}

/** Standings going into the last round, then after it: you sweep at x4 and leap to first. */
const STANDINGS: { member: CastMember; before: number; after: number }[] = [
  { member: RAFI, before: 2900, after: 2900 },
  { member: KIT, before: 2600, after: 2600 },
  { member: YOU, before: 1900, after: 4300 },
];

export function RoundsShot({ from, until }: { from: number; until: number }) {
  const t = useLocalTime();
  const b = useBeats(from);
  const k = roundsBeats(b);
  // Clear the floor a beat before the finale cut, so the podium rises on an empty stage.
  const leave = until - from - 0.38;
  const shake = shakeOffset(t, k.columns[2]! + 0.1, 12, 0.4);
  return (
    <div className="absolute inset-0" style={{ transform: `translate(${shake.x}px, ${shake.y}px)` }}>
      {COLUMN_X.map((x, index) => (
        <Column key={x} index={index} at={k.columns[index]!} leave={leave + index * 0.05} />
      ))}
      <Board at={k.board} leap={k.leap} leave={leave} />
    </div>
  );
}

/** Falls away with gravity from `leave`. */
function fall(t: number, leave: number) {
  const local = Math.max(0, t - leave);
  return { y: 5200 * local * local, r: local * 22 };
}

function Column({ index, at, leave }: { index: number; at: number; leave: number }) {
  const t = useLocalTime();
  if (t < at - 0.05) return null;
  const rows = ROWS[index]!;
  const tone = TONES[index]!;
  const x = COLUMN_X[index]!;
  const width = 4 * PITCH - GAP;
  const height = rows * PITCH - GAP;
  const rise = progress(t, at, 0.12 + rows * 0.045, ease.out);
  const lit = rise * rows;
  const drop = spring(t - at - rows * 0.03, SPRINGS.slam);
  const out = fall(t, leave);
  const pill = spring(t - at - 0.1, SPRINGS.pop);
  return (
    <div
      className="absolute"
      style={{ left: x - width / 2, top: 0, width, transform: `translateY(${out.y}px) rotate(${out.r * (index - 1)}deg)` }}
    >
      {Array.from({ length: rows * 4 }, (_, cell) => {
        const row = Math.floor(cell / 4);
        const col = cell % 4;
        const on = clamp(lit - row);
        if (on <= 0) return null;
        return (
          <div
            key={cell}
            className="absolute"
            style={{
              left: col * PITCH,
              top: BASE_Y - (row + 1) * PITCH + GAP,
              width: CELL,
              height: CELL,
              borderRadius: 8,
              background: `color-mix(in srgb, var(--gold) ${Math.round((1 - on) * 100)}%, ${tone})`,
              boxShadow: `0 0 18px color-mix(in srgb, ${tone} 40%, transparent), inset 0 -6px 0 color-mix(in srgb, ${tone} 72%, var(--bg))`,
              transform: `scale(${mix(0.4, 1, on)})`,
            }}
          />
        );
      })}
      <div
        className="absolute"
        style={{
          left: width / 2 - LABEL.width / 2,
          top: BASE_Y - height - 40 - LABEL.height,
          opacity: progress(t, at, 0.06),
          transform: `scale(${mix(2.2, 1, drop)})`,
          transformOrigin: "50% 100%",
        }}
      >
        <PixelText text={String(ROUND_VALUES[index])} cell={11} gap={3} color={tone} glow />
      </div>
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-[10px]"
        style={{ top: BASE_Y + 22, opacity: clamp(pill * 2), transform: `scale(${mix(0.5, 1, pill)})` }}
      >
        <span className="rounded-full bg-gold-soft px-[22px] py-[4px] font-mono text-[44px] font-black leading-[1.1] text-gold-ink">
          ×{2 ** index}
        </span>
        <span className="font-display text-[32px] font-extrabold uppercase leading-none tracking-[0.08em] text-ink-dim">
          Round {index + 1}
        </span>
      </div>
    </div>
  );
}

const ROW_Y = [370, 490, 610] as const;

/** The standings: you trail, then round 3's sweep at x4 carries you to the top. */
function Board({ at, leap, leave }: { at: number; leap: number; leave: number }) {
  const t = useLocalTime();
  if (t < at) return null;
  const swap = spring(t - leap - 0.15, SPRINGS.smooth);
  return (
    <div className="absolute inset-0">
      {STANDINGS.map((entry, index) => {
        const enter = spring(t - at - index * 0.07, SPRINGS.smooth);
        const target = entry.member === YOU ? 0 : index + 1;
        const y = mix(ROW_Y[index]!, ROW_Y[target]!, t >= leap ? swap : 0);
        const out = fall(t, leave + 0.05 * index);
        const you = entry.member === YOU;
        const gain = you && t >= leap;
        const score = gain ? mix(entry.before, entry.after, progress(t, leap + 0.05, 0.6, ease.out)) : entry.before;
        const rank = t >= leap + 0.3 ? target + 1 : index + 1;
        const badge = spring(t - leap, SPRINGS.pop);
        const lift = you && t >= leap ? Math.sin(clamp((t - leap - 0.15) / 0.6) * Math.PI) * 26 : 0;
        return (
          <div
            key={entry.member.name}
            className={`absolute flex h-[100px] w-[600px] items-center gap-[22px] rounded-[28px] border-[3px] bg-surface px-[26px] shadow-[0_24px_50px_-30px_rgba(0,0,0,0.6)] ${you ? "border-punch" : "border-edge"}`}
            style={{
              left: 1190,
              top: y - 50,
              opacity: progress(t, at + index * 0.07, 0.15),
              transform: `translateX(${(1 - enter) * 700 + lift * 0.4}px) translateY(${out.y - lift}px) rotate(${out.r * 0.5}deg) scale(${1 + lift / 400})`,
              zIndex: you ? 2 : 1,
            }}
          >
            <span className="w-[34px] font-mono text-[40px] font-black text-ink-dim">{rank}</span>
            <Avatar name={entry.member.name} modelId={entry.member.modelId} size="64px" />
            <span className={`flex-1 font-display text-[42px] font-extrabold ${you ? "text-punch" : "text-ink"}`}>
              {entry.member.name}
            </span>
            <span className="font-mono text-[40px] font-bold tabular-nums text-ink">
              {Math.round(score).toLocaleString("en-US")}
            </span>
            {gain && (
              <span
                className="absolute -right-[26px] -top-[34px] rounded-full bg-gold px-[18px] py-[4px] font-mono text-[34px] font-black text-accent-ink"
                style={{ transform: `scale(${mix(0.3, 1, badge)}) rotate(6deg)` }}
              >
                +2,400
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
