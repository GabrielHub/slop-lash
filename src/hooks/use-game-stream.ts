"use client";

import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import type { GameState } from "@/lib/types";

/**
 * SSE-based game state hook. Replaces useGamePoller when NEXT_PUBLIC_USE_SSE=1.
 *
 * Connects to GET /api/games/[code]/stream and listens for:
 *   - `state`  – full game state payload
 *   - `server-error` – { code, message }
 *   - `done`   – game reached FINAL_RESULTS, stream ends
 */
export function useGameStream(
  code: string,
  playerId: string | null,
  hostControlToken: string | null,
  viewMode: "game" | "stage",
) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const statusRef = useRef<string | null>(null);
  const errorRef = useRef(false);
  const retriesRef = useRef(0);

  useEffect(() => {
    // Guard: don't connect when code is empty (hook is inactive)
    if (!code) return;

    let cancelled = false;
    statusRef.current = null;
    errorRef.current = false;
    retriesRef.current = 0;

    function connect() {
      if (cancelled) return;

      const params = new URLSearchParams();
      if (playerId) params.set("playerId", playerId);
      if (hostControlToken && viewMode === "stage") params.set("hostToken", hostControlToken);
      const qs = params.toString();
      const url = `/api/games/${code}/stream${qs ? `?${qs}` : ""}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("state", (e) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(e.data) as GameState;
          statusRef.current = data.status;
          retriesRef.current = 0;
          startTransition(() => {
            setGameState(data);
          });
        } catch {
          // malformed data, ignore
        }
      });

      es.addEventListener("server-error", (e) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(e.data) as { code: string; message: string };
          if (payload.code === "NOT_FOUND") {
            errorRef.current = true;
            setError("Game not found");
            es.close();
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener("done", () => {
        if (cancelled) return;
        es.close();
      });

      es.onerror = () => {
        if (cancelled) return;
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          esRef.current = null;
          if (statusRef.current === "FINAL_RESULTS" || errorRef.current) return;
          // Exponential backoff: 2s, 4s, 8s, 16s, capped at 30s
          const delay = Math.min(2000 * 2 ** retriesRef.current, 30_000);
          retriesRef.current++;
          setTimeout(() => {
            if (!cancelled) connect();
          }, delay);
        }
      };
    }

    connect();

    // Visibility handling: close stream when hidden (non-stage), reconnect when visible
    function onVisibilityChange() {
      if (viewMode === "stage") return;
      if (document.visibilityState === "hidden") {
        esRef.current?.close();
        esRef.current = null;
      } else if (!esRef.current && !cancelled && statusRef.current !== "FINAL_RESULTS" && !errorRef.current) {
        retriesRef.current = 0;
        connect();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [code, playerId, hostControlToken, viewMode, refreshKey]);

  const refresh = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setRefreshKey((k) => k + 1);
  }, []);

  return { gameState, error, refresh };
}
