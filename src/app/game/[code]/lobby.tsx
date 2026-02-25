"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { GameState } from "@/lib/types";
import { PlayerList } from "@/components/player-list";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import {
  staggerContainer,
  popIn,
  fadeInUp,
  buttonTapPrimary,
} from "@/lib/animations";
import { MIN_PLAYERS, MAX_PLAYERS, MAX_SPECTATORS } from "@/lib/game-constants";
import { playSound, preloadSounds } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";

function getStartButtonText(starting: boolean, activePlayerCount: number): string {
  if (starting) return "Starting...";
  if (activePlayerCount < MIN_PLAYERS) {
    const needed = MIN_PLAYERS - activePlayerCount;
    return `Need ${needed} more player${needed === 1 ? "" : "s"}`;
  }
  return "Start Game";
}

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
  const [copied, setCopied] = useState(false);
  const startPendingRef = useRef(false);
  const { triggerElement } = usePixelDissolve();
  const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
  const spectators = game.players.filter((p) => p.type === "SPECTATOR");

  useEffect(() => {
    if (game.status !== "LOBBY") {
      startPendingRef.current = false;
      setStarting(false);
    }
  }, [game.status]);

  // Track player joins/leaves for SFX
  const prevPlayerIds = useRef(new Set(game.players.map((p) => p.id)));
  useEffect(() => {
    const currentIds = new Set(game.players.map((p) => p.id));
    const prev = prevPlayerIds.current;
    const hasJoin = game.players.some((p) => !prev.has(p.id));
    const hasLeave = [...prev].some((id) => !currentIds.has(id));
    prevPlayerIds.current = currentIds;

    if (hasJoin) playSound("player-join");
    else if (hasLeave) playSound("player-leave");
  }, [game.players]);

  const handleKick = useCallback(
    async (targetPlayerId: string) => {
      const playerId = localStorage.getItem("playerId");
      if (!playerId) return;
      const target = game.players.find((p) => p.id === targetPlayerId);
      if (!window.confirm(`Kick ${target?.name ?? "this player"}?`)) return;
      try {
        await fetch(`/api/games/${code}/kick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, targetPlayerId }),
        });
      } catch {
        // ignore
      }
    },
    [code, game.players],
  );

  const copyCode = useCallback(() => {
    preloadSounds();
    navigator.clipboard.writeText(game.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [game.roomCode]);

  async function startGame() {
    if (startPendingRef.current) return;
    const playerId = localStorage.getItem("playerId");
    startPendingRef.current = true;
    setStarting(true);
    setError("");
    let keepPending = false;
    try {
      const res = await fetch(`/api/games/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start");
      } else {
        keepPending = true;
        playSound("game-start");
        onRefresh();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      if (!keepPending) {
        startPendingRef.current = false;
        setStarting(false);
      }
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-md">
        <motion.h1
          className="font-display text-3xl font-bold mb-2 text-center text-ink"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          Game Lobby
        </motion.h1>

        {/* Room Code Display */}
        <div className="text-center mb-10">
          <motion.p
            className="text-sm text-ink-dim mb-3"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            Share this code to join
          </motion.p>
          <motion.div
            className="flex justify-center gap-2.5"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {game.roomCode.split("").map((char, i) => (
              <motion.div
                key={i}
                className="w-14 h-[4.5rem] sm:w-16 sm:h-20 flex items-center justify-center bg-surface/80 backdrop-blur-md border-2 border-edge-strong rounded-xl font-mono font-extrabold text-3xl sm:text-4xl text-gold"
                style={{ boxShadow: "var(--shadow-card)" }}
                variants={popIn}
              >
                {char}
              </motion.div>
            ))}
          </motion.div>
          <button
            onClick={copyCode}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Code
              </>
            )}
          </button>
        </div>

        {/* Player List */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-ink-dim">Players</h2>
            <span className="text-xs font-mono text-ink-dim/60">
              {activePlayers.length}/{MAX_PLAYERS}
              {spectators.length > 0 && (
                <span className="ml-2">
                  Spectators {spectators.length}/{MAX_SPECTATORS}
                </span>
              )}
            </span>
          </div>
          <PlayerList
            players={game.players}
            onKick={isHost ? handleKick : undefined}
            hostPlayerId={game.hostPlayerId ?? undefined}
          />
        </div>

        <ErrorBanner error={error} />

        {/* Start / Waiting */}
        {isHost ? (
          <motion.button
            onClick={(e) => {
              if (starting) return;
              triggerElement(e.currentTarget);
              void startGame();
            }}
            disabled={starting || activePlayers.length < MIN_PLAYERS}
            className={`w-full font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed ${
              activePlayers.length < MIN_PLAYERS
                ? "bg-raised/80 backdrop-blur-sm text-ink-dim border-2 border-edge"
                : "bg-teal/90 backdrop-blur-sm hover:bg-teal-hover text-white disabled:opacity-50"
            }`}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            {...buttonTapPrimary}
          >
            {getStartButtonText(starting, activePlayers.length)}
          </motion.button>
        ) : (
          <div className="text-center py-4">
            <PulsingDot>
              <span className="text-sm">Waiting for host to start...</span>
            </PulsingDot>
          </div>
        )}
      </div>
    </main>
  );
}
