// The scoreboard's rows (pure): who is where now, where they stood before the
// round that just finished (the rows slide from there), and each owner's
// points before and after that round (the points count up). Ranks come from
// the view's standings (record order, as the Final is seeded); points are
// the owners' room scores (house champions have none).

import { clamp01, easeInOutCubic } from "../ui3d/motion";
import type { BoardSpan } from "./board-visibility";
import { fighterPoints, standingsRows, type SceneData, type SceneFighter } from "./scene-data";

export interface BoardRow {
  fighter: SceneFighter;
  rank: number;
  wins: number;
  losses: number;
  /** The row it starts in (its place before the round). */
  from: number;
  /** The owner's points before the round and now (null for a house champion). */
  pointsBefore: number | null;
  points: number | null;
}

/**
 * Board rows best first. `round` is the round whose results are being shown
 * (its fights are taken back out to find the order and points before it);
 * pass 0 to show the board settled.
 */
export function boardRows(data: SceneData, round: number): BoardRow[] {
  const rows = standingsRows(data);
  const roundFights = round > 0 ? data.mode.fights.filter((fight) => fight.round === round && fight.outcome) : [];
  // Each owner's points from this round's fights.
  const earned = new Map<string, number>();
  for (const fight of roundFights) {
    for (const award of fight.awards ?? []) earned.set(award.playerId, (earned.get(award.playerId) ?? 0) + award.points);
  }
  // Records before this round.
  const before = new Map(rows.map(({ fighter }) => [fighter.id, { wins: fighter.record.wins, losses: fighter.record.losses }]));
  for (const fight of roundFights) {
    const winner = fight.outcome?.winner === "A" ? fight.a : fight.b;
    const loser = winner === fight.a ? fight.b : fight.a;
    const w = before.get(winner);
    const l = before.get(loser);
    if (w) w.wins = Math.max(0, w.wins - 1);
    if (l) l.losses = Math.max(0, l.losses - 1);
  }
  const previous = [...rows].sort((p, q) => {
    const a = before.get(p.fighter.id)!;
    const b = before.get(q.fighter.id)!;
    return b.wins - a.wins || a.losses - b.losses || p.fighter.slot - q.fighter.slot;
  });
  return rows.map(({ fighter, rank }) => {
    const points = fighterPoints(fighter, data.players);
    const gained = fighter.ownerId ? (earned.get(fighter.ownerId) ?? 0) : 0;
    return {
      fighter,
      rank,
      wins: fighter.record.wins,
      losses: fighter.record.losses,
      from: Math.max(0, previous.findIndex((row) => row.fighter.id === fighter.id)),
      pointsBefore: points === null ? null : Math.max(0, points - gained),
      points,
    };
  });
}

/** Seconds into the scene the rows start sliding, how long a slide takes, then the count-up. */
export const BOARD_SLIDE_AT_S = 1.5;
export const BOARD_SLIDE_S = 0.9;
export const BOARD_COUNT_AT_S = 2.7;
export const BOARD_COUNT_S = 1.8;
/** Every row has settled and counted by this time. */
export const BOARD_DONE_S = BOARD_COUNT_AT_S + BOARD_COUNT_S + 0.5;

/** The slide progress (0..1) of the row now at `index`. */
export function boardSlide(index: number, t: number): number {
  return easeInOutCubic((t - BOARD_SLIDE_AT_S - index * 0.08) / BOARD_SLIDE_S);
}

/** A row's place on the board `t` seconds in (fractional while sliding from its old place). */
export function boardRowIndex(row: BoardRow, index: number, t: number): number {
  return row.from + (index - row.from) * boardSlide(index, t);
}

/** A row's points `t` seconds in, counting up from its points before the round. */
export function boardPoints(row: BoardRow, index: number, t: number): number | null {
  if (row.points === null) return null;
  const before = row.pointsBefore ?? row.points;
  const k = clamp01((t - BOARD_COUNT_AT_S - index * 0.12) / BOARD_COUNT_S);
  // Ease out so the last points tick in slowly.
  const e = 1 - (1 - k) ** 2.4;
  return Math.round(before + (row.points - before) * e);
}

/** The leader's champion name, or null when the top two are level (the Voice calls a tie). */
export function standingsLeader(rows: readonly Pick<BoardRow, "fighter" | "wins" | "losses">[]): string | null {
  const [first, second] = rows;
  if (!first?.fighter.champion) return null;
  if (second && second.wins === first.wins && second.losses === first.losses) return null;
  return first.fighter.champion.name;
}

/** "2-1" (a hyphen: the board's font has no en dash glyph in its title set). */
export const recordText = (row: Pick<BoardRow, "wins" | "losses">) => `${row.wins}-${row.losses}`;

/**
 * The text columns inside the visible span: the badge from its left edge,
 * the points at its right edge, W-L at the same relative place as on a fully
 * visible board (68% across).
 */
export function boardColumns(W: number, pad: number, span: BoardSpan) {
  const left = Math.max(-W / 2, span.left);
  const right = Math.min(W / 2, span.right);
  return { left, record: left + (right - left) * 0.68, points: right - pad * 1.6 };
}

/**
 * The shelf spots, left to right (plane space), centred in the shelf's
 * visible span: rank 1 on the left.
 */
export function shelfSpots(span: BoardSpan, count: number): number[] {
  const spacing = Math.min((span.right - span.left) / Math.max(4, count), 1.25);
  const centre = (span.left + span.right) / 2;
  return Array.from({ length: count }, (_, index) => centre + (index - (count - 1) / 2) * spacing);
}
