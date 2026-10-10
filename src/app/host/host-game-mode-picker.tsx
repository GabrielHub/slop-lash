"use client";

import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GAME_TYPES, type GameType } from "@/games/core/types";
import { GAME_META } from "@/games/meta";
import { CheckIcon } from "@/components/icons";
import { hoverLift, pop, SPRING } from "@/lib/animations";

export type HostParticipation = "PLAYER" | "DISPLAY_ONLY";

/** "3–8 players" from a game's real seat limits. */
export function playerRangeLabel(option: { minPlayers: number; maxPlayers: number }): string {
  return `${option.minPlayers}–${option.maxPlayers} players`;
}

/** Three game cards, each tinted with its own game's palette once picked. */
export function HostGamePicker({
  gameType,
  onGameTypeChange,
}: {
  gameType: GameType;
  onGameTypeChange: (gameType: GameType) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Pick a game</h1>
      </legend>
      <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
        {GAME_TYPES.map((id) => {
          const option = GAME_META[id];
          const selected = gameType === id;
          const style = {
            "--card-accent": option.accent,
            background: selected
              ? "color-mix(in srgb, var(--card-accent) 14%, var(--surface))"
              : "color-mix(in srgb, var(--surface) 85%, transparent)",
          } as CSSProperties;

          return (
            <motion.label
              key={id}
              data-game={option.theme}
              style={style}
              className={`relative flex h-[4.5rem] cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 text-left transition-[border-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--card-accent)/60 sm:h-auto sm:min-h-[8.5rem] sm:flex-col sm:items-start sm:gap-1 sm:p-4 ${
                selected
                  ? "border-(--card-accent) shadow-[0_0_32px_-10px_var(--card-accent)]"
                  : "border-edge hover:border-edge-strong"
              }`}
              {...hoverLift}
            >
              <input
                type="radio"
                name="game-type"
                value={id}
                checked={selected}
                onChange={() => onGameTypeChange(id)}
                className="sr-only"
              />
              <span
                className={`order-first grid size-5 shrink-0 place-items-center rounded-full border-2 sm:absolute sm:top-3.5 sm:right-3.5 ${
                  selected ? "border-(--card-accent) bg-(--card-accent)" : "border-edge-strong"
                }`}
                aria-hidden="true"
              >
                <AnimatePresence initial={false}>
                  {selected && (
                    <motion.span
                      className="grid place-items-center text-accent-ink"
                      variants={pop}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <CheckIcon size={12} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="min-w-0 flex-1 sm:flex-none sm:pr-6">
                <span
                  className={`block font-display text-lg sm:text-xl font-bold leading-tight ${
                    selected ? "text-(--card-accent)" : "text-ink"
                  }`}
                >
                  {option.name}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-ink-dim">
                  {option.tagline}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-ink-dim/80 sm:mt-auto sm:pt-2">
                {playerRangeLabel(option)}
              </span>
            </motion.label>
          );
        })}
      </div>
    </fieldset>
  );
}

const PARTICIPATION_OPTIONS: { id: HostParticipation; label: string }[] = [
  { id: "DISPLAY_ONLY", label: "On this screen (TV)" },
  { id: "PLAYER", label: "I'm playing too" },
];

/** Two segments: host from a shared screen, or take a seat. Reads `--host-accent` from the form. */
export function HostParticipationPicker({
  participation,
  onChange,
}: {
  participation: HostParticipation;
  onChange: (participation: HostParticipation) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3 font-display text-lg font-bold text-ink">
        Where are you playing?
      </legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl border-2 border-edge bg-surface/80 p-1">
        {PARTICIPATION_OPTIONS.map((option) => {
          const selected = participation === option.id;
          return (
            <label
              key={option.id}
              className={`relative flex h-12 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--host-accent)/60 ${
                selected ? "text-ink" : "text-ink-dim hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="host-participation"
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              {selected && (
                <motion.span
                  layoutId="host-participation-pill"
                  className="absolute inset-0 rounded-lg bg-(--host-accent)/15 ring-2 ring-(--host-accent)/60"
                  transition={SPRING.snappy}
                  aria-hidden="true"
                />
              )}
              <span className="relative">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
