import type { MomentCue, MomentOrigin } from "@/room/moment";
import { ACCENT } from "@/lib/animations";
import type { StampKind } from "../outcomes";
import { revealTimeline } from "../reveal-timeline";

/**
 * Pure cue builders for SlopLash's big moments. Each returns the cue list for
 * `useMoment` and `beat`, where `beat[name]` is that cue's index + 1, so
 * renderers gate on `moment >= beat.verdict` and never on raw milliseconds
 * (cue lists vary by outcome). A name with no cue is `Infinity`: never reached.
 *
 * The stage and the phone build separate lists from the same timings: stage
 * lists carry sound, shake, flash, stage confetti and ambient pulses; phone
 * lists carry only haptics and "personal" confetti.
 */

export interface Built<N extends string> {
  cues: MomentCue[];
  beat: Record<N, number>;
}

type Named<N extends string> = MomentCue & { name: N };

function build<N extends string>(
  names: readonly N[],
  list: readonly (Named<N> | false | null | undefined)[],
): Built<N> {
  const present = list
    .filter((cue): cue is Named<N> => !!cue)
    .map((cue, index) => ({ cue, index }))
    .toSorted((a, b) => a.cue.at - b.cue.at || a.index - b.index)
    .map(({ cue }) => cue);
  const beat = Object.fromEntries(names.map((name) => [name, Number.POSITIVE_INFINITY])) as Record<
    N,
    number
  >;
  present.forEach((cue, index) => {
    beat[cue.name] = index + 1;
  });
  return { cues: present.map(({ name: _name, ...cue }) => cue), beat };
}

// --- VOTING intro (stage) ---

const INTRO = ["prompt", "glide", "cardA", "cardB", "band"] as const;
export type IntroBeat = (typeof INTRO)[number];

/** The prompt alone, then it glides up and the two answers deal in. */
export function introCues(): Built<IntroBeat> {
  return build(INTRO, [
    { name: "prompt", at: 0, sound: "prompt-advance" },
    { name: "glide", at: 800 },
    { name: "cardA", at: 1000 },
    { name: "cardB", at: 1250 },
    { name: "band", at: 1500 },
  ]);
}

// --- Contested reveal ---

type FlightBeat = `flight${number}`;
const REVEAL = ["chips", "collapse", "verdict", "unmask", "stamp", "impact", "reactions"] as const;
export type RevealBeat = (typeof REVEAL)[number] | FlightBeat;

export interface RevealSpec {
  /** Votes naming one of the two answers. */
  cast: number;
  outcome: "win" | "tie" | "noVotes";
  stamp: StampKind | null;
  /** The winner is an AI. */
  aiWon: boolean;
  /** The winning card (the centre for a tie or no votes). */
  winnerOrigin?: MomentOrigin;
}

const flightNames = (cast: number) =>
  Array.from({ length: cast }, (_, i) => `flight${i}` as FlightBeat);

/** The stage's reveal: votes fly, the verdict lands, names unmask, a stamp slams. */
export function revealCues(spec: RevealSpec): Built<RevealBeat> {
  const t = revealTimeline(spec.cast, spec.stamp !== null);
  const win = spec.outcome === "win";
  const impact: Partial<MomentCue> =
    spec.stamp === "slopped"
      ? {
          shake: ACCENT.sloplash.shake,
          flash: "fail",
          confetti: "slopped",
          ambient: "slop",
          origin: spec.winnerOrigin,
        }
      : spec.stamp === "flawless"
        ? { flash: "win", confetti: "flawless", ambient: "cheer", origin: spec.winnerOrigin }
        : {};
  return build<RevealBeat>(
    [...REVEAL, ...flightNames(spec.cast)],
    [
      { name: "chips", at: 0, sound: "vote-reveal" },
      { name: "collapse", at: 450 },
      ...t.flights.map(
        (at, i): Named<RevealBeat> => ({ name: `flight${i}`, at, sound: "vote-cast" }),
      ),
      { name: "verdict", at: t.verdict, ...(win ? { sound: "winner-reveal" as const } : {}) },
      {
        name: "unmask",
        at: t.unmask,
        ambient: win ? (spec.aiWon ? "slop" : "cheer") : "chill",
        origin: win ? spec.winnerOrigin : undefined,
      },
      t.stamp !== null && { name: "stamp", at: t.stamp },
      t.impact !== null && { name: "impact", at: t.impact, sound: "stamp-slam", ...impact },
      { name: "reactions", at: t.reactions },
    ],
  );
}

