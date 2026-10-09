"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvex, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { GameType } from "@/games/core/types";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { useRoomPresence } from "./presence";

export type RoomView = FunctionReturnType<typeof api.views.room>;
export type RoomInfo = RoomView["room"];
export type RoomPlayer = RoomView["players"][number];
export type ModeView<K extends GameType> = Extract<RoomView["mode"], { kind: K }>;

/** Any public mutation that acts as a room seat. */
type RoomMutation = FunctionReference<"mutation", "public", { capability: string }>;
export type RoomArgs<M extends RoomMutation> = Omit<FunctionArgs<M>, "capability">;

/** Calls a room mutation as this screen's seat; the capability is filled in. */
export type RoomRunner = <M extends RoomMutation>(
  mutation: M,
  args: RoomArgs<M>,
) => Promise<FunctionReturnType<M>>;

export interface RoomContextValue {
  view: RoomView;
  /** Null for read-only screens such as recaps. */
  capability: string | null;
  /** How far the server clock is ahead of this device's. */
  clockOffsetMs: number;
  /** A room in progress: sounds, confetti, and narration play. Recaps are not live. */
  live: boolean;
  run: RoomRunner;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoom(): RoomContextValue {
  const room = useContext(RoomContext);
  if (!room) throw new Error("useRoom must be used inside a room");
  return room;
}

/** The current mode's view, narrowed to the game the component was written for. */
export function useModeView<K extends GameType>(kind: K): ModeView<K> {
  const { mode } = useRoom().view;
  if (mode.kind !== kind) throw new Error(`Expected a ${kind} room, got ${mode.kind}`);
  return mode as ModeView<K>;
}

export function usePlayers(): {
  players: RoomPlayer[];
  byId: (id: Id<"players"> | string | null | undefined) => RoomPlayer | undefined;
} {
  const { players } = useRoom().view;
  return useMemo(() => {
    const index = new Map<string, RoomPlayer>(players.map((player) => [player.id, player]));
    return { players, byId: (id) => (id ? index.get(id) : undefined) };
  }, [players]);
}

/** A player's name by id, with a stand-in for seats that are gone. */
export function usePlayerName(): (id: Id<"players"> | string | null | undefined) => string {
  const { byId } = usePlayers();
  return useCallback((id) => byId(id)?.name ?? "Someone", [byId]);
}

/** One interval for every countdown on the page, however many are mounted. */
const CLOCK_TICK_MS = 250;
const clockListeners = new Set<() => void>();
let clockNow = Date.now();
let clockTimer: number | undefined;

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      for (const notify of clockListeners) notify();
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

const readClock = () => clockNow;
/** Nothing ticks on the server, so read the time fresh, whole seconds so hydration agrees. */
const readServerClock = () => Math.floor(Date.now() / 1_000) * 1_000;

/** The server's clock, ticking on this device. */
export function useServerNow(): number {
  const { clockOffsetMs } = useRoom();
  return useSyncExternalStore(subscribeClock, readClock, readServerClock) + clockOffsetMs;
}

/**
 * Runs room mutations with a pending flag and a readable error. An error that
 * arrives after the phase moved on (a vote that lost the race with the timer)
 * is dropped: the screen has already moved on with it.
 */
export function useRoomAction() {
  const { run, view } = useRoom();
  const { phaseGeneration } = view.room;
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ message: string; phaseGeneration: number } | null>(null);

  const act = useCallback(
    async <M extends RoomMutation>(mutation: M, args: RoomArgs<M>): Promise<boolean> => {
      setPending(true);
      setFailure(null);
      try {
        await run(mutation, args);
        return true;
      } catch (cause) {
        setFailure({
          message: getConvexErrorMessage(cause, "Something went wrong"),
          phaseGeneration,
        });
        return false;
      } finally {
        setPending(false);
      }
    },
    [run, phaseGeneration],
  );

  // Errors belong to the phase they happened in.
  const error = failure?.phaseGeneration === phaseGeneration ? failure.message : null;
  return { act, pending, error };
}

const readOnly: RoomRunner = () => Promise.reject(new Error("This screen is read-only"));

/**
 * A room that never changes: a finished game's recap, or a dev fixture. Without
 * a runner, actions fail as read-only.
 */
export function StaticRoomProvider({
  view,
  capability = null,
  clockOffsetMs = 0,
  live = false,
  run = readOnly,
  children,
}: Partial<Omit<RoomContextValue, "view">> & { view: RoomView; children: ReactNode }) {
  const value = useMemo(
    () => ({ view, capability, clockOffsetMs, live, run }),
    [view, capability, clockOffsetMs, live, run],
  );
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

/**
 * A live room. With a capability it shows that seat's view and keeps the seat
 * marked as here; without one it is a spectator watching the shared screen.
 */
export function RoomProvider({
  roomCode,
  capability,
  fallback,
  children,
}: {
  roomCode: string;
  capability: string | null;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const convex = useConvex();
  const seated = useQuery(api.views.room, capability ? { capability } : "skip");
  const watching = useQuery(api.views.watch, capability ? "skip" : { roomCode });
  const view = capability ? seated : watching;
  const clockOffsetMs = useRoomPresence(capability);
  const run = useCallback<RoomRunner>(
    (mutation, args) =>
      capability
        ? convex.mutation(mutation as RoomMutation, { ...args, capability })
        : readOnly(mutation, args),
    [capability, convex],
  );
  const value = useMemo(
    () => (view ? { view, capability, clockOffsetMs, live: true, run } : null),
    [view, capability, clockOffsetMs, run],
  );
  if (!value) return fallback;
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
