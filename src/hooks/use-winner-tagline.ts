"use client";

import { useEffect, useRef, useState } from "react";
import type { GamePlayer } from "@/lib/types";

interface UseWinnerTaglineResult {
  tagline: string;
  isStreaming: boolean;
  winner: GamePlayer | null;
}

export function useWinnerTagline(
  code: string,
  isFinal: boolean,
  players: GamePlayer[],
): UseWinnerTaglineResult {
  const [tagline, setTagline] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const fetchedKeyRef = useRef("");

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]?.type === "AI" ? sorted[0] : null;

  const fetchKey = `${code}:${isFinal}`;

  useEffect(() => {
    if (!winner) return;
    if (fetchedKeyRef.current === fetchKey) return;

    setTagline("");
    const controller = new AbortController();

    async function streamTagline() {
      try {
        const res = await fetch(
          `/api/games/${code}/tagline?isFinal=${isFinal}`,
          { signal: controller.signal },
        );

        if (!res.ok || !res.body) return;

        // Mark as fetched only after a successful response
        fetchedKeyRef.current = fetchKey;
        setIsStreaming(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (value) {
            setTagline((prev) => prev + decoder.decode(value, { stream: !done }));
          }
          if (done) break;
        }
      } catch {
        // Aborted or network failure — silently ignore
      } finally {
        setIsStreaming(false);
      }
    }

    streamTagline();

    return () => {
      controller.abort();
    };
  }, [code, isFinal, winner, fetchKey]);

  return { tagline, isStreaming, winner };
}