/** How the reveal lands on one phone. */
export type RevealRole =
  | { kind: "voter"; result: "won" | "lost" | "tie" | "none" }
  | { kind: "author"; result: "won" | "flawless" | "slopped" | "lost" | "tie" | "noVotes" }
  | { kind: "none" };

const PHONE_REVEAL = ["verdict", "unmask", "stamp", "impact"] as const;
export type PhoneRevealBeat = (typeof PHONE_REVEAL)[number];

/** The same reveal on a phone: haptics on this viewer's beats only. */
export function phoneRevealCues(
  cast: number,
  stamp: StampKind | null,
  role: RevealRole,
): Built<PhoneRevealBeat> {
  const t = revealTimeline(cast, stamp !== null);
  const author = role.kind === "author" ? role.result : null;
  const unmaskHaptic =
    author === "won" || author === "flawless" ? [20, 60, 30] : author === "tie" ? 15 : undefined;
  const impactHaptic = author === "flawless" ? 30 : author === "slopped" ? 60 : undefined;
  return build(PHONE_REVEAL, [
    {
      name: "verdict",
      at: t.verdict,
      ...(role.kind === "voter" && role.result === "won" ? { haptic: 15 } : {}),
    },
    { name: "unmask", at: t.unmask, ...(unmaskHaptic ? { haptic: unmaskHaptic } : {}) },
    t.stamp !== null && { name: "stamp", at: t.stamp },
    t.impact !== null && {
      name: "impact",
      at: t.impact,
      ...(impactHaptic ? { haptic: impactHaptic } : {}),
    },
  ]);
}

// --- Walkover ---

const WALKOVER = ["prompt", "sag", "band", "count"] as const;
export type WalkoverBeat = (typeof WALKOVER)[number];

/** Walkover beats the stage and the phone share. */
const WALKOVER_AT = { band: 1600, count: 2200 } as const;

/** A one-sided matchup: smaller than a win on purpose. No crown, stamp or confetti. */
export function walkoverCues(): Built<WalkoverBeat> {
  return build(WALKOVER, [
    { name: "prompt", at: 0, sound: "prompt-advance" },
    { name: "sag", at: 1200 },
    { name: "band", at: WALKOVER_AT.band, sound: "vote-reveal", ambient: "chill" },
    { name: "count", at: WALKOVER_AT.count },
  ]);
}

export function phoneWalkoverCues(winner: boolean): Built<"band" | "count"> {
  return build(
    ["band", "count"],
    [
      { name: "band", at: WALKOVER_AT.band, ...(winner ? { haptic: 15 } : {}) },
      { name: "count", at: WALKOVER_AT.count },
    ],
  );
}

// --- Round results ---

const RESULTS = ["rows", "gains", "count", "resort", "crown", "bubble", "footer"] as const;
export type ResultsBeat = (typeof RESULTS)[number];

/** Results beats the stage and the phone share: gains pop, rows re-sort, the leader is crowned. */
const RESULTS_AT = { gains: 900, resort: 2500, crown: 3200 } as const;

export function resultsCues(spec: {
  hasTagline: boolean;
  /** The leader (a sole leader, or the first row of a tie) is an AI. */
  aiLeader: boolean;
  leaderOrigin?: MomentOrigin;
}): Built<ResultsBeat> {
  return build(RESULTS, [
    { name: "rows", at: 0 },
    { name: "gains", at: RESULTS_AT.gains },
    { name: "count", at: 1400 },
    { name: "resort", at: RESULTS_AT.resort, sound: "prompt-advance" },
    {
      name: "crown",
      at: RESULTS_AT.crown,
      sound: "winner-reveal",
      ambient: spec.aiLeader ? "slop" : "cheer",
      origin: spec.leaderOrigin,
    },
    spec.hasTagline && { name: "bubble", at: 3900, sound: "chat-receive" },
    { name: "footer", at: 4500 },
  ]);
}

