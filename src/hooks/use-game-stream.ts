"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexRoomPresence } from "./use-convex-room-presence";
import { useConvexRoomSession } from "./use-convex-room-session";
import { useGameRuntime } from "./use-game-runtime";

export function useGameStream(code: string, viewMode: "game" | "stage") {
  const runtime = useGameRuntime(code);
  const roomSession = useConvexRoomSession(code);
  const convexCapability = roomSession
    ? viewMode === "stage"
      ? (roomSession.hostCapability ?? roomSession.playerCapability)
      : (roomSession.playerCapability ?? roomSession.hostCapability)
    : null;
  useConvexRoomPresence({
    capability: runtime ? null : convexCapability,
  });
  const convexState = useQuery(
    api.gameViews.stage,
    !runtime && convexCapability ? { capability: convexCapability } : "skip",
  );

  return {
    gameState: runtime?.gameState ?? convexState,
    error: runtime?.error ?? null,
  };
}
