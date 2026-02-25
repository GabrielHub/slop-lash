"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { GameState } from "@/lib/types";
import { Lobby } from "@/app/game/[code]/lobby";
import { Writing } from "@/app/game/[code]/writing";
import { Voting } from "@/app/game/[code]/voting";
import { Results } from "@/app/game/[code]/results";
import { phaseTransition, fadeInUp } from "@/lib/animations";
import { playSound, preloadSounds, subscribeAudio, isMuted, toggleMute, getVolume, setVolume } from "@/lib/sounds";

function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

function getPlayerName() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerName");
}

const noopSubscribe = () => () => {};

const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 2000;
const ACTIVE_PHASES = new Set(["WRITING", "VOTING"]);

function useGamePoller(code: string, playerId: string | null) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const versionRef = useRef<number | null>(null);
  const statusRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    versionRef.current = null;
    statusRef.current = null;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function poll() {
      while (!cancelled) {
        let delay = ACTIVE_PHASES.has(statusRef.current ?? "") ? POLL_FAST_MS : POLL_SLOW_MS;
        try {
          const params = new URLSearchParams();
          if (playerId) params.set("playerId", playerId);
          if (versionRef.current !== null) params.set("v", String(versionRef.current));
          const qs = params.toString();
          const url = `/api/games/${code}${qs ? `?${qs}` : ""}`;
          const headers: HeadersInit = {};
          if (versionRef.current !== null) {
            headers["If-None-Match"] = `"${versionRef.current}"`;
          }
          const res = await fetch(url, { headers, cache: "no-store" });
          if (cancelled) continue;

          // 304 Not Modified -- keep current cadence, but still wait before polling again
          if (res.status === 304) {
            await sleep(delay);
            continue;
          }

          if (!res.ok) {
            if (res.status === 404) {
              setError("Game not found");
              return; // Stop polling on 404 only
            }
            // Retry on transient errors (500, etc.)
            delay = 2000;
            await sleep(delay);
            continue;
          }

          const data = await res.json();
          startTransition(() => {
            setGameState(data);
          });
          versionRef.current = data.version ?? null;
          statusRef.current = data.status ?? null;
        } catch {
          // Silently retry on network errors, but avoid a tight retry loop.
          await sleep(2000);
          continue;
        }
        // Poll faster during active input phases for snappier feel
        delay = ACTIVE_PHASES.has(statusRef.current ?? "") ? POLL_FAST_MS : POLL_SLOW_MS;
        await sleep(delay);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [code, playerId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { gameState, error, refresh };
}

export function GameShell({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const { gameState, error, refresh } = useGamePoller(code, playerId);
  const [endingGame, setEndingGame] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const rejoinAttempted = useRef(false);
  const soundsMuted = useSyncExternalStore(subscribeAudio, isMuted, () => false);
  const soundsVolume = useSyncExternalStore(subscribeAudio, getVolume, () => 0.5);

  // Session recovery: detect disconnected player and attempt rejoin
  useEffect(() => {
    if (!gameState || rejoinAttempted.current) return;
    // Only attempt if we have a playerId but it's not in the player list
    const inGame = gameState.players.some((p) => p.id === playerId);
    if (inGame || !playerId) return;

    rejoinAttempted.current = true;
    const token = searchParams.get("rejoin") ?? localStorage.getItem("rejoinToken");
    if (!token) return;

    setReconnecting(true);
    fetch(`/api/games/${code}/rejoin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("playerId", data.playerId);
          localStorage.setItem("playerName", data.playerName);
          localStorage.setItem("rejoinToken", token);
          refresh();
        }
      })
      .catch(() => {})
      .finally(() => setReconnecting(false));
  }, [gameState, playerId, code, searchParams, refresh]);

  // Preload sounds on first user interaction
  useEffect(() => {
    window.addEventListener("pointerdown", preloadSounds, { once: true });
    return () => window.removeEventListener("pointerdown", preloadSounds);
  }, []);

  // Play phase-transition sound when game status changes
  const prevStatus = useRef(gameState?.status);
  useEffect(() => {
    const status = gameState?.status;
    if (!status || status === prevStatus.current) return;
    const prev = prevStatus.current;
    prevStatus.current = status;
    // Skip on initial mount (prev is undefined) and LOBBY phase
    if (!prev || status === "LOBBY") return;
    // Cancel any TTS when leaving VOTING phase
    if (prev === "VOTING" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    playSound("phase-transition");
  }, [gameState?.status]);

  // Play transition sound when votingPromptIndex changes within VOTING
  const prevVotingIndex = useRef(gameState?.votingPromptIndex);
  useEffect(() => {
    if (gameState?.status !== "VOTING") {
      prevVotingIndex.current = undefined;
      return;
    }
    const idx = gameState.votingPromptIndex;
    if (prevVotingIndex.current != null && idx !== prevVotingIndex.current) {
      playSound("prompt-advance");
    }
    prevVotingIndex.current = idx;
  }, [gameState?.status, gameState?.votingPromptIndex]);

  // Handle play-again redirect for non-host players
  const handlePlayAgainRedirect = useCallback(
    async (nextGameCode: string) => {
      const playerName = getPlayerName();
      if (!playerName) {
        router.push("/join");
        return;
      }

      try {
        const res = await fetch(`/api/games/${nextGameCode}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: playerName }),
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("playerId", data.playerId);
          if (data.rejoinToken) {
            localStorage.setItem("rejoinToken", data.rejoinToken);
          }
          router.push(`/game/${nextGameCode}`);
        } else {
          // Name conflict or game full - redirect to join page
          router.push("/join");
        }
      } catch {
        router.push("/join");
      }
    },
    [router]
  );

  useEffect(() => {
    if (
      gameState?.status === "FINAL_RESULTS" &&
      gameState.nextGameCode &&
      playerId && // Wait for hydration — playerId is null before localStorage is read
      playerId !== gameState.hostPlayerId
    ) {
      // Small delay so non-host players can see the final results briefly
      const timer = setTimeout(() => {
        handlePlayAgainRedirect(gameState.nextGameCode!);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.status, gameState?.nextGameCode, gameState?.hostPlayerId, playerId, handlePlayAgainRedirect]);

  if (reconnecting) {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-edge border-t-teal animate-spin" />
          <p className="text-ink-dim text-sm">Reconnecting...</p>
        </motion.div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
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
        </motion.div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <>
        {/* Skeleton header */}
        <div className="fixed top-0 left-0 right-0 z-30 px-4 py-2.5 flex items-center gap-2 bg-base/80 backdrop-blur-sm border-b border-edge">
          <div className="h-4 w-20 rounded bg-edge/40 animate-pulse" />
          <div className="h-4 w-px bg-edge-strong" />
          <div className="h-4 w-14 rounded bg-edge/40 animate-pulse" />
        </div>
        <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
          <div className="w-full max-w-md space-y-8">
            {/* Title */}
            <div className="flex justify-center">
              <div className="h-8 w-40 rounded-lg bg-edge/40 animate-pulse" />
            </div>
            {/* Subtitle */}
            <div className="flex justify-center">
              <div className="h-4 w-36 rounded bg-edge/40 animate-pulse" />
            </div>
            {/* Room code boxes */}
            <div className="flex justify-center gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-14 h-[4.5rem] sm:w-16 sm:h-20 rounded-xl bg-edge/40 animate-pulse"
                />
              ))}
            </div>
            {/* Player list heading */}
            <div className="space-y-3">
              <div className="h-4 w-16 rounded bg-edge/40 animate-pulse" />
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl bg-edge/40 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            {/* Button */}
            <div className="h-14 rounded-xl bg-edge/40 animate-pulse" />
          </div>
        </main>
      </>
    );
  }

  const isHost = playerId === gameState.hostPlayerId;
  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  const isSpectator = currentPlayer?.type === "SPECTATOR";

  const canEndGame =
    isHost &&
    (gameState.status === "WRITING" ||
      gameState.status === "VOTING" ||
      gameState.status === "ROUND_RESULTS");

  async function handleEndGame() {
    if (!playerId || !canEndGame) return;
    if (!window.confirm("End the game early? Scores will be calculated for completed rounds.")) return;
    setEndingGame(true);
    try {
      await fetch(`/api/games/${code}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
    } finally {
      setEndingGame(false);
    }
  }

  function volumeIcon(): React.ReactNode {
    const svgProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

    if (soundsMuted) {
      return (
        <svg {...svgProps}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      );
    }
    if (soundsVolume < 0.5) {
      return (
        <svg {...svgProps}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );
    }
    return (
      <svg {...svgProps}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    );
  }

  const gameHeader = (
    <div className="fixed top-0 left-0 right-0 z-30 px-4 py-2.5 flex items-center justify-between bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-display font-bold text-xs text-punch tracking-tight hover:text-punch-hover transition-colors">
          SLOP-LASH
        </Link>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
          {gameState.roomCode}
        </span>
      </div>
      <div className="flex items-center gap-3 pr-14">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleMute}
            aria-label={soundsMuted ? "Unmute sounds" : "Mute sounds"}
            className="text-ink-dim hover:text-ink transition-colors cursor-pointer"
          >
            {volumeIcon()}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={soundsMuted ? 0 : soundsVolume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="volume-slider hidden sm:block w-16 h-4 cursor-pointer"
          />
        </div>
        {canEndGame && (
          <button
            onClick={handleEndGame}
            disabled={endingGame}
            className="text-xs font-medium text-ink-dim hover:text-fail transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {endingGame ? "Ending..." : "End Game"}
          </button>
        )}
        {gameState.status !== "LOBBY" && (
          <span className="text-xs font-medium text-ink-dim">
            Round {gameState.currentRound}/{gameState.totalRounds}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      {gameHeader}
      <AnimatePresence mode="wait">
        <motion.div
          key={gameState.status}
          variants={phaseTransition}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {gameState.status === "LOBBY" && (
            <Lobby
              game={gameState}
              isHost={isHost}
              code={code}
              onRefresh={refresh}
            />
          )}
          {gameState.status === "WRITING" && (
            <Writing game={gameState} playerId={playerId} code={code} isHost={isHost} isSpectator={isSpectator} />
          )}
          {gameState.status === "VOTING" && (
            <Voting game={gameState} playerId={playerId} code={code} isHost={isHost} isSpectator={isSpectator} />
          )}
          {(gameState.status === "ROUND_RESULTS" || gameState.status === "FINAL_RESULTS") && (
            <Results
              game={gameState}
              isHost={isHost}
              playerId={playerId}
              code={code}
              isFinal={gameState.status === "FINAL_RESULTS"}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
