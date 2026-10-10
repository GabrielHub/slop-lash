"use client";

// The stage's own data feeds (build plan decision 5): easel strokes and the
// foundry's streamed parts stay out of the room view, so phones drawing at
// 4 Hz and forges streaming parts never resend the view to every client.
//
// - In a live room (`room.live` and a real seat or a watcher, not a fixture)
//   the hooks subscribe to `api.slopfight.stage.strokes` / `.foundry`.
// - Fixtures, the recap and the dev labs never reach the backend: strokes
//   come from the view's `doodles` (fixtures carry them; the recap's view has
//   them once the game is over), and an injected `DevFeed` (DevFeedProvider)
//   wins over everything, so a lab can stream synthetic strokes and growing
//   parts. Without a dev feed, a FORGING fighter in a fixture grows from a
//   synthetic part stream (scenes/dev-feed.ts, loaded on demand by
//   useSceneData so the sample champions stay out of the production chunk).

import { useQuery } from "convex/react";
import { createContext, createElement, useContext, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import { modeOf } from "@/room/context";
import type { Champion, Part } from "../sheet";
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

/** One fighter's forge as it grows (`stage.foundry`). */
export interface StageFoundryEntry {
  id: string;
  slot: number;
  ownerId: string | null;
  status: string;
  forge: { kind: string; version: number; startedAt: number } | null;
  /** The streamed parts so far, while forging. */
  partial: readonly Part[];
  champion: Champion | null;
  previous: Champion | null;
  version: number;
  failure: string | null;
}

/** Synthetic or recorded data for labs and tests; each field wins over the backend when set. */
export interface DevFeed {
  strokes?: readonly StageStrokeRow[] | null;
  foundry?: readonly StageFoundryEntry[] | null;
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

/**
 * Every stroke batch of the game (all fighters, all layers). Live rooms
 * subscribe; elsewhere the view's `doodles` or the dev feed. Null while the
 * first live result is loading, or when there is nothing to read.
 */
export function useStageStrokes(gameNumber?: number): readonly StageStrokeRow[] | null {
  const room = useRoomOrNull();
  const dev = useContext(DevFeedContext);
  const live = useLiveFeeds();
  const code = room?.view.room.code ?? null;
  const rows = useQuery(
    api.slopfight.stage.strokes,
    live && code ? (gameNumber === undefined ? { roomCode: code } : { roomCode: code, gameNumber }) : "skip",
  );
  if (dev?.strokes) return dev.strokes;
  if (live) return (rows as readonly StageStrokeRow[] | undefined) ?? null;
  const mode = room ? modeOf(room.view, "SLOPFIGHT") : null;
  return (mode?.doodles as readonly StageStrokeRow[] | null | undefined) ?? null;
}

/**
 * Each fighter's forge with its streamed parts. Live rooms subscribe; the
 * dev feed wins when it has one; otherwise null (scenes fall back to the
 * view's fighters and, in fixtures, a synthetic part stream).
 */
export function useStageFoundry(): readonly StageFoundryEntry[] | null {
  const room = useRoomOrNull();
  const dev = useContext(DevFeedContext);
  const live = useLiveFeeds();
  const code = room?.view.room.code ?? null;
  const entries = useQuery(api.slopfight.stage.foundry, live && code ? { roomCode: code } : "skip");
  if (dev?.foundry) return dev.foundry;
  if (live) return (entries as readonly StageFoundryEntry[] | undefined) ?? null;
  return null;
}
