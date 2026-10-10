"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { pop, press } from "@/lib/animations";
import { Sheet } from "@/room/menu-sheet";
import { bodyPlanLabel, type Champion } from "../../sheet";
import { DRAWING_CANVAS_HEX, MOVE_TYPE_INFO, TOY_COLOR_VALUES, TRAIT_INFO, type MoveType } from "../../vocab";
import { Pips } from "./shared";
import { ChampionSilhouette } from "./silhouette";

// The champion card: everything the Foundry decided, readable on a phone.
// It stays reachable all game through the "My champion" chip.

/** Champions sit on the drawing canvas's cream, so every palette reads in both themes. */
export const PLATE = DRAWING_CANVAS_HEX;

const STATS = [
  ["heft", "Heft"],
  ["reach", "Reach"],
  ["chaos", "Chaos"],
] as const;

/** A tiny glyph per move type: a fist, a grab, a swirl. */
export function MoveTypeIcon({ type, className = "size-5" }: { type: MoveType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === "STRIKE" && <path d="M13 2 4 14h7l-1 8 9-12h-7z" />}
      {type === "GRAPPLE" && (
        <>
          <path d="M6 13V7a2 2 0 0 1 4 0v5" />
          <path d="M10 11V5a2 2 0 0 1 4 0v6" />
          <path d="M14 11V7a2 2 0 0 1 4 0v7a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0" />
        </>
      )}
      {type === "TRICK" && <path d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1-6 6" />}
    </svg>
  );
}

const MOVE_TONE: Record<MoveType, string> = {
  STRIKE: "text-punch bg-punch/12",
  GRAPPLE: "text-teal bg-teal-soft",
  TRICK: "text-gold-ink bg-gold-soft",
};

export function ChampionCard({
  champion,
  compact = false,
  className = "",
}: {
  champion: Champion;
  compact?: boolean;
  className?: string;
}) {
  const accent = TOY_COLOR_VALUES[champion.palette.primary].hex;
  return (
    <motion.article
      variants={pop}
      initial="hidden"
      animate="visible"
      className={`overflow-hidden rounded-3xl border-2 border-edge bg-surface ${className}`}
    >
      <header className="relative flex items-center gap-3 px-4 pt-4">
        <div
          className="grid size-24 shrink-0 place-items-center rounded-2xl"
          style={{ background: PLATE, boxShadow: `inset 0 -6px 0 0 color-mix(in srgb, ${accent} 45%, transparent)` }}
        >
          <ChampionSilhouette champion={champion} className="size-20" />
        </div>
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-raised px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink-dim">
            {bodyPlanLabel(champion)}
          </span>
          <h3 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{champion.name}</h3>
        </div>
      </header>
      <div className="flex flex-col gap-3 p-4">
        {!compact && <p className="text-[15px] leading-snug text-ink-dim">{champion.bio}</p>}
        <ul className="flex flex-col gap-1.5">
          {champion.moves.map((move) => (
            <li key={move.name} className="flex items-center gap-2.5 rounded-xl bg-raised/60 px-2.5 py-2">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${MOVE_TONE[move.type]}`}>
                <MoveTypeIcon type={move.type} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-ink">{move.name}</span>
                <span className="block text-xs font-semibold uppercase tracking-wider text-ink-dim">
                  {MOVE_TYPE_INFO[move.type].label}
                </span>
              </span>
              <Pips value={move.power} tone="bg-ink" />
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-1.5">
          {champion.traits.map((trait) => (
            <li
              key={trait}
              title={TRAIT_INFO[trait]}
              className="rounded-full border border-edge-strong px-3 py-1 text-sm font-bold capitalize text-ink"
            >
              {trait}
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
          {STATS.map(([key, label]) => (
            <div key={key} className="contents">
              <dt className="text-sm font-bold text-ink-dim">{label}</dt>
              <dd>
                <Pips value={champion.stats[key]} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </motion.article>
  );
}

/** The "My champion" chip and its sheet; renders nothing until there is a champion. */
export function MyChampionButton({ champion }: { champion: Champion | null }) {
  const [open, setOpen] = useState(false);
  if (!champion) return null;
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-raised py-1 pl-1 pr-3 text-sm font-bold text-ink"
        {...press}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: PLATE }}>
          <ChampionSilhouette champion={champion} className="size-8" />
        </span>
        <span className="truncate">My champion</span>
      </motion.button>
      <Sheet open={open} onClose={() => setOpen(false)} label="My champion">
        <div className="px-4 pb-2 pt-1">
          <ChampionCard champion={champion} className="border-0" />
        </div>
      </Sheet>
    </>
  );
}
