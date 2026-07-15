"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getConvexRoomSessionSnapshot,
  normalizeConvexRoomCode,
  subscribeConvexRoomSession,
  type ConvexRoomSession,
  type ConvexRoomSessionListener,
} from "../lib/convex-room-session";
import { useGameRuntime } from "./use-game-runtime";

const getServerSnapshot = (): null => null;

export function useConvexRoomSession(roomCode: string): ConvexRoomSession | null {
  const runtime = useGameRuntime(roomCode);
  const normalizedRoomCode = normalizeConvexRoomCode(roomCode);
  const subscribe = useCallback(
    (listener: ConvexRoomSessionListener) =>
      subscribeConvexRoomSession(normalizedRoomCode, listener),
    [normalizedRoomCode],
  );
  const getSnapshot = useCallback(
    () => getConvexRoomSessionSnapshot(normalizedRoomCode),
    [normalizedRoomCode],
  );

  const storedSession = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return runtime?.session ?? storedSession;
}
