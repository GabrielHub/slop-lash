"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { GameState } from "@/lib/types";
import { Lobby } from "@/app/game/[code]/lobby";
import { Writing } from "@/app/game/[code]/writing";
import { Voting } from "@/app/game/[code]/voting";
import { Results } from "@/app/game/[code]/results";
import { phaseTransition, fadeInUp } from "@/lib/animations";
import { playSound, preloadSounds, subscribeAudio, isMuted, toggleMute, getVolume, setVolume, SOUND_NAMES } from "@/lib/sounds";
import { useNarrator } from "@/hooks/use-narrator";
import { NarratorIndicator } from "@/components/narrator-indicator";
import {
  buildGameStartEvent,
  buildNextRoundEvent,
  buildVotingStartEvent,
  buildMatchupEvent,
  buildVoteResultEvent,
  buildRoundOverEvent,
  buildHurryUpEvent,
  getVotablePrompts,
} from "@/games/sloplash/narrator-events";

function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

function getHostControlToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hostControlToken");
}

const noopSubscribe = () => () => {};

const POLL_FAST_MS = 1000;
const POLL_VOTING_OPEN_MS = 1500;
const POLL_VISIBLE_IDLE_MS = 60_000;
const USER_IDLE_POLL_THRESHOLD_MS = 5 * 60_000;
const POLL_LOBBY_MS = 4000;
const POLL_ROUND_RESULTS_MS = 4000;
const POLL_DEFAULT_MS = 3000;
const HEARTBEAT_TOUCH_MS = 15_000;
const HEARTBEAT_TOUCH_LOBBY_MS = 60_000;
const ACTIVE_PHASES = new Set(["WRITING", "VOTING"]);

type ReactionSnapshotPayload = {
  roundNumber: number;
  responses: Array<{
    responseId: string;
    reactions: GameState["rounds"][number]["prompts"][number]["responses"][number]["reactions"];
  }>;
};

function isPageHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function mergeReactionSnapshot(
  game: GameState,
  payload: ReactionSnapshotPayload,
): GameState {
  if (game.status !== "VOTING") return game;
  const currentRound = game.rounds[0];
  if (!currentRound || currentRound.roundNumber !== payload.roundNumber) return game;

  const reactionsByResponseId = new Map(
    payload.responses.map((entry) => [entry.responseId, entry.reactions]),
  );

  let changed = false;
  const nextPrompts = currentRound.prompts.map((prompt) => {
    let promptChanged = false;
    const nextResponses = prompt.responses.map((response) => {
      const nextReactions = reactionsByResponseId.get(response.id);
      if (!nextReactions) return response;

      const sameLength = nextReactions.length === response.reactions.length;
      const sameItems =
        sameLength &&
        nextReactions.every((r, i) => {
          const prev = response.reactions[i];
          return (
            prev != null &&
            prev.id === r.id &&
            prev.playerId === r.playerId &&
            prev.emoji === r.emoji &&
            prev.responseId === r.responseId
          );
        });

      if (sameItems) return response;
      promptChanged = true;
      changed = true;
      return { ...response, reactions: nextReactions };
    });

    return promptChanged ? { ...prompt, responses: nextResponses } : prompt;
  });

  if (!changed) return game;

  const nextRounds = [...game.rounds];
  nextRounds[0] = { ...currentRound, prompts: nextPrompts };
  return { ...game, rounds: nextRounds };
}

