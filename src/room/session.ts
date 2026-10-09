import { useSyncExternalStore } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { GAME_TYPES, type GameType } from "@/games/core/types";

/**
 * What a browser keeps to get back into a room. Each tab pins the seat it
 * joined with (sessionStorage), so a second tab joining the same room never
 * takes over the first; the browser also remembers the latest seat
 * (localStorage), so reopening a closed tab still gets back in.
 */
export type RoomSession = {
  capability: string;
  roomCode: string;
  gameType: GameType;
  playerId: Id<"players"> | null;
};

const STORAGE_PREFIX = "slop-lash:room:";
const listeners = new Set<() => void>();

function storageKey(roomCode: string) {
  return `${STORAGE_PREFIX}${roomCode.trim().toUpperCase()}`;
}

function parse(raw: string | null): RoomSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RoomSession>;
    if (
      typeof value.capability !== "string" ||
      typeof value.roomCode !== "string" ||
      !GAME_TYPES.includes(value.gameType as GameType)
    ) {
      return null;
    }
    return {
      capability: value.capability,
      roomCode: value.roomCode,
      gameType: value.gameType as GameType,
      playerId: typeof value.playerId === "string" ? (value.playerId as Id<"players">) : null,
    };
  } catch {
    return null;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function loadRoomSession(roomCode: string): RoomSession | null {
  try {
    const key = storageKey(roomCode);
    const pinned = parse(window.sessionStorage.getItem(key));
    if (pinned) return pinned;
    const remembered = window.localStorage.getItem(key);
    // A tab that opens on a remembered seat keeps it, whatever other tabs join as later.
    if (parse(remembered)) window.sessionStorage.setItem(key, remembered!);
    return parse(remembered);
  } catch {
    return null;
  }
}

export function saveRoomSession(session: RoomSession): void {
  try {
    const key = storageKey(session.roomCode);
    const value = JSON.stringify(session);
    window.sessionStorage.setItem(key, value);
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or full storage: the room still works until the tab closes.
  }
  cache.delete(session.roomCode.toUpperCase());
  notify();
}

export function clearRoomSession(roomCode: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(roomCode));
    window.localStorage.removeItem(storageKey(roomCode));
  } catch {
    // Nothing stored.
  }
  cache.delete(roomCode.toUpperCase());
  notify();
}

/** Snapshots must be referentially stable between changes for useSyncExternalStore. */
const cache = new Map<string, RoomSession | null>();

function snapshot(roomCode: string): RoomSession | null {
  const key = roomCode.toUpperCase();
  if (!cache.has(key)) cache.set(key, loadRoomSession(key));
  return cache.get(key) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored session for a room. `undefined` until the browser has hydrated. */
export function useStoredRoomSession(roomCode: string): RoomSession | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(roomCode),
    () => undefined,
  );
}

/** Where a fresh session should land: phones get the controller, desktops the full game. */
export function roomPath(session: RoomSession, preferController: boolean): string {
  if (session.playerId === null) return `/stage/${session.roomCode}`;
  return preferController ? `/controller/${session.roomCode}` : `/game/${session.roomCode}`;
}
