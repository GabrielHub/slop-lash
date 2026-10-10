"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { originOf, pulseAmbient, type AmbientPulseKind } from "@/lib/ambient-events";
import { playSound, type SoundName } from "@/lib/sounds";
import { useRoom } from "../context";
import { buzz } from "./buzz";
import { fireConfetti, type ConfettiPreset } from "./confetti";
import { useStageFx, type FlashTone, type ShakeKind, type StageFx } from "./stage-fx";
import { useSurface, type Surface } from "./surface";
import { FRESH_MS } from "./use-fresh";

/** Where a moment happened: a viewport fraction, an element, or a function measuring one. */
export type MomentOrigin =
  | { x: number; y: number }
  | RefObject<Element | null>
  | (() => { x: number; y: number });

/**
 * One beat of a staged moment. Everything on a beat lands together: the
 * renderer (gated on the returned beat count), its sound, and its effects.
 */
export interface MomentCue {
  /** Milliseconds after the anchor (the phase start, unless `anchor` is given). Keep cues in time order. */
  at: number;
  sound?: SoundName;
  /** Stage presets fire on the stage; "personal" fires only on a phone. */
  confetti?: ConfettiPreset;
  /** A background reaction, from `origin`. */
  ambient?: AmbientPulseKind | { kind: AmbientPulseKind; strength?: number };
  /** Stage only. */
  shake?: ShakeKind;
  /** Stage only. */
  flash?: FlashTone;
  /** Phone only: a vibration pattern (see `buzz`). */
  haptic?: number | number[];
  /** Where the confetti and the ambient pulse come from. Defaults to the centre. */
  origin?: MomentOrigin;
  /** Anything else that belongs on this beat. Runs live and fresh only, even under reduced motion. */
  run?: () => void;
}

export interface MomentOptions {
  /** Arms the moment; until then it reports beat 0. Default true. */
  when?: boolean;
  /** The moment's t=0, in ms on the server clock. Defaults to the phase start. */
  anchor?: number;
}

/** Cues further in the past than this when a moment arms are shown, not played. */
const PAST_CUE_MS = 300;

/**
 * Where t=0 sits on this device's clock, per anchor. Shared by every moment so
 * those mounted a little later (after a scene's exit animation) stay in step,
 * and kept across StrictMode's effect replay.
 */
const starts = new Map<number, number>();

/**
 * `past`: the anchor is known to be behind the server clock (the phase
 * start), so if it reads as ahead, this device's clock is slow; play now
 * rather than wait for it.
 */
function startFor(anchor: number, clockOffsetMs: number, commit: boolean, past: boolean): number {
  const known = starts.get(anchor);
  if (known !== undefined) return known;
  const now = Date.now();
  const local = anchor - clockOffsetMs;
  const late = now - local;
  // Arriving late but still fresh: shift the whole timeline so no beat is lost or doubled up.
  const start = (late > 0 || past) && late <= FRESH_MS ? now : local;
  if (commit) {
    starts.set(anchor, start);
    if (starts.size > 32) starts.delete(starts.keys().next().value!);
  }
  return start;
}

function pastBeats(cues: readonly MomentCue[], elapsed: number) {
  let count = 0;
  while (count < cues.length && cues[count]!.at <= elapsed - PAST_CUE_MS) count++;
  return count;
}

function resolveOrigin(origin: MomentOrigin | undefined) {
  if (!origin) return undefined;
  if (typeof origin === "function") return origin();
  if ("current" in origin) return originOf(origin.current);
  return origin;
}

interface PlayContext {
  surface: Surface;
  fx: StageFx;
  reduced: boolean;
}

function play(cue: MomentCue, { surface, fx, reduced }: PlayContext) {
  if (cue.sound) playSound(cue.sound);
  if (cue.haptic !== undefined && surface === "phone") buzz(cue.haptic);
  cue.run?.();
  if (reduced) return;
  const origin = resolveOrigin(cue.origin);
  if (cue.confetti && (cue.confetti === "personal") === (surface === "phone")) {
    fireConfetti(cue.confetti, origin);
  }
  if (cue.ambient) {
    const pulse = typeof cue.ambient === "string" ? { kind: cue.ambient } : cue.ambient;
    pulseAmbient({ ...pulse, origin });
  }
  if (surface === "stage") {
    if (cue.shake) fx.shake(cue.shake);
    if (cue.flash) fx.flash(cue.flash);
  }
}

/**
 * One clock for a staged moment. Schedules each cue's sound, confetti, ambient
 * pulse, shake, flash and haptic from the server-synced phase start (or
 * `anchor`), and returns how many beats have fired so renderers can gate on
 * it (`beat >= 2`).
 *
 * - Not live (a recap): every beat at once, no effects.
 * - Seen up to 5s late (lag, a scene exit, a skewed clock): plays from the
 *   top. Opened later than that: resumes at the right beat; cues more than
 *   300ms in the past are shown but not played.
 * - A new anchor (the next phase, a replay) re-arms it.
 * - Reduced motion keeps the beat timing and the sounds, but skips confetti,
 *   shake, flash and the ambient pulse.
 * - Haptics only fire on a phone, shake and flash only on the stage.
 */
export function useMoment(cues: readonly MomentCue[], options: MomentOptions = {}): number {
  const { when = true, anchor } = options;
  const { live, view, clockOffsetMs } = useRoom();
  const surface = useSurface();
  const fx = useStageFx();
  const reduced = useReducedMotion() ?? false;
  const base = anchor ?? view.room.phaseStartedAt;
  const past = anchor === undefined;
  const armed = live && when;
  // Cues are usually an inline literal; only their timing should re-arm the clock.
  const timing = cues.map((cue) => cue.at).join(",");

  const playCue = useEffectEvent((index: number) => {
    const cue = cues[index];
    if (cue) play(cue, { surface, fx, reduced });
  });

  // Which cues already fired for this anchor; survives StrictMode's effect replay.
  const fired = useRef<{ base: number; done: Set<number> }>({ base: Number.NaN, done: new Set() });
  const [beat, setBeat] = useState({ base: Number.NaN, value: 0 });
  // A screen mounted mid-moment renders the beats already behind it straight away.
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!armed) return;
    if (fired.current.base !== base) fired.current = { base, done: new Set() };
    const done = fired.current.done;
    const start = startFor(base, clockOffsetMs, true, past);
    const timers: number[] = [];
    const fire = (index: number, effects: boolean) => {
      if (done.has(index)) return;
      done.add(index);
      if (effects) playCue(index);
      setBeat((previous) => ({
        base,
        value: Math.max(previous.base === base ? previous.value : 0, index + 1),
      }));
    };
    const elapsed = Date.now() - start;
    const ats = timing ? timing.split(",").map(Number) : [];
    ats.forEach((at, index) => {
      if (at <= elapsed - PAST_CUE_MS) fire(index, false);
      else if (at <= elapsed) fire(index, true);
      else timers.push(window.setTimeout(() => fire(index, true), at - elapsed));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [armed, base, clockOffsetMs, timing, past]);

  if (!live) return cues.length;
  if (!when) return 0;
  const settled = beat.base === base ? beat.value : 0;
  return Math.max(settled, pastBeats(cues, mountedAt - startFor(base, clockOffsetMs, false, past)));
}
