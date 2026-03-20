"use client";

import { useCallback } from "react";
import type { ControllerGameState } from "@/lib/controller-types";
import { useStateStream } from "./use-state-stream";

export function useControllerStream(code: string, playerToken: string | null) {
  const createUrl = useCallback(
    (currentCode: string) => {
      const params = new URLSearchParams();
      if (playerToken) params.set("playerToken", playerToken);
      const query = params.toString();
      return `/api/games/${currentCode}/controller/stream${query ? `?${query}` : ""}`;
    },
    [playerToken],
  );

  const { state, error, refresh } = useStateStream<ControllerGameState>({
    code,
    createUrl,
  });

  return { gameState: state, error, refresh };
}
