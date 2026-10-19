// The face-off's timing and content, as plain functions (unit-tested): the
// walk to the marks under the slam, The Voice's lines in turn, the walk arc
// from the roster mark to the face-off mark, which hazard card to hang, and
// how a matchup note reads.

import { MathUtils, type Vector3, type Vector3Tuple } from "three";
import { ARENAS, type ArenaId, type Hazard } from "../../arenas";
import { formatEffect, MODIFIER_SPECS, type ModifierKey, type Side } from "../../modifiers";
import { scheduleLines, speechMs, type TimedVoiceLine, type VoiceLine } from "../../narration";
import type { Champion } from "../../sheet";
import type { FightRow } from "./feed";

export interface FaceOffPlan {
  /** Seconds from the phase start: each champion's walk to its mark [start, end). */
  walk: Record<Side, [number, number]>;
  /** Both on their marks. */
  standAt: number;
  /** The hazard card; notes follow NOTE_GAP_S apart. */
  cardsAt: number;
  /** The Voice's face-off call; the walk-on lines follow it in turn. */
  callAt: number;
}

export const NOTE_GAP_S = 0.5;
export const SIDE_SWAP_S = 3.4;
/** Silence between The Voice's face-off lines. */
export const FACE_OFF_LINE_GAP_MS = 500;

/**
 * The face-off opens on the slam (the stage's entry for the phase): both
 * champions walk from their roster marks to the fight's spawns together,
 * under it, a step apart, and the cards follow once they stand. The low
 * face-off holds from the first frame.
 */
export const FACE_OFF_PLAN: FaceOffPlan = {
  walk: { A: [0.2, 2.2], B: [0.3, 2.3] },
  standAt: 2.3,
  cardsAt: 2.75,
  callAt: 0.35,
};

/**
 * What The Voice reads at a face-off: both champions' walk-on lines once the
 * matchup has written them (the slam already named the pair, and a call
 * first would push the second walk-on past an early close), else the call.
 * The Final and third place keep their call first: it says what is at stake.
 */
export function faceOffLines(lines: readonly VoiceLine[], stakes: boolean): VoiceLine[] {
  const walkOns = lines.filter((line) => line.beat === "walkOn");
  return walkOns.length === 2 && !stakes ? walkOns : [...lines];
}

/**
 * The face-off's lines laid end to end from `fromMs` (the call first, then
 * each walk-on), skipping lines already placed; `endMs` is where the next
 * line may start.
 */
export function chainFaceOffLines(
  lines: readonly VoiceLine[],
  placed: ReadonlySet<string>,
  fromMs: number,
): { timed: TimedVoiceLine[]; endMs: number } {
  const timed = scheduleLines(
    lines.filter((line) => !placed.has(line.key)),
    fromMs,
    FACE_OFF_LINE_GAP_MS,
  );
  const last = timed.at(-1);
  return { timed, endMs: last ? last.at + speechMs(last.text) + FACE_OFF_LINE_GAP_MS : fromMs };
}

export interface WalkPath {
  from: Vector3Tuple;
  control: Vector3Tuple;
  to: Vector3Tuple;
  /** Seconds from the phase start: walking [start, end]. */
  window: [number, number];
  /** Facing once on the mark (toward the rival). */
  restYaw: number;
}

/** Point and velocity on the walk at `t` seconds (a quadratic arc, eased in and out). */
export function walkAt(walk: WalkPath, t: number, outP: Vector3, outV: Vector3): number {
  const [start, end] = walk.window;
  const span = Math.max(0.1, end - start);
  const u = MathUtils.clamp((t - start) / span, 0, 1);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
  const de = u > 0 && u < 1 ? (0.5 * Math.PI * Math.sin(Math.PI * u)) / span : 0;
  const [ax, , az] = walk.from;
  const [cx, , cz] = walk.control;
  const [bx, , bz] = walk.to;
  const k = 1 - e;
  outP.set(k * k * ax + 2 * k * e * cx + e * e * bx, 0, k * k * az + 2 * k * e * cz + e * e * bz);
  outV.set(2 * k * (cx - ax) + 2 * e * (bx - cx), 0, 2 * k * (cz - az) + 2 * e * (bz - cz)).multiplyScalar(de);
  return u;
}

