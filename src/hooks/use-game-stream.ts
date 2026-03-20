"use client";

import { useCallback } from "react";
import type { GameState } from "@/lib/types";
import { useStateStream } from "./use-state-stream";

function shouldKeepGameStreamAlive(state: GameState | null): boolean {
  if (!state) return true;
  if (state.status !== "FINAL_RESULTS") return true;

  const modeState = state.modeState as Record<string, unknown> | undefined;
  const postMortemGeneration = modeState?.postMortemGeneration as Record<string, unknown> | undefined;
  const status = postMortemGeneration?.status;

  return status === "NOT_REQUESTED" || status === "STREAMING";
}

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
