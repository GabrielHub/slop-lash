"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { usePhaseCountdown } from "./timer";
import { ErrorBanner } from "@/components/error-banner";
import { useGameUi } from "./game-ui-context";
import {
  heldEnergy,
  pulseAmbient,
  resetAmbient,
  setAmbient,
  type AmbientSurface,
} from "@/lib/ambient-events";
import { press } from "@/lib/animations";
import { playSound } from "@/lib/sounds";
import { useRoom, useServerNow, type RoomView } from "./context";
import { isHostClocked, useHostActions, useTwoTap } from "./host-actions";
import { buzz } from "./moment";

/** A phase shorter than this is a display beat (a reveal), not a race against the clock. */
const RACE_MIN_SECONDS = 20;

/** A key that changes whenever a phone screen should show something new. */
export function phaseKey(view: RoomView) {
  const { room } = view;
  return `${room.status}:${room.phase}:${room.round}:${room.step}`;
}

/**
 * Keeps the background in step with the room: the game's own scene from the
 * lobby on, its energy for the current view, and "urgent" in the last 10s of
 * a timed phase. On the stage "hype" settles to calm a few seconds into each
 * phase (`heldEnergy`). Puts the starfield back when the room closes.
 */
export function AmbientDriver({ surface }: { surface: AmbientSurface }) {
  const { view } = useRoom();
  const ui = useGameUi();
  const countdown = usePhaseCountdown();
  const now = useServerNow();
  const { status, phaseStartedAt } = view.room;
  const wanted = status === "LOBBY" ? "calm" : (ui.ambientEnergy?.(view) ?? "calm");
  const energy = heldEnergy(wanted, surface, now - phaseStartedAt);
  const urgent =
    status === "PLAYING" &&
    !countdown.untimed &&
    !countdown.expired &&
    countdown.total >= RACE_MIN_SECONDS &&
    countdown.remaining <= 10;

  useEffect(() => {
    setAmbient({ scene: ui.ambient, surface, energy, urgent });
  }, [ui.ambient, surface, energy, urgent]);

  useEffect(() => () => resetAmbient(), []);
  return null;
}

/** The stage's clock sounds: `timer-warning` as a timed phase crosses 10s and 5s. */
export function StageClockCues() {
  const { view, live } = useRoom();
  const { remaining, untimed, total } = usePhaseCountdown();
  const deadline = view.room.phaseDeadline;
  const previous = useRef<{ deadline: number | null; remaining: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { deadline, remaining };
    if (!before || before.deadline !== deadline) return;
    if (!live || untimed || total < RACE_MIN_SECONDS) return;
    const crossed = (mark: number) => before.remaining > mark && remaining <= mark && remaining > 0;
    if (crossed(10) || crossed(5)) playSound("timer-warning");
  }, [deadline, remaining, untimed, total, live]);

  return null;
}

/**
 * The phone's "your turn": when a phase begins that needs this player, a
 * brief inset glow around the screen and a short buzz, so nobody needs an
 * instruction to look down. Quiet on the first render, recaps and phases that
 * need nothing.
 */
export function YourTurnNudge({ fixed, swell }: { fixed: boolean; swell: boolean }) {
  const { view, live } = useRoom();
  const ui = useGameUi();
  const key = phaseKey(view);
  const needs = ui.needsInput?.(view) ?? false;
  const [seenKey, setSeenKey] = useState(key);
  const [pulse, setPulse] = useState(0);
  if (seenKey !== key) {
    setSeenKey(key);
    if (live && needs) setPulse((count) => count + 1);
  }

  useEffect(() => {
    if (pulse === 0) return;
    buzz(15);
    if (swell) pulseAmbient({ kind: "swell", strength: 0.6 });
  }, [pulse, swell]);

  if (pulse === 0) return null;
  return (
    <motion.div
      key={pulse}
      aria-hidden="true"
      className={`your-turn-glow pointer-events-none inset-0 z-40 ${fixed ? "fixed" : "absolute"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 0.6, times: [0, 0.25, 1], ease: "easeOut" }}
    />
  );
}

/**
 * The seated host's advance in a "no timers" room, where the host is the
 * clock: a sticky full-width button labelled with where it goes ("Next
 * matchup ▸"). Hidden while the host still owes input. Until the game says
 * (`needsInput`), it takes two taps, so it can't cut off the host's own
 * unfinished answer; once the game says nothing is left, one tap.
 */
export function HostContinueBar({ className = "" }: { className?: string }) {
  const { view } = useRoom();
  const { room, me } = view;
  const ui = useGameUi();
  const { skip, pending, error } = useHostActions();
  const { armed, press: pressTwice } = useTwoTap({ resetOn: room.phaseGeneration });
  const needs = ui.needsInput?.(view);

  if (me?.isHost !== true || !isHostClocked(room) || needs === true) return null;
  const confirm = needs === undefined;
  const ready = armed === "advance";
  return (
    // overflow-x-clip: the button's breathing ring grows 18% wider than the bar,
    // which would otherwise widen the whole phone page.
    <div
      className={`sticky bottom-0 z-20 overflow-x-clip border-t border-edge bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${className}`}
    >
      <ErrorBanner error={error} className="mb-2" />
      <motion.button
        type="button"
        disabled={pending}
        onClick={() => (confirm ? pressTwice("advance", () => void skip()) : void skip())}
        className={`relative isolate h-14 w-full cursor-pointer rounded-2xl font-display text-lg font-bold text-accent-ink transition-colors disabled:opacity-60 ${
          ready ? "bg-ink" : "animate-continue-breathe bg-punch hover:bg-punch-hover"
        }`}
        {...press}
      >
        {ready ? `Tap again · ${ui.advanceLabel(view)}` : `${ui.advanceLabel(view)} ▸`}
      </motion.button>
    </div>
  );
}
