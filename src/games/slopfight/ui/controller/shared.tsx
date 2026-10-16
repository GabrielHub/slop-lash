"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { press } from "@/lib/animations";
import { useModeView, useRoom, type ModeView, type RoomPlayer } from "@/room/context";
import { buzz } from "@/room/moment";
import { usePhaseCountdown } from "@/room/timer";
import { sfx, type SfxName } from "../../audio";
import type { Champion } from "../../sheet";

export type SlopfightMode = ModeView<"SLOPFIGHT">;
export type FighterView = SlopfightMode["fighters"][number];
export type FightView = SlopfightMode["fights"][number];
export type Side = "A" | "B";

export const useSlopfight = () => useModeView("SLOPFIGHT");

/** This phone's fighter (null for a spectator seat), its champion, and the mode. */
export function useMine() {
  const mode = useSlopfight();
  const fighter = mode.fighters.find((entry) => entry.id === mode.myFighterId) ?? null;
  return { mode, fighter, champion: fighter?.champion ?? null };
}

export function fighterById(mode: SlopfightMode, id: string | null | undefined) {
  return mode.fighters.find((entry) => entry.id === id) ?? null;
}

export const championName = (champion: Champion | null | undefined) =>
  champion?.name ?? "A mystery champion";

/** Who made a fighter: a player's name, or "House". */
export function ownerName(players: readonly RoomPlayer[], fighter: FighterView | null) {
  if (!fighter?.ownerId) return "House";
  return players.find((player) => player.id === fighter.ownerId)?.name ?? "Someone";
}

export function currentFight(mode: SlopfightMode) {
  return mode.fights.find((fight) => fight.id === mode.currentFightId) ?? null;
}

/** The side this fighter fights on in a fight, or null. */
export function sideOf(fight: FightView, fighterId: string | null | undefined): Side | null {
  if (!fighterId) return null;
  if (fight.a === fighterId) return "A";
  if (fight.b === fighterId) return "B";
  return null;
}

/**
 * A haptic for something the phone did on its own (a forge landing, a hit, a
 * result). Browsers block vibration before the first tap and log an error, so
 * these wait for user activation; tap haptics call `buzz` directly.
 */
export function ambientBuzz(pattern: number | number[]) {
  if (typeof navigator === "undefined" || navigator.userActivation?.hasBeenActive !== true) return;
  buzz(pattern);
}

/** A UI sound, only in a live room (fixtures stepped live, never recaps). */
export function useSfx() {
  const { live } = useRoom();
  return useCallback(
    (name: SfxName, intensity?: number) => {
      if (live) sfx.play(name, { intensity });
    },
    [live],
  );
}

/**
 * A phone screen: content on top, the one action anchored in the thumb zone.
 * `center` vertically centres status screens.
 */
export function Screen({
  children,
  action,
  center = false,
  fill = false,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  center?: boolean;
  /** The content column takes the full height (for a layout that pins its own bottom). */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 ${className}`}>
      <div className={`flex flex-col gap-4 ${center ? "my-auto" : ""} ${fill ? "flex-1" : ""}`}>{children}</div>
      {action && (
        <div data-keyboard-bar className="sticky bottom-[var(--keyboard-inset)] z-10 mt-auto -mx-4 bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {action}
        </div>
      )}
    </div>
  );
}

/** The big thumb button. */
export function BigButton({
  children,
  onClick,
  disabled = false,
  tone = "punch",
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "punch" | "teal" | "quiet";
  className?: string;
}) {
  const colours =
    tone === "punch"
      ? "bg-punch text-accent-ink"
      : tone === "teal"
        ? "bg-teal text-accent-ink"
        : "bg-raised text-ink";
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-14 w-full cursor-pointer rounded-2xl font-display text-xl font-bold transition-colors disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-dim ${colours} ${className}`}
      {...press}
    >
      {children}
    </motion.button>
  );
}

/** A small uppercase line over a screen's headline. */
export function Kicker({ children, tone = "punch" }: { children: ReactNode; tone?: "punch" | "teal" | "gold" | "dim" }) {
  const colour = { punch: "text-punch", teal: "text-teal", gold: "text-gold-ink", dim: "text-ink-dim" }[tone];
  return (
    <p className={`font-display text-xs font-extrabold uppercase tracking-[0.22em] ${colour}`}>{children}</p>
  );
}

/** Countdown ticks for the last five seconds of a timed phase, while this phone still has to act. */
export function useLastSecondsTicks(when: boolean) {
  const countdown = usePhaseCountdown();
  const play = useSfx();
  const last = useRef<number | null>(null);
  const { remaining, untimed } = countdown;
  useEffect(() => {
    if (!when || untimed || remaining > 5 || remaining <= 0) return;
    if (last.current === remaining) return;
    last.current = remaining;
    play("countdownTick", remaining <= 3 ? 0.8 : 0.5);
  }, [when, untimed, remaining, play]);
}

/** Pips 1-5, filled to `value`. */
export function Pips({ value, max = 5, tone = "bg-punch" }: { value: number; max?: number; tone?: string }) {
  return (
    <span className="flex gap-1" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`h-2.5 w-4 rounded-full ${index < value ? tone : "bg-edge-strong/60"}`}
        />
      ))}
    </span>
  );
}