function useGamePoller(
  code: string,
  playerId: string | null,
  hostControlToken: string | null,
  viewMode: "game" | "stage",
) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const versionRef = useRef<number | null>(null);
  const statusRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const lastTouchAtRef = useRef(0);
  const lastInteractionAtRef = useRef(0);
  const reactionsEtagRef = useRef<string | null>(null);
  const reactionsRoundRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cancelHiddenWait: (() => void) | null = null;
    versionRef.current = null;
    statusRef.current = null;
    gameStateRef.current = null;
    reactionsEtagRef.current = null;
    reactionsRoundRef.current = null;
    lastTouchAtRef.current = 0;
    lastInteractionAtRef.current = Date.now();
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitUntilVisible = () =>
      new Promise<void>((resolve) => {
        if (!isPageHidden()) {
          resolve();
          return;
        }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          document.removeEventListener("visibilitychange", onVisibilityChange);
          cancelHiddenWait = null;
          resolve();
        };
        const onVisibilityChange = () => {
          if (!isPageHidden()) {
            finish();
          }
        };
        cancelHiddenWait = finish;
        document.addEventListener("visibilitychange", onVisibilityChange);
      });

    function resetReactionsCache() {
      reactionsEtagRef.current = null;
      reactionsRoundRef.current = null;
    }

    function isUserIdleVisible(): boolean {
      if (isPageHidden()) return false;
      return Date.now() - lastInteractionAtRef.current >= USER_IDLE_POLL_THRESHOLD_MS;
    }

    function getPollDelay(): number {
      const s = statusRef.current ?? "";
      if (isUserIdleVisible()) return POLL_VISIBLE_IDLE_MS;
      if (s === "VOTING") {
        // Keep request volume roughly flat after extending vote timer by polling
        // the non-reveal subphase less aggressively.
        return gameStateRef.current?.votingRevealing ? POLL_FAST_MS : POLL_VOTING_OPEN_MS;
      }
      if (ACTIVE_PHASES.has(s)) return POLL_FAST_MS;
      if (s === "LOBBY") return POLL_LOBBY_MS;
      if (s === "ROUND_RESULTS") return POLL_ROUND_RESULTS_MS;
      return POLL_DEFAULT_MS;
    }

    function getHeartbeatTouchInterval(): number {
      const s = statusRef.current ?? "";
      if (s === "LOBBY") return HEARTBEAT_TOUCH_LOBBY_MS;
      return HEARTBEAT_TOUCH_MS;
    }

    async function syncVotingReactions() {
      const game = gameStateRef.current;
      if (!game || game.status !== "VOTING" || game.rounds[0] == null) {
        resetReactionsCache();
        return;
      }

      if (isPageHidden() || isUserIdleVisible()) return;

      const headers: HeadersInit = {};
      if (reactionsEtagRef.current) {
        headers["If-None-Match"] = reactionsEtagRef.current;
      }

      const res = await fetch(`/api/games/${code}/reactions`, {
        headers,
        cache: "no-store",
      });
      if (cancelled) return;

      if (res.status === 304 || !res.ok) return;

      const etag = res.headers.get("etag");
      const payload = (await res.json()) as ReactionSnapshotPayload;
      if (!payload || typeof payload.roundNumber !== "number" || !Array.isArray(payload.responses)) {
        return;
      }

      if (payload.roundNumber !== game.currentRound) {
        resetReactionsCache();
        return;
      }

      if (etag) reactionsEtagRef.current = etag;
      reactionsRoundRef.current = payload.roundNumber;

      startTransition(() => {
        setGameState((prev) => {
          if (!prev) return prev;
          const next = mergeReactionSnapshot(prev, payload);
          gameStateRef.current = next;
          return next;
        });
      });
    }

    async function poll() {
      while (!cancelled) {
        try {
          if (isPageHidden()) {
            await waitUntilVisible();
            continue;
          }

          const params = new URLSearchParams();
          if (playerId) params.set("playerId", playerId);
          if (versionRef.current !== null) params.set("v", String(versionRef.current));
          const shouldTouch =
            !!playerId &&
            !isUserIdleVisible() &&
            statusRef.current !== "FINAL_RESULTS" &&
            Date.now() - lastTouchAtRef.current >= getHeartbeatTouchInterval();
          const shouldHostTouch =
            !!hostControlToken &&
            viewMode === "stage" &&
            statusRef.current !== "FINAL_RESULTS" &&
            Date.now() - lastTouchAtRef.current >= getHeartbeatTouchInterval();
          if (shouldTouch) params.set("touch", "1");
          if (shouldHostTouch) params.set("hostTouch", "1");
          const qs = params.toString();
          const url = `/api/games/${code}${qs ? `?${qs}` : ""}`;
          const headers: HeadersInit = {};
          if (versionRef.current !== null) {
            headers["If-None-Match"] = `"${versionRef.current}"`;
          }
          if (shouldHostTouch && hostControlToken) {
            headers["x-host-control-token"] = hostControlToken;
          }
          const res = await fetch(url, { headers, cache: "no-store" });
          if (cancelled) continue;

          if (res.status === 304) {
            if (shouldTouch || shouldHostTouch) lastTouchAtRef.current = Date.now();
            if (statusRef.current === "FINAL_RESULTS") {
              return;
            }
            if (statusRef.current === "VOTING") {
              await syncVotingReactions();
            }
            await sleep(getPollDelay());
            continue;
          }

          if (!res.ok) {
            if (res.status === 404) {
              setError("Game not found");
              return;
            }
            await sleep(2000);
            continue;
          }

          if (shouldTouch || shouldHostTouch) lastTouchAtRef.current = Date.now();

          const data = (await res.json()) as GameState;
          if (data.status !== "VOTING") {
            resetReactionsCache();
          } else if (reactionsRoundRef.current !== data.currentRound) {
            resetReactionsCache();
            reactionsRoundRef.current = data.currentRound;
          }

          gameStateRef.current = data;
          startTransition(() => {
            setGameState(data);
          });
          versionRef.current = data.version ?? null;
          statusRef.current = data.status ?? null;
          if (data.status === "FINAL_RESULTS") {
            return;
          }
        } catch {
          await sleep(2000);
          continue;
        }
        await sleep(getPollDelay());
      }
    }

    void poll();
    return () => {
      cancelled = true;
      cancelHiddenWait?.();
    };
  }, [code, playerId, hostControlToken, viewMode, refreshKey]);

  useEffect(() => {
    const markInteraction = () => {
      const wasIdle = Date.now() - lastInteractionAtRef.current >= USER_IDLE_POLL_THRESHOLD_MS;
      lastInteractionAtRef.current = Date.now();
      if (wasIdle && !isPageHidden()) {
        setRefreshKey((k) => k + 1);
      }
    };
    const events = ["pointerdown", "keydown", "mousemove", "touchstart", "focus"] as const;
    for (const e of events) window.addEventListener(e, markInteraction, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, markInteraction);
    };
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { gameState, error, refresh };
}

