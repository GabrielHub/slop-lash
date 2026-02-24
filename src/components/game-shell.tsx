"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { GameState } from "@/lib/types";
import { Lobby } from "@/app/game/[code]/lobby";
import { Writing } from "@/app/game/[code]/writing";
import { Voting } from "@/app/game/[code]/voting";
import { Results } from "@/app/game/[code]/results";

function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

const noop = () => () => {};

function useGamePoller(code: string) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/games/${code}`);
          if (!cancelled) {
            if (!res.ok) {
              setError("Game not found");
              return;
            }
            const data = await res.json();
            setGameState(data);
          }
        } catch {
          // Silently retry on network errors
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [code, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { gameState, error, refresh };
}

export function GameShell({ code }: { code: string }) {
  const playerId = useSyncExternalStore(noop, getPlayerId, () => null);
  const { gameState, error, refresh } = useGamePoller(code);

  if (error) {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <div className="text-center animate-fade-in-up">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-fail-soft border-2 border-fail/30 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-fail"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-fail font-display font-bold text-xl">{error}</p>
        </div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-4 rounded-full border-2 border-edge border-t-punch animate-spin" />
          <p className="text-ink-dim font-medium">Loading game...</p>
        </div>
      </main>
    );
  }

  const isHost = playerId === gameState.hostPlayerId;

  const gameHeader = (
    <div className="fixed top-0 left-0 right-0 z-30 px-4 py-2.5 flex items-center justify-between bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2">
        <span className="font-display font-bold text-xs text-punch tracking-tight">
          SLOP-LASH
        </span>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
          {gameState.roomCode}
        </span>
      </div>
      {gameState.status !== "LOBBY" && (
        <span className="text-xs font-medium text-ink-dim">
          Round {gameState.currentRound}/{gameState.totalRounds}
        </span>
      )}
    </div>
  );

  const content = (() => {
    switch (gameState.status) {
      case "LOBBY":
        return (
          <Lobby
            game={gameState}
            isHost={isHost}
            code={code}
            onRefresh={refresh}
          />
        );
      case "WRITING":
        return (
          <Writing game={gameState} playerId={playerId} code={code} />
        );
      case "VOTING":
        return (
          <Voting game={gameState} playerId={playerId} code={code} />
        );
      case "ROUND_RESULTS":
        return (
          <Results
            game={gameState}
            isHost={isHost}
            code={code}
            isFinal={false}
          />
        );
      case "FINAL_RESULTS":
        return (
          <Results
            game={gameState}
            isHost={isHost}
            code={code}
            isFinal={true}
          />
        );
    }
  })();

  return (
    <>
      {gameHeader}
      {content}
    </>
  );
}
