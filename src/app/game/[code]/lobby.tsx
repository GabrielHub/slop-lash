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
import { MIN_PLAYERS, MAX_PLAYERS } from "@/games/sloplash/game-constants";
import { playSound, preloadSounds } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

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
  compactStage = false,
}: {
  game: GameState;
  isHost: boolean;
  code: string;
  onRefresh: () => void;
  compactStage?: boolean;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [copied, copyToClipboard] = useCopyToClipboard();
  const [tvCopied, copyTvToClipboard] = useCopyToClipboard();
  const startPendingRef = useRef(false);
  const { triggerElement } = usePixelDissolve();
  const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
  const isDisplayOnlyHostMode = game.hostPlayerId == null;
  const mainClassName = compactStage
    ? "flex-1 flex flex-col items-center px-6 py-6 lg:py-5"
    : "flex-1 flex flex-col items-center px-6 py-12";
  const containerClassName = compactStage
    ? "w-full max-w-6xl lg:grid lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-10 xl:gap-14 lg:items-start"
    : "w-full max-w-md";

  useEffect(() => {
    if (game.status !== "LOBBY") {
      startPendingRef.current = false;
      setStarting(false);
    }
  }, [game.status]);

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
      const hostToken = localStorage.getItem("hostControlToken");
      if (!playerId && !hostToken) return;
      const target = game.players.find((p) => p.id === targetPlayerId);
      if (!window.confirm(`Kick ${target?.name ?? "this player"}?`)) return;
      try {
        await fetch(`/api/games/${code}/kick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, hostToken, targetPlayerId }),
        });
      } catch {
        // ignore
      }
    },
    [code, game.players],
  );

  const copyCode = useCallback(() => {
    preloadSounds();
    copyToClipboard(game.roomCode);
  }, [game.roomCode, copyToClipboard]);

  const copyTvLink = useCallback(() => {
    const hostToken = localStorage.getItem("hostControlToken");
    const base = `${window.location.origin}/stage/${game.roomCode}`;
    const url = hostToken ? `${base}?token=${encodeURIComponent(hostToken)}` : base;
    copyTvToClipboard(url);
  }, [game.roomCode, copyTvToClipboard]);

  async function startGame() {
    if (startPendingRef.current) return;
    const playerId = localStorage.getItem("playerId");
    const hostToken = localStorage.getItem("hostControlToken");
    if (!playerId && !hostToken) return;
    startPendingRef.current = true;
    setStarting(true);
    setError("");
    let keepPending = false;
    try {
      const res = await fetch(`/api/games/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
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
    <main className={mainClassName}>
      <div className={containerClassName}>
        <div>
          <motion.h1
            className={`font-display font-bold text-ink ${compactStage ? "mb-3 text-center lg:text-left text-4xl xl:text-5xl" : "mb-2 text-center text-3xl"}`}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            Game Lobby
          </motion.h1>

          <div className={`text-center ${compactStage ? "mb-0 lg:text-left" : "mb-10"}`}>
            <motion.p
              className={`text-ink-dim ${compactStage ? "mb-4 text-base lg:text-lg" : "mb-3 text-sm"}`}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
            >
              Share this code to join
            </motion.p>
            <motion.div
              className={`flex gap-2.5 ${compactStage ? "justify-center lg:justify-start" : "justify-center"}`}
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {game.roomCode.split("").map((char, i) => (
                <motion.div
                  key={i}
                  className={`flex items-center justify-center bg-surface/80 backdrop-blur-md border-2 border-edge-strong rounded-xl font-mono font-extrabold text-gold ${compactStage ? "h-20 w-16 xl:h-24 xl:w-20 text-4xl xl:text-5xl" : "w-14 h-[4.5rem] sm:w-16 sm:h-20 text-3xl sm:text-4xl"}`}
                  style={{ boxShadow: "var(--shadow-card)" }}
                  variants={popIn}
                >
                  {char}
                </motion.div>
              ))}
            </motion.div>
            <div className={`mt-4 flex items-center gap-4 ${compactStage ? "justify-center lg:justify-start" : "justify-center"}`}>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <CheckIcon />
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
              {isHost && (
                <button
                  onClick={copyTvLink}
                  className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink transition-colors cursor-pointer"
                >
                  {tvCopied ? (
                    <>
                      <CheckIcon />
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                        <polyline points="17 2 12 7 7 2" />
                      </svg>
                      TV Link
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className={compactStage ? "mt-8 lg:mt-10" : ""}>
            <ErrorBanner error={error} />

            {isHost ? (
              <div className="space-y-3">
                {isDisplayOnlyHostMode && (
                  <p className={`text-ink-dim ${compactStage ? "text-center lg:text-left text-base" : "text-center text-sm"}`}>
                    This TV screen is the host in TV mode. Start the game here when everyone is ready.
                  </p>
                )}
                <motion.button
                  onClick={(e) => {
                    if (starting) return;
                    triggerElement(e.currentTarget);
                    void startGame();
                  }}
                  disabled={starting || activePlayers.length < MIN_PLAYERS}
                  className={`w-full font-display font-bold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    compactStage ? "py-5 text-xl xl:text-2xl" : "py-4 text-lg"
                  } ${
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
              </div>
            ) : (
              <div className="text-center py-4">
                <PulsingDot>
                  <span className={compactStage ? "text-base" : "text-sm"}>
                    {isDisplayOnlyHostMode
                      ? "Waiting for the host to start the game..."
                      : "Waiting for host to start..."}
                  </span>
                </PulsingDot>
              </div>
            )}
          </div>
        </div>

        <div className={compactStage ? "mt-8 lg:mt-0" : "mb-8"}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className={`font-medium text-ink-dim ${compactStage ? "text-base lg:text-lg" : "text-sm"}`}>Players</h2>
            <span className={`font-mono text-ink-dim/60 ${compactStage ? "text-sm" : "text-xs"}`}>
              {activePlayers.length}/{MAX_PLAYERS}
            </span>
          </div>
          <div className={compactStage ? "rounded-2xl border border-edge/80 bg-surface/45 p-4 lg:p-5" : ""}>
            <PlayerList
              players={activePlayers}
              onKick={isHost ? handleKick : undefined}
              hostPlayerId={game.hostPlayerId ?? undefined}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
