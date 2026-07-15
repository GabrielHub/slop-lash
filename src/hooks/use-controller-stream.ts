"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexRoomPresence } from "./use-convex-room-presence";
import { useConvexRoomSession } from "./use-convex-room-session";
import { useGameRuntime } from "./use-game-runtime";

export function useControllerStream(code: string) {
  const runtime = useGameRuntime(code);
  const roomSession = useConvexRoomSession(code);
  const convexCapability = roomSession
    ? (roomSession.playerCapability ?? roomSession.hostCapability)
    : null;
  useConvexRoomPresence({
    capability: runtime ? null : convexCapability,
  });
  const convexState = useQuery(
    api.gameViews.controller,
    !runtime && convexCapability ? { capability: convexCapability } : "skip",
  );

  return {
    gameState: runtime?.controllerState ?? convexState,
    error: runtime?.error ?? null,
  };
}
