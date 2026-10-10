// What the stage needs from the room, as one small value: the phase, the
// arena to stand in, tonight's arena order (for preloading) and the clock
// offset. The live stage derives it from the room view; the dev route builds
// it by hand. Reading the SlopFight mode view is defensive on purpose: the
// view grows as the Backend workstream lands, and the stage must keep
// rendering (in the default arena) whatever shape it has today.

import { ARENA_IDS, type ArenaId } from "../arenas";

export const STAGE_PHASES = [
  "LOBBY",
  "BUILD",
  "FOUNDRY",
  "ROSTER",
  "FACE_OFF",
  "FIGHT",
  "RESULT",
  "STANDINGS",
  "UPGRADE",
  "FINISHED",
] as const;
export type StagePhase = (typeof STAGE_PHASES)[number];

export const DEFAULT_ARENA: ArenaId = "FLOODED_GARAGE";

export interface StageInput {
  phase: StagePhase;
  /** Changes on every phase change (phase, round, step, generation); scenes key on it. */
  phaseKey: string;
  arena: ArenaId;
  /** Tonight's arenas in order (preloaded); just the current one when unknown. */
  arenaOrder: readonly ArenaId[];
  round: number;
  step: number;
  roomCode: string | null;
  /** How far the server clock is ahead of this device. */
  clockOffsetMs: number;
  /** Server time the phase started, when known. */
  phaseStartedAt: number | null;
  /** A live room (sounds, effects); false for recaps and dev. */
  live: boolean;
}

export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === "string" && (ARENA_IDS as readonly string[]).includes(value);
}

export function toStagePhase(status: string, phase: string): StagePhase {
  if (status === "LOBBY") return "LOBBY";
  if (status === "FINISHED") return "FINISHED";
  return (STAGE_PHASES as readonly string[]).includes(phase) ? (phase as StagePhase) : "BUILD";
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : null;

/**
 * The arena for this moment of the game: the current fight's arena, else the
 * round's arena, else the first of tonight's arenas, else the default.
 */
export function arenaFromModeView(mode: unknown, round: number): { arena: ArenaId; order: ArenaId[] } {
  const view = asObject(mode);
  const order = Array.isArray(view?.arenas) ? view.arenas.filter(isArenaId) : [];
  const fights = Array.isArray(view?.fights) ? view.fights.map(asObject) : [];
  const current = view?.currentFightId ? fights.find((fight) => fight?.id === view.currentFightId) : null;
  const candidates: unknown[] = [
    current?.arena,
    asObject(view?.currentFight)?.arena,
    asObject(view?.fight)?.arena,
    view?.arena,
    order[Math.max(0, round - 1)],
    order[0],
  ];
  const arena = candidates.find(isArenaId) ?? DEFAULT_ARENA;
  return { arena, order: order.length > 0 ? order : [arena] };
}

export interface RoomLike {
  room: {
    code: string;
    status: string;
    phase: string;
    step: number;
    round: number;
    phaseGeneration: number;
    phaseStartedAt?: number | null;
  };
  mode: unknown;
}

export function stageInputFromView(view: RoomLike, clockOffsetMs: number, live: boolean): StageInput {
  const { room } = view;
  const phase = toStagePhase(room.status, room.phase);
  const { arena, order } = arenaFromModeView(view.mode, room.round);
  return {
    phase,
    phaseKey: `${phase}:${room.round}:${room.step}:${room.phaseGeneration}`,
    arena,
    arenaOrder: order,
    round: room.round,
    step: room.step,
    roomCode: room.code,
    clockOffsetMs,
    phaseStartedAt: room.phaseStartedAt ?? null,
    live,
  };
}

/** A stage input outside any room (dev route, the creature gallery). */
export function standaloneStageInput(overrides: Partial<StageInput> = {}): StageInput {
  const phase = overrides.phase ?? "LOBBY";
  const arena = overrides.arena ?? DEFAULT_ARENA;
  return {
    phase,
    phaseKey: overrides.phaseKey ?? `${phase}:dev`,
    arena,
    arenaOrder: overrides.arenaOrder ?? [arena],
    round: overrides.round ?? 1,
    step: overrides.step ?? 0,
    roomCode: overrides.roomCode ?? null,
    clockOffsetMs: overrides.clockOffsetMs ?? 0,
    phaseStartedAt: overrides.phaseStartedAt ?? null,
    live: overrides.live ?? false,
  };
}