export function phoneResultsCues(spec: {
  improved: boolean;
  leader: boolean;
}): Built<"gain" | "ordinal" | "crown"> {
  return build(
    ["gain", "ordinal", "crown"],
    [
      { name: "gain", at: RESULTS_AT.gains },
      { name: "ordinal", at: RESULTS_AT.resort, ...(spec.improved ? { haptic: 15 } : {}) },
      { name: "crown", at: RESULTS_AT.crown, ...(spec.leader ? { haptic: [20, 60, 30] } : {}) },
    ],
  );
}

// --- The finale ---

/** When each podium rank appears: third, second, then a silent drumroll before first. */
export const COLUMN_AT = { 1: 3800, 2: 2200, 3: 1200 } as const;
/** First place's crown (or SLOPPED stamp), and a winner's phone celebrating with it. */
const FINAL_CROWN_AT = 4100;
export const PAGE_TWO_AT = 9000;
export const AWARD_AT = (index: number) => 9500 + index * 2600;

type AwardBeat = `award${number}`;
const FINAL = [
  "headline",
  "col3",
  "col2",
  "col1",
  "crown",
  "stamp",
  "impact",
  "tagline",
  "page2",
  "row",
] as const;
export type FinalBeat = (typeof FINAL)[number] | AwardBeat;

export function finalCues(spec: {
  /** The podium ranks that have a column (1, 2, 3). */
  ranks: readonly number[];
  soleAiWinner: boolean;
  hasTagline: boolean;
  /** Award kinds in display order. */
  awards: readonly string[];
  firstOrigin?: MomentOrigin;
}): Built<FinalBeat> {
  const has = (rank: number) => spec.ranks.includes(rank);
  const awardNames = spec.awards.map((_, i) => `award${i}` as AwardBeat);
  return build<FinalBeat>(
    [...FINAL, ...awardNames],
    [
      { name: "headline", at: 0, sound: "game-over" },
      has(3) && { name: "col3", at: COLUMN_AT[3], sound: "vote-reveal" },
      has(2) && { name: "col2", at: COLUMN_AT[2], sound: "vote-reveal" },
      { name: "col1", at: COLUMN_AT[1], sound: "winner-reveal" },
      spec.soleAiWinner
        ? { name: "stamp", at: FINAL_CROWN_AT }
        : {
            name: "crown",
            at: FINAL_CROWN_AT,
            sound: "celebration",
            confetti: "final",
            flash: "gold",
            ambient: { kind: "cheer", strength: 1 },
            origin: spec.firstOrigin,
          },
      spec.soleAiWinner && {
        name: "impact",
        at: 4270,
        sound: "stamp-slam",
        shake: ACCENT.sloplash.shake,
        confetti: "slopped",
        flash: "fail",
        ambient: "slop",
        origin: spec.firstOrigin,
      },
      spec.hasTagline && { name: "tagline", at: 5000, sound: "chat-receive" },
      { name: "page2", at: PAGE_TWO_AT },
      ...spec.awards.map(
        (kind, i): Named<FinalBeat> => ({
          name: `award${i}`,
          at: AWARD_AT(i),
          sound: "prompt-advance",
          ...(kind === "slopped" ? { ambient: "slop" as const } : {}),
          ...(kind === "mvp" ? { ambient: "cheer" as const, flash: "gold" as const } : {}),
        }),
      ),
      spec.awards.length > 0 && { name: "row", at: AWARD_AT(spec.awards.length) },
    ],
  );
}

export function phoneFinalCues(spec: {
  /** This viewer's placement beat (their column's, or first place's when off the podium). */
  at: number;
  /** This viewer is rank 1 and a crown (not a SLOPPED stamp) lands. */
  wins: boolean;
  /** Where this viewer's award sits in the reel, or -1. */
  award: number;
}): Built<"card" | "win" | "award"> {
  return build(
    ["card", "win", "award"],
    [
      { name: "card", at: spec.at, haptic: 15 },
      spec.wins && {
        name: "win",
        at: FINAL_CROWN_AT,
        confetti: "personal",
        haptic: [40, 60, 40, 60, 120],
      },
      spec.award >= 0 && { name: "award", at: AWARD_AT(spec.award), haptic: [20, 60, 30] },
    ],
  );
}
