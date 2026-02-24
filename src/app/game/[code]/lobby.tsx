"use client";

import { useState } from "react";
import { GameState } from "@/lib/types";
import { PlayerList } from "@/components/player-list";

export function Lobby({
  game,
  isHost,
  code,
  onRefresh,
}: {
  game: GameState;
  isHost: boolean;
  code: string;
  onRefresh: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function startGame() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/games/${code}/start`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start");
      } else {
        onRefresh();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6 py-12 pt-20">
      <div className="w-full max-w-md animate-float-in">
        <h1 className="font-display text-3xl font-bold mb-2 text-center">
          Game Lobby
        </h1>

        {/* Room Code Display */}
        <div className="text-center mb-10">
          <p className="text-sm text-ink-dim mb-3">
            Share this code to join
          </p>
          <div className="flex justify-center gap-2.5">
            {game.roomCode.split("").map((char, i) => (
              <div
                key={i}
                className={`w-14 h-[4.5rem] sm:w-16 sm:h-20 flex items-center justify-center bg-surface border-2 border-edge-strong rounded-xl font-mono font-extrabold text-3xl sm:text-4xl text-gold animate-scale-in delay-${i + 1}`}
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {char}
              </div>
            ))}
          </div>
        </div>

        {/* Player List */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-ink-dim">Players</h2>
            <span className="text-xs font-mono text-ink-dim/60">
              {game.players.length}
            </span>
          </div>
          <PlayerList players={game.players} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-fail-soft border-2 border-fail/30 text-fail text-sm text-center font-medium">
            {error}
          </div>
        )}

        {/* Start / Waiting */}
        {isHost ? (
          <button
            onClick={startGame}
            disabled={starting || game.players.length < 3}
            className={`w-full font-display font-bold py-4 rounded-xl text-lg transition-all active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed ${
              game.players.length < 3
                ? "bg-raised text-ink-dim border-2 border-edge"
                : "bg-teal hover:bg-teal-hover text-white disabled:opacity-50"
            }`}
          >
            {starting
              ? "Starting..."
              : game.players.length < 3
                ? `Need ${3 - game.players.length} more player${game.players.length === 2 ? "" : "s"}`
                : "Start Game"}
          </button>
        ) : (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 text-ink-dim">
              <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              <p className="text-sm font-medium">
                Waiting for host to start...
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
