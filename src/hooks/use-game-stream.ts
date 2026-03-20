"use client";

import { useCallback } from "react";
import type { GameState } from "@/lib/types";
import { shouldKeepGameStreamAlive } from "@/lib/game-stream-lifecycle";
import { useStateStream } from "./use-state-stream";

export function useGameStream(
  code: string,
  playerToken: string | null,
  hostControlToken: string | null,
  viewMode: "game" | "stage",
) {
  const createUrl = useCallback(
    (currentCode: string) => {
      const params = new URLSearchParams();
      if (playerToken) params.set("playerToken", playerToken);
      if (hostControlToken && viewMode === "stage") params.set("hostToken", hostControlToken);
      const query = params.toString();
      return `/api/games/${currentCode}/stream${query ? `?${query}` : ""}`;
    },
    [hostControlToken, playerToken, viewMode],
  );

  const { state, error, refresh } = useStateStream<GameState>({
    code,
    transitionUpdates: true,
    shouldReconnect: shouldKeepGameStreamAlive,
    createUrl,
  });

  return { gameState: state, error, refresh };
}