/** The arena hazard that touches one of these fighters, else the arena's first. */
export function relevantHazard(arena: ArenaId, a: Champion, b: Champion): Hazard | null {
  const hazards = ARENAS[arena].hazards;
  const touches = (champion: Champion, hazard: Hazard) =>
    hazard.rules.some(
      (rule) =>
        ("everyone" in rule.when && rule.when.everyone) ||
        ("trait" in rule.when && champion.traits.includes(rule.when.trait)) ||
        ("bodyPlan" in rule.when && champion.bodyPlan === rule.when.bodyPlan),
    ) ||
    (hazard.dynamic !== null &&
      ARENAS[arena].dynamic.some((dynamic) => {
        if (dynamic.id !== hazard.dynamic) return false;
        const when = dynamic.appliesTo;
        return ("everyone" in when && when.everyone) || ("bodyPlan" in when && champion.bodyPlan === when.bodyPlan) || ("trait" in when && champion.traits.includes(when.trait));
      }));
  return hazards.find((hazard) => touches(a, hazard) || touches(b, hazard)) ?? hazards[0] ?? null;
}

/**
 * A note's value as its card shows it. The applied value can be scaled down
 * by the favour cap (+14.83, +0.17): percents and HP read whole, power points
 * to one decimal, and a scaled-down note never reads as zero.
 */
export function shownNoteValue(key: ModifierKey, value: number): number {
  const kind = MODIFIER_SPECS[key].kind;
  if (kind === "flag" || value === 0) return value;
  const step = kind === "additive" ? 0.1 : 1;
  const rounded = Number((Math.round(value / step) * step).toFixed(1));
  return rounded !== 0 ? rounded : Math.sign(value) * step;
}

/** A note as its card reads: "Leaf blower is useless underwater: Strike -1". */
export function noteLine(note: { reason: string; modifies: ModifierKey; value: number }): string {
  return `${note.reason}: ${formatEffect({ key: note.modifies, value: shownNoteValue(note.modifies, note.value) })}`;
}

// ---------------------------------------------------------------------------
// The card grid and where it hangs on screen
// ---------------------------------------------------------------------------

export const NOTE_W = 0.8;
export const NOTE_H = 0.4;
export const HAZARD_W = 1.2;
export const HAZARD_H = 0.4;
const COLUMN_GAP = 0.14;
const ROW_GAP = 0.1;
const HAZARD_GAP = 0.14;

/** The cards in their own (camera-facing) frame: the hazard card's centre at the origin, the notes in rows of two above it, the first ones on top. */
export interface CardGrid {
  notes: Vector3Tuple[];
  /** The "Voice is thinking" card: the lowest note row. */
  thinking: Vector3Tuple;
  hazard: Vector3Tuple;
  width: number;
  height: number;
  /** The grid's vertical middle above the origin. */
  centreY: number;
}

export function cardGrid(noteCount: number): CardGrid {
  const count = Math.min(4, Math.max(0, noteCount));
  const rows = Math.max(1, Math.ceil(count / 2));
  const rowY = (fromBottom: number) => HAZARD_H / 2 + HAZARD_GAP + NOTE_H / 2 + fromBottom * (NOTE_H + ROW_GAP);
  const notes: Vector3Tuple[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 2);
    const inRow = Math.min(2, count - row * 2);
    const x = inRow === 1 ? 0 : ((index % 2 === 0 ? -1 : 1) * (NOTE_W + COLUMN_GAP)) / 2;
    notes.push([x, rowY(rows - 1 - row), 0]);
  }
  const top = rowY(rows - 1) + NOTE_H / 2;
  const bottom = -HAZARD_H / 2;
  return {
    notes,
    thinking: [0, rowY(0), 0],
    hazard: [0, 0, 0],
    width: count >= 2 ? 2 * NOTE_W + COLUMN_GAP : Math.max(NOTE_W, HAZARD_W),
    height: top - bottom,
    centreY: (top + bottom) / 2,
  };
}

/** The cards' body font advance per character, in ems (measured off a rendered card, a little generous). */
const EM_ADVANCE = 0.6;

/**
 * The largest body size up to `maxSize` at which `text` fits on a Card this
 * size, by ui3d/card's layout: a title band of min(30% of the height, 0.2)
 * on top, the body wrapped at 86% of the width with 1.12 line height in the
 * space under the band. The wrap is estimated word by word.
 */