export function GameShell({
  code,
  viewMode = "game",
}: {
  code: string;
  viewMode?: "game" | "stage";
}) {
  const searchParams = useSearchParams();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const hostControlToken = useSyncExternalStore(noopSubscribe, getHostControlToken, () => null);
  const { gameState, error, refresh } = useGamePoller(code, playerId, hostControlToken, viewMode);
  const [endingGame, setEndingGame] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const rejoinAttempted = useRef(false);
  const soundsMuted = useSyncExternalStore(subscribeAudio, isMuted, () => false);
  const soundsVolume = useSyncExternalStore(subscribeAudio, getVolume, () => 0.5);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  useEffect(() => {
    if (!gameState || rejoinAttempted.current) return;
    const inGame = gameState.players.some((p) => p.id === playerId);
    if (inGame || !playerId) return;

    rejoinAttempted.current = true;
    const token = searchParams.get("rejoin") ?? localStorage.getItem("rejoinToken");
    if (!token) return;

    queueMicrotask(() => setReconnecting(true));
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
      .catch(() => {
        rejoinAttempted.current = false;
      })
      .finally(() => setReconnecting(false));
  }, [gameState, playerId, code, searchParams, refresh]);

  useEffect(() => {
    window.addEventListener("pointerdown", preloadSounds, { once: true });
    return () => window.removeEventListener("pointerdown", preloadSounds);
  }, []);

  const prevStatus = useRef(gameState?.status);
  useEffect(() => {
    const status = gameState?.status;
    if (!status || status === prevStatus.current) return;
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (!prev || status === "LOBBY") return;
    playSound("phase-transition");
  }, [gameState?.status]);

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

  const isHost =
    playerId === gameState?.hostPlayerId ||
    (viewMode === "stage" && !!hostControlToken && gameState?.hostPlayerId == null);
  const { narrate, isConnected: narratorConnected, isSpeaking: narratorSpeaking } = useNarrator({
    code,
    playerId,
    hostToken: hostControlToken,
    isHost,
    ttsMode: gameState?.ttsMode ?? "OFF",
    gameStatus: gameState?.status,
    players: gameState?.players ?? [],
    totalRounds: gameState?.totalRounds ?? 3,
  });

  const gameStateRef = useRef<GameState | null>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const narratorPrevStatus = useRef(gameState?.status);
  const prevNarratorConnected = useRef(false);
  useEffect(() => {
    if (!narratorConnected || prevNarratorConnected.current) return;
    prevNarratorConnected.current = true;
    const gs = gameStateRef.current;
    if (gs?.status === "WRITING") {
      narratorPrevStatus.current = gs.status;
      narrate(buildGameStartEvent(gs));
    }
  }, [narratorConnected, narrate]);
  useEffect(() => {
    const gs = gameStateRef.current;
    const status = gs?.status;
    if (!status || !narratorConnected) return;
    if (status === narratorPrevStatus.current) return;
    const prev = narratorPrevStatus.current;
    narratorPrevStatus.current = status;

    if (!prev) return;

    switch (status) {
      case "WRITING":
        narrate(
          prev === "LOBBY"
            ? buildGameStartEvent(gs)
            : buildNextRoundEvent(gs),
        );
        break;
      case "VOTING":
        narrate(buildVotingStartEvent(gs));
        break;
      case "ROUND_RESULTS":
        narrate(buildRoundOverEvent(gs));
        break;
    }
  }, [gameState?.status, narratorConnected, narrate]);

  const narratorPrevIndex = useRef<number | undefined>(undefined);
  const narratorPrevRevealing = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const gs = gameStateRef.current;
    if (!narratorConnected || !gs || gs.status !== "VOTING") return;
    const idx = gs.votingPromptIndex;
    const revealing = gs.votingRevealing;

    if (idx === narratorPrevIndex.current && revealing === narratorPrevRevealing.current) return;
    narratorPrevIndex.current = idx;
    narratorPrevRevealing.current = revealing;

    const votablePrompts = getVotablePrompts(gs);
    const xml = revealing
      ? buildVoteResultEvent(gs, votablePrompts)
      : buildMatchupEvent(gs, votablePrompts);
    if (xml) narrate(xml);
  }, [gameState?.votingPromptIndex, gameState?.votingRevealing, narratorConnected, narrate]);

  useEffect(() => {
    if (!narratorConnected || gameState?.status !== "WRITING" || !gameState.phaseDeadline) return;
    const deadline = new Date(gameState.phaseDeadline).getTime();
    const remaining = deadline - Date.now();
    const fireAt = remaining - 15_000;
    if (fireAt < 0) return;

    const timer = setTimeout(() => {
      narrate(buildHurryUpEvent(15));
    }, fireAt);
    return () => clearTimeout(timer);
  }, [gameState?.status, gameState?.phaseDeadline, narratorConnected, narrate]);

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
      <div className="min-h-svh flex flex-col bg-base">
        <div className="shrink-0 z-30 px-4 py-2.5 flex items-center gap-2 bg-base/80 backdrop-blur-sm border-b border-edge">
          <div className="h-4 w-20 rounded bg-edge/40 animate-pulse" />
          <div className="h-4 w-px bg-edge-strong" />
          <div className="h-4 w-14 rounded bg-edge/40 animate-pulse" />
        </div>
        <main className="flex-1 flex flex-col items-center px-6 py-12">
          <div className="w-full max-w-md space-y-8">
            <div className="flex justify-center">
              <div className="h-8 w-40 rounded-lg bg-edge/40 animate-pulse" />
            </div>
            <div className="flex justify-center">
              <div className="h-4 w-36 rounded bg-edge/40 animate-pulse" />
            </div>
            <div className="flex justify-center gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-14 h-[4.5rem] sm:w-16 sm:h-20 rounded-xl bg-edge/40 animate-pulse"
                />
              ))}
            </div>
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
            <div className="h-14 rounded-xl bg-edge/40 animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  const isSpectator = currentPlayer?.type === "SPECTATOR";
  const forceStageView = viewMode === "stage";

  const canEndGame =
    isHost &&
    (gameState.status === "WRITING" ||
      gameState.status === "VOTING" ||
      gameState.status === "ROUND_RESULTS");

  async function handleEndGame() {
    if ((!playerId && !hostControlToken) || !canEndGame) return;
    if (!window.confirm("End the game early? Scores will be calculated for completed rounds.")) return;
    setEndingGame(true);
    try {
      const res = await fetch(`/api/games/${code}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken: hostControlToken }),
      });
      if (!res.ok) {
        setEndingGame(false);
      }
    } catch {
      setEndingGame(false);
    }
  }

  function volumeIcon(): React.ReactNode {
    const svgProps = {
      width: 16, height: 16, viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", strokeWidth: 2,
      strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    };

    if (soundsMuted) {
      return (
        <svg {...svgProps}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      );
    }

    return (
      <svg {...svgProps}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        {soundsVolume >= 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    );
  }

  const gameHeader = (
    <div className="shrink-0 z-30 px-4 py-2.5 flex items-center justify-between bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-display font-bold text-xs text-punch tracking-tight hover:text-punch-hover transition-colors">
          SLOP-LASH
        </Link>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
          {gameState.roomCode}
        </span>
        {narratorConnected && (
          <>
            <span className="text-edge-strong">|</span>
            <NarratorIndicator state={narratorSpeaking ? "speaking" : "connected"} />
          </>
        )}
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
          <button
            onClick={() => {
              const names = SOUND_NAMES;
              playSound(names[Math.floor(Math.random() * names.length)]);
            }}
            aria-label="Test sound"
            title="Play a random sound to test volume"
            className="text-ink-dim hover:text-ink transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </button>
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
    <div className="min-h-svh flex flex-col bg-base">
      {gameHeader}
      <AnimatePresence mode="wait">
        <motion.div
          key={gameState.status}
          className="flex-1 flex flex-col"
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
            <Writing
              game={gameState}
              playerId={playerId}
              code={code}
              isHost={isHost}
              isSpectator={isSpectator}
              forceStageView={forceStageView}
            />
          )}
          {gameState.status === "VOTING" && (
            <Voting
              game={gameState}
              playerId={playerId}
              code={code}
              isHost={isHost}
              isSpectator={isSpectator}
              forceStageView={forceStageView}
            />
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
    </div>
  );
}
