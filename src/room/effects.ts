"use client";

import { useEffect, useRef } from "react";
import type { Options as ConfettiOptions } from "canvas-confetti";
import { playSound, type SoundName } from "@/lib/sounds";
import { useRoom } from "./context";

/**
 * Plays `sound` whenever `key` changes after the first render and `when`
 * holds. Mounting never plays, so a reload or a recap stays quiet.
 */
export function useCue(key: string | number, sound: SoundName, when = true) {
  const { live } = useRoom();
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    if (when && live) playSound(sound);
  }, [key, sound, when, live]);
}

export type ConfettiBurst = ConfettiOptions & { delayMs?: number };

/** A screen opened later than this into the phase has missed the moment. */
const FRESH_MOMENT_MS = 5_000;

/**
 * Celebrates once, the first time `when` holds in a live room: an optional
 * sound (and follow-up), then each confetti burst after its delay. A screen
 * that opens or reloads well after the phase began stays quiet.
 */
export function useCelebration(
  when: boolean,
  bursts: readonly ConfettiBurst[],
  sounds: { sound?: SoundName; followUp?: { sound: SoundName; delayMs: number } } = {},
) {
  const { live, view, clockOffsetMs } = useRoom();
  const { phaseStartedAt } = view.room;
  const fired = useRef(false);
  // Bursts and sounds are usually inline literals; only `when` should re-run this.
  const plan = useRef({ bursts, sounds });
  useEffect(() => {
    plan.current = { bursts, sounds };
  });
  useEffect(() => {
    if (!when || !live || fired.current) return;
    fired.current = true;
    if (Date.now() + clockOffsetMs - phaseStartedAt > FRESH_MOMENT_MS) return;
    const { bursts: queued, sounds: cues } = plan.current;
    if (cues.sound) playSound(cues.sound);
    const timers: number[] = [];
    if (cues.followUp) {
      const { sound, delayMs } = cues.followUp;
      timers.push(window.setTimeout(() => playSound(sound), delayMs));
    }
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      for (const { delayMs = 0, ...options } of queued) {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) void confetti(options);
          }, delayMs),
        );
      }
    });
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [when, live, phaseStartedAt, clockOffsetMs]);
}