export function cardBodySize(text: string, width: number, height: number, maxSize: number): number {
  const area = height - Math.min(height * 0.3, 0.2) - 0.072;
  const maxWidth = width * 0.86;
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = maxSize; size > maxSize * 0.55; size *= 0.95) {
    const space = EM_ADVANCE * size;
    let lines = 1;
    let line = 0;
    for (const word of words) {
      const advance = word.length * EM_ADVANCE * size;
      const next = line === 0 ? advance : line + space + advance;
      if (next > maxWidth && line > 0) {
        lines += 1;
        line = advance;
      } else {
        line = next;
      }
    }
    if (lines * 1.12 * size <= area) return size;
  }
  return maxSize * 0.55;
}

/** A fighter on screen: its NDC x span and its distance from the camera. */
export interface ScreenSpan {
  minX: number;
  maxX: number;
  depth: number;
}

/** Which of cardGap's choices a span is. */
export type GapKind = "between" | "beyond" | "tightBetween" | "tightBeyond" | "widened" | "side";

export interface CardGap {
  from: number;
  to: number;
  kind: GapKind;
}

/**
 * The NDC x span the card grid hangs in: on the far side of the nearer
 * fighter (the big one in the foreground of a low face-off shot), between
 * the two fighters when the grid fits there (`needed` wide), else beyond the
 * far fighter, else whichever of those still fits the grid shrunk (`minimum`
 * wide), else between them reaching over the inner part of the near fighter
 * (it is the blurred foreground; up to 45% of it), else that whole side of
 * the frame (the cards then hang in front of the far fighter).
 *
 * `keep` is the choice already on screen: it holds until clearly worse and
 * the others need clearly more room, so a slow push-in cannot flip the grid
 * back and forth across a fighter at a threshold.
 */
export function cardGap(a: ScreenSpan, b: ScreenSpan, needed: number, minimum = needed * 0.7, keep: GapKind | null = null, margin = 0.04): CardGap {
  const near = a.depth <= b.depth ? a : b;
  const far = near === a ? b : a;
  const toRight = (far.minX + far.maxX) / 2 >= (near.minX + near.maxX) / 2;
  const lo = toRight ? near.maxX + margin : -1 + margin;
  const hi = toRight ? 1 - margin : near.minX - margin;
  const between = toRight ? { from: lo, to: Math.min(hi, far.minX - margin) } : { from: Math.max(lo, far.maxX + margin), to: hi };
  const beyond = toRight ? { from: Math.max(lo, far.maxX + margin), to: hi } : { from: lo, to: Math.min(hi, far.minX - margin) };
  const width = (span: { from: number; to: number }) => span.to - span.from;
  const factor = (kind: GapKind) => (keep === null ? 1 : kind === keep ? 0.88 : 1.08);
  if (width(between) >= needed * factor("between")) return { ...between, kind: "between" };
  if (width(beyond) >= needed * factor("beyond")) return { ...beyond, kind: "beyond" };
  // Shrunk: the kept side first, else the roomier.
  const tight: [GapKind, { from: number; to: number }][] = [
    ["tightBetween", between],
    ["tightBeyond", beyond],
  ];
  tight.sort(([ka, a], [kb, b]) => (ka === keep ? -1 : kb === keep ? 1 : width(b) - width(a)));
  for (const [kind, span] of tight) if (width(span) >= minimum * factor(kind)) return { ...span, kind };
  const wanted = minimum * factor("widened");
  const into = Math.max(0, Math.min((near.maxX - near.minX) * 0.45, wanted - width(between)));
  const widened = toRight
    ? { from: Math.max(-1 + margin, between.from - into), to: between.to }
    : { from: between.from, to: Math.min(1 - margin, between.to + into) };
  // Widened by exactly the shortfall, so it is compared with a little slack (float noise flipped it frame to frame).
  if (width(widened) >= wanted - 1e-6) return { ...widened, kind: "widened" };
  return hi - lo > 0.2 ? { from: lo, to: hi, kind: "side" } : { from: -0.5, to: 0.5, kind: "side" };
}

export interface NoteView {
  key: string;
  side: Side;
  line: string;
}

export function notesOf(fight: Pick<FightRow, "applied" | "notes">): NoteView[] {
  if (fight.applied.length > 0) {
    return fight.applied
      .filter((note) => !note.dropped)
      .map((note, index) => ({ key: `${index}:${note.reason}`, side: note.side, line: noteLine(note) }));
  }
  return fight.notes.map((note, index) => ({ key: `${index}:${note.reason}`, side: note.side, line: noteLine(note) }));
}
