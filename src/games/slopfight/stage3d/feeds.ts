"use client";

// The stage's own data feeds (build plan decision 5): easel strokes, the
// foundry's streamed parts and the describers' typing stay out of the room
// view, so phones drawing at 4 Hz, forges streaming parts and players typing
// never resend the view to every client.
//
// - In a live room (`room.live` and a real seat or a watcher, not a fixture)
//   the hooks subscribe to `api.slopfight.stage.strokes` (one subscription
//   per fighter, so a batch resends only its drawer's rows), `.forges` and
//   `.typing`. A scene that shows none of it passes `enabled: false` and
//   subscribes to nothing.
// - Fixtures, the recap and the dev labs never reach the backend: strokes
//   come from the view's `doodles` (fixtures carry them; the recap's view has
//   them), and an injected `DevFeed` (DevFeedProvider) wins over everything,
//   so a lab can stream synthetic strokes, growing parts and typing. Without
//   a dev feed, a FORGING fighter in a fixture grows from a synthetic part
//   stream (scenes/dev-feed.ts, loaded on demand by useSceneData so the
//   sample champions stay out of the production chunk).

import { useQuery } from "convex/react";
import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { modeOf } from "@/room/context";
import type { Part } from "../sheet";
import type { Stroke } from "../strokes";
import { useRoomOrNull } from "./ui3d/room";

/** One stroke batch row (`stage.strokes`; the recap's `doodles` rows match without the id). */
export interface StageStrokeRow {
  id?: string;
  fighterId: string;
  layer: number;
  seq: number;
  strokes: readonly Stroke[];
}

/** One fighter's streamed parts while it forges (`stage.forges`). */
export interface StageFoundryEntry {
  id: string;
  partial: readonly Part[];
}

/** Each describer's last keystroke (server ms) by fighter id (`stage.typing`). */
export type StageTyping = Readonly<Record<string, number>>;

/** Synthetic or recorded data for labs and tests; each field wins over the backend when set. */
export interface DevFeed {
  strokes?: readonly StageStrokeRow[] | null;
  foundry?: readonly StageFoundryEntry[] | null;
  typing?: StageTyping | null;
}

const DevFeedContext = createContext<DevFeed | null>(null);

/** Inject a dev feed (labs, tests). Works inside or outside the canvas (context is bridged). */
export function DevFeedProvider({ feed, children }: { feed: DevFeed; children?: ReactNode }) {
  return createElement(DevFeedContext.Provider, { value: feed }, children);
}

/** The injected dev feed, or null. */
export function useDevFeed(): DevFeed | null {
  return useContext(DevFeedContext);
}

/** True when the stage may subscribe to the backend (a live room, not a fixture). */
export function useLiveFeeds(): boolean {
  const room = useRoomOrNull();
  const dev = useContext(DevFeedContext);
  return !dev && !!room && room.live && room.capability !== "fixture";
}

/** The room code to subscribe with, or null when this stage must not subscribe. */
function useFeedCode(enabled: boolean): string | null {
  const room = useRoomOrNull();
  const live = useLiveFeeds();
  return enabled && live ? (room?.view.room.code ?? null) : null;
}

/** The room's fighters by seat (slot order); a SlopFight game always seats four. */
function useSeats() {
  const room = useRoomOrNull();
  const mode = room ? modeOf(room.view, "SLOPFIGHT") : null;
  return mode ? [...mode.fighters].sort((a, b) => a.slot - b.slot) : [];
}

function useFighterStrokes(code: string | null, fighterId: Id<"slopFightFighters"> | undefined) {
  return useQuery(api.slopfight.stage.strokes, code && fighterId ? { roomCode: code, fighterId } : "skip");
}

/**
 * Every stroke batch of the game (all fighters, all layers). Live rooms
 * subscribe per fighter; elsewhere the view's `doodles` or the dev feed. Null
 * while no live result has loaded, or when there is nothing to read.
 */
export function useStageStrokes(enabled = true): readonly StageStrokeRow[] | null {
  const room = useRoomOrNull();
  const dev = useContext(DevFeedContext);
  const code = useFeedCode(enabled);
  const seats = useSeats();
  // One hook per seat, in a fixed order (CHAMPIONS is 4).
  const first = useFighterStrokes(code, seats[0]?.id);
  const second = useFighterStrokes(code, seats[1]?.id);
  const third = useFighterStrokes(code, seats[2]?.id);
  const fourth = useFighterStrokes(code, seats[3]?.id);
  const live = useMemo(() => {
    const loaded = [first, second, third, fourth].filter((rows) => rows !== undefined);
    return loaded.length === 0 ? null : (loaded.flat() as readonly StageStrokeRow[]);
  }, [first, second, third, fourth]);
  if (dev?.strokes) return dev.strokes;
  if (code) return live;
  if (!enabled) return null;
  const mode = room ? modeOf(room.view, "SLOPFIGHT") : null;
  return (mode?.doodles as readonly StageStrokeRow[] | null | undefined) ?? null;
}

/**
 * Each forging fighter's streamed parts. Live rooms subscribe; the dev feed
 * wins when it has one; otherwise null (scenes fall back to the view's
 * fighters and, in fixtures, a synthetic part stream).
 */
export function useStageFoundry(enabled = true): readonly StageFoundryEntry[] | null {
  const dev = useContext(DevFeedContext);
  const code = useFeedCode(enabled);
  const streams = useQuery(api.slopfight.stage.forges, code ? { roomCode: code } : "skip");
  const live = useMemo(
    () => streams?.map((stream): StageFoundryEntry => ({ id: stream.fighterId, partial: stream.parts })) ?? null,
    [streams],
  );
  if (dev?.foundry) return dev.foundry;
  return code ? live : null;
}

/** Each describer's last keystroke. Live rooms subscribe; the dev feed wins; otherwise null. */
export function useStageTyping(enabled = true): StageTyping | null {
  const dev = useContext(DevFeedContext);
  const code = useFeedCode(enabled);
  const rows = useQuery(api.slopfight.stage.typing, code ? { roomCode: code } : "skip");
  const live = useMemo(
    () => (rows ? Object.fromEntries(rows.map((row) => [row.fighterId, row.at])) : null),
    [rows],
  );
  if (dev?.typing) return dev.typing;
  return code ? live : null;
}
