// What the non-fight scenes read, normalised from the room view plus the
// stage feeds: one SceneFighter per seat (slot order) with its owner's name,
// its streamed parts while forging and its stroke batches. Pure, so tests
// and labs build it the same way.

import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import type { Champion, Part } from "../../sheet";
import type { StrokeBatch } from "../../strokes";
import type { FightRecord } from "../../tournament";
import type { StageFoundryEntry, StageStrokeRow, StageTyping } from "../feeds";

export type SlopfightMode = ModeView<"SLOPFIGHT">;
export type ModeFighter = SlopfightMode["fighters"][number];
export type FighterStatus = ModeFighter["status"];

export interface SceneFighter {
  id: string;
  slot: number;
  ownerId: string | null;
  /** The owner's display name; null for a house champion. */
  ownerName: string | null;
  house: boolean;
  status: FighterStatus;
  inputKind: "DRAW" | "DESCRIBE" | null;
  /** Last keystroke (server ms) while describing (stage.typing). */
  typingAt: number | null;
  champion: Champion | null;
  previous: Champion | null;
  forge: ModeFighter["forge"];
  failure: string | null;
  version: number;
  record: FightRecord;
  /** Streamed parts while FORGING (empty otherwise). */
  partial: readonly Part[];
  /** True when `partial` is synthetic (a fixture or lab without a feed). */
  synthetic: boolean;
  /** This fighter's stroke batches, every layer. */
  strokes: readonly StrokeBatch[];
}

export interface SceneData {
  mode: SlopfightMode;
  fighters: SceneFighter[];
  players: readonly RoomPlayer[];
  /** Round 0 in the lobby; 1..3 after. */
  round: number;
}

/**
 * A synthetic part stream for a FORGING fighter without a feed: the parts it
 * has "streamed" by now. Fixtures pass one (built from dev-feed.ts, which the
 * stage loads lazily so the sample champions stay out of the production
 * chunk); live rooms never do.
 */
export type SyntheticParts = (fighterId: string, forgeStartedAt: number) => readonly Part[];

export interface SceneDataOptions {
  strokes: readonly StageStrokeRow[] | null;
  foundry: readonly StageFoundryEntry[] | null;
  /** Keystroke stamps by fighter id; none: nobody is typing. */
  typing?: StageTyping | null;
  /** Grow FORGING fighters without a feed from this synthetic stream (fixtures); null: never. */
  synthetic: SyntheticParts | null;
}

/** The SlopFight mode view of a room, or null. */
export function slopfightMode(view: RoomView): SlopfightMode | null {
  return view.mode.kind === "SLOPFIGHT" ? (view.mode as SlopfightMode) : null;
}

/** True when a fighter in this view would need a synthetic part stream. */
export function needsSynthetic(view: RoomView, foundry: readonly StageFoundryEntry[] | null): boolean {
  if (foundry) return false;
  const mode = slopfightMode(view);
  return !!mode && mode.fighters.some((fighter) => fighter.status === "FORGING");
}

export function buildSceneData(view: RoomView, options: SceneDataOptions): SceneData | null {
  const mode = slopfightMode(view);
  if (!mode) return null;
  const names = new Map(view.players.map((player) => [player.id, player.name]));
  const bySlot = [...mode.fighters].sort((a, b) => a.slot - b.slot);
  const fighters = bySlot.map((fighter): SceneFighter => {
    const entry = options.foundry?.find((candidate) => candidate.id === fighter.id) ?? null;
    let partial: readonly Part[] = [];
    let synthetic = false;
    if (fighter.status === "FORGING") {
      if (entry) {
        partial = entry.partial;
      } else if (options.synthetic && fighter.forge) {
        // An upgrade grows into a sample too: the fixture has no new sheet yet.
        partial = options.synthetic(fighter.id, fighter.forge.startedAt);
        synthetic = true;
      }
    }
    return {
      id: fighter.id,
      slot: fighter.slot,
      ownerId: fighter.ownerId,
      ownerName: fighter.ownerId ? (names.get(fighter.ownerId) ?? "Player") : null,
      house: fighter.ownerId === null,
      status: fighter.status,
      inputKind: fighter.inputKind,
      typingAt: options.typing?.[fighter.id] ?? null,
      champion: fighter.champion as Champion | null,
      previous: (fighter.previous ?? null) as Champion | null,
      forge: fighter.forge,
      failure: fighter.failure,
      version: fighter.version,
      record: fighter.record,
      partial,
      synthetic,
      strokes: (options.strokes ?? []).filter((row) => row.fighterId === fighter.id),
    };
  });
  return { mode, fighters, players: view.players, round: mode.round };
}

/** A fighter's champion name, else its owner's, else "House champion". */
export function fighterLabel(fighter: SceneFighter): string {
  return fighter.champion?.name ?? (fighter.ownerName ? `${fighter.ownerName}'s champion` : "House champion");
}

/** Points per fighter: its owner's score (house champions score nothing). */
export function fighterPoints(fighter: SceneFighter, players: readonly RoomPlayer[]): number | null {
  if (!fighter.ownerId) return null;
  return players.find((player) => player.id === fighter.ownerId)?.score ?? 0;
}

/** Standings rows best first: the view's order, falling back to slot order. */
export function standingsRows(data: SceneData): { fighter: SceneFighter; rank: number }[] {
  const { standings } = data.mode;
  if (standings.length === 0) return data.fighters.map((fighter, index) => ({ fighter, rank: index + 1 }));
  const rows: { fighter: SceneFighter; rank: number }[] = [];
  for (const entry of standings) {
    const fighter = data.fighters.find((candidate) => candidate.id === entry.fighterId);
    if (fighter) rows.push({ fighter, rank: entry.rank });
  }
  return rows;
}

/** The podium's places, winner first (winner, runner-up, third, fourth), from the view's podium. */
export function podiumFighters(data: SceneData): (SceneFighter | null)[] {
  const podium = data.mode.podium;
  if (!podium) return [];
  return podium.map((id) => data.fighters.find((fighter) => fighter.id === id) ?? null);
}
