"use client";

import { MATCHSLOP_INITIAL_MOOD } from "../types";
import { useModeView, useRoom } from "@/room/context";
import { useMoment, type MomentCue, type MomentOptions } from "@/room/moment";
import { personaTurn } from "./primitives";

/**
 * Every MatchSlop beat, in ms from `room.phaseStartedAt`. The stage and the
 * phone both read these, so a phone's payoff lands on the TV's beat.
 */

/** The Meet (WRITING round 1), offset by `meetOffset`. */
export const MEET = {
  unblur: 0,
  stamp: 500,
  name: 900,
  place: 1300,
  dock: 2600,
  fill: 3000,
  unmatchLine: 3200,
  dateLine: 3400,
  deal: 3600,
  tracker: 4100,
} as const;
/** After a PROFILE scene the Meet starts at once; after the game-start card, once it has gone. */
export const meetOffset = (sawProfile: boolean) => (sawProfile ? 300 : 1800);

/** WRITING round 2 on. */
export const NEXT = { instruction: 200, tracker: 400 } as const;

/** VOTING: the deal. */
export const BALLOT = { dealBase: 150, dealStep: 90 } as const;

/** SENT with a ballot. */
export const SEND = {
  reveal: 0,
  flyBase: 200,
  flyStep: 140,
  collapseB1: 1600,
  unmask: 1900,
  stamp: 2600,
  morph: 3600,
  typing: 4300,
} as const;
/** SENT with one line (no vote). */
export const LONE = { bubble: 0, author: 600, typing: 1200 } as const;
export const REPLY_CPS = 60;
/** Typing speed of the parting and the phone's verdict. */
export const PARTING_CPS = 40;

/** REPLY: T is when her reply has finished typing. */
export function replyBeats(text: string) {
  const T = Math.round((text.length / REPLY_CPS) * 1000) + 400;
  return {
    T,
    react: T,
    impact: T + 170,
    delta: T + 600,
    swing: T + 1100,
    thought: T + 1700,
    pulse: T + 1700,
    hero: T + 2100,
    heroImpact: T + 2270,
    celebrate: T + 2670,
    dock: T + 3600,
    heroThought: T + 3900,
    teaser: T + 4200,
  };
}

/** FINISHED · FINAL, for `rows` standings rows. */
export function finalBeats(rows: number) {
  const crown = 1600 + Math.max(0, rows - 1) * 160 + 300;
  return {
    fold: 0,
    unstampedStamp: 400,
    unstampedImpact: 570,
    name: 700,
    parting: 1000,
    row: (fromLast: number) => 1600 + fromLast * 160,
    crown,
    verdicts: crown + 800,
    verdictStep: 120,
  };
}

/** A cue with a name, so renderers ask `reached("dock")` rather than count indexes. */
export type NamedCue<K extends string> = MomentCue & { name: K };

/**
 * `useMoment` over named cues. Cues may come in any order; they are sorted by
 * time. Returns `reached(name)`, true once that cue's beat has fired (always,
 * in a recap).
 */
export function useBeats<K extends string>(
  cues: readonly NamedCue<K>[],
  options?: MomentOptions,
): (name: K) => boolean {
  const sorted = cues.toSorted((left, right) => left.at - right.at);
  const beat = useMoment(sorted, options);
  return (name) => {
    const index = sorted.findIndex((cue) => cue.name === name);
    return index >= 0 && index < beat;
  };
}

/** The persona's latest reply and her mood before it (50 for the first). */
export function usePersonaTurn() {
  const mode = useModeView("MATCHSLOP");
  const { latest, previous } = personaTurn(mode.messages);
  return { latest, previousMood: previous?.mood ?? MATCHSLOP_INITIAL_MOOD };
}

/**
 * The mood both surfaces show. During REPLY it holds her previous mood until
 * the swing beat, so the meter and the bubbles background don't spoil the
 * result before the reaction lands; otherwise it is `mode.mood`.
 */
export function useDisplayMood(): number {
  const { view } = useRoom();
  const mode = useModeView("MATCHSLOP");
  const { latest, previousMood } = usePersonaTurn();
  const replying = view.room.status === "PLAYING" && view.room.phase === "REPLY";
  const swing = replyBeats(replying ? (latest?.text ?? "") : "").swing;
  const reached = useBeats([{ name: "swing", at: swing }], { when: replying });
  if (!replying) return mode.mood;
  return reached("swing") ? mode.mood : previousMood;
}
