"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PlayerAvatar } from "@/components/player-avatar";
import { playSound, preloadSounds } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { MIN_PLAYERS } from "../game-constants";
import { useOptimisticChat } from "./use-optimistic-chat";
import { useChatParticles, ChatParticleLayer } from "./chat-particles";
import { useGameStream } from "@/hooks/use-game-stream";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import {
  useChatslopAdvanceMutation,
  useChatslopEndMutation,
  useChatslopRespondMutation,
  useChatslopVoteMutation,
  useLobbyKickHumanMutation,
  useLobbyStartMutation,
} from "@/hooks/use-game-runtime";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { buildChatFeed } from "./chat-feed";
import { ChatBar, TypingDots } from "./chat-components";

/* ─── Main component ─── */

export function ChatGameShell({
  code,
  viewMode = "game",
}: {
  code: string;
  viewMode?: "game" | "stage";
}) {
  const roomSession = useConvexRoomSession(code);
  const playerId = viewMode === "stage" ? null : (roomSession?.playerId ?? null);
  const playerCapability = viewMode === "stage" ? null : (roomSession?.playerCapability ?? null);
  const hostCapability = roomSession?.hostCapability ?? null;
  const { gameState, error } = useGameStream(code, viewMode);
  const respondMutation = useChatslopRespondMutation();
  const voteMutation = useChatslopVoteMutation();
  const advanceMutation = useChatslopAdvanceMutation();
  const endMutation = useChatslopEndMutation();
  const startMutation = useLobbyStartMutation();
  const kickMutation = useLobbyKickHumanMutation();
  useScreenWakeLock(gameState != null);
  const { triggerElement } = usePixelDissolve();

  // Optimistic chat
  const chatEnabled = !!gameState && gameState.status !== "FINAL_RESULTS";
  const {
    canLoadMore: canLoadOlderMessages,
    dismissFailed,
    incomingTick,
    isLoadingHistory: loadingChatHistory,
    isLoadingMore: loadingOlderMessages,
    loadOlderMessages,
    messages: chatMessages,
    retryMessage,
    sendMessage: sendChatMessage,
  } = useOptimisticChat(code, playerId, chatEnabled);

  // Chat particle effects (each message = one pixel in the rain)
  const {
    particles: chatParticles,
    containerRef: particleContainerRef,
    emitIncoming,
    emitOutgoing,
  } = useChatParticles();

  // Transient UI state
  const [submitting, setSubmitting] = useState(false);
  const [votingBusy, setVotingBusy] = useState(false);
  const [votedPromptId, setVotedPromptId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [endingGame, setEndingGame] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const phaseKeyRef = useRef("");
  const prevStatus = useRef<string | undefined>(undefined);
  const advancePendingRef = useRef(false);
  const startPendingRef = useRef(false);

  // Reset transient state on phase change
  useEffect(() => {
    if (!gameState) return;
    const key = `${gameState.status}:${gameState.currentRound}`;
    if (phaseKeyRef.current !== key) {
      phaseKeyRef.current = key;
      setActionError("");
      setVotedPromptId(null);
      setSubmitting(false);
      setVotingBusy(false);
      setAdvancing(false);
      advancePendingRef.current = false;
      startPendingRef.current = false;
    }
  }, [gameState]);

  // Phase transition sound
  useEffect(() => {
    const status = gameState?.status;
    if (!status || status === prevStatus.current) return;
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (!prev || status === "LOBBY") return;
    playSound("phase-transition");
  }, [gameState?.status]);

  // Final results celebration
  const confettiFired = useRef(false);
  useEffect(() => {
    if (gameState?.status !== "FINAL_RESULTS" || confettiFired.current) return;
    confettiFired.current = true;
    playSound("game-over");
    const timer = setTimeout(() => playSound("celebration"), 2000);
    void import("canvas-confetti").then(({ default: confetti }) => {
      void confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#D4A853", "#C08B6E", "#F0E8D8"],
      });
    });
    return () => clearTimeout(timer);
  }, [gameState?.status]);

  // Player join/leave sounds (lobby)
  const players = gameState?.players;
  const prevPlayerIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!players) return;
    const currentIds = new Set(players.map((p) => p.id));
    const prev = prevPlayerIds.current;
    prevPlayerIds.current = currentIds;
    if (!prev) return; // skip initial render
    const hasJoin = players.some((p) => !prev.has(p.id));
    const hasLeave = [...prev].some((id) => !currentIds.has(id));
    if (hasJoin) playSound("player-join");
    else if (hasLeave) playSound("player-leave");
  }, [players]);

  // Chat receive sound + particle (new messages from other players)
  const incomingTickRef = useRef(incomingTick);
  useEffect(() => {
    if (incomingTick > incomingTickRef.current) {
      playSound("chat-receive");
      // Particle falls from above → lands near the bottom of the feed
      const container = particleContainerRef.current;
      const targetY = container ? container.scrollHeight - 40 : 300;
      emitIncoming(targetY, false);
    }
    incomingTickRef.current = incomingTick;
  }, [incomingTick, emitIncoming, particleContainerRef]);

  // Round start sound (entering WRITING = new round begins)
  const status = gameState?.status;
  const currentRoundNum = gameState?.currentRound;
  const prevRoundRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (status !== "WRITING" || currentRoundNum == null) return;
    if (prevRoundRef.current !== undefined && currentRoundNum !== prevRoundRef.current) {
      playSound("round-start");
    }
    prevRoundRef.current = currentRoundNum;
  }, [status, currentRoundNum]);

  // Winner reveal sound on ROUND_RESULTS
  const roundResultsFired = useRef<string>("");
  useEffect(() => {
    if (status !== "ROUND_RESULTS" || currentRoundNum == null) return;
    const key = `${currentRoundNum}`;
    if (roundResultsFired.current === key) return;
    roundResultsFired.current = key;
    playSound("winner-reveal");
  }, [status, currentRoundNum]);

  // All-in sound: everyone submitted their response
  const allInFired = useRef<string>("");
  useEffect(() => {
    if (!gameState || gameState.status !== "WRITING") return;
    const prompt = gameState.rounds[0]?.prompts[0];
    if (!prompt) return;
    const active = gameState.players.filter(
      (p) => p.type !== "SPECTATOR" && p.participationStatus === "ACTIVE",
    );
    if (active.length < 2) return;
    const allSubmitted = prompt.responses.length >= active.length;
    const key = `${gameState.currentRound}`;
    if (allSubmitted && allInFired.current !== key) {
      allInFired.current = key;
      playSound("all-in");
    }
  }, [gameState]);

  // Auto-scroll feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState?.status, gameState?.currentRound, chatMessages.length]);

  // Preload sounds
  useEffect(() => {
    window.addEventListener("pointerdown", preloadSounds, { once: true });
    return () => window.removeEventListener("pointerdown", preloadSounds);
  }, []);

  // Derived state
  const isHost = hostCapability !== null;
  const currentRound = gameState?.rounds[0];
  const currentPrompt = currentRound?.prompts[0];
  const activePlayers = useMemo(
    () =>
      gameState?.players.filter(
        (p) => p.type !== "SPECTATOR" && p.participationStatus === "ACTIVE",
      ) ?? [],
    [gameState?.players],
  );
  const hasSubmitted = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return currentPrompt.responses.some((r) => r.playerId === playerId);
  }, [currentPrompt, playerId]);
  const hasVoted = useMemo(() => {
    if (votedPromptId) return true;
    if (!currentPrompt || !playerId) return false;
    return currentPrompt.votes.some((v) => v.voterId === playerId);
  }, [currentPrompt, playerId, votedPromptId]);
  const canEndGame =
    isHost &&
    (gameState?.status === "WRITING" ||
      gameState?.status === "VOTING" ||
      gameState?.status === "ROUND_RESULTS");

  // ─── Actions ───

  async function handleKick(targetPlayerId: string) {
    if (!hostCapability) return;
    const target = gameState?.players.find((player) => player.id === targetPlayerId);
    if (!window.confirm(`Kick ${target?.name ?? "this player"}?`)) return;
    setActionError("");
    try {
      await kickMutation({
        capability: hostCapability,
        targetPlayerId: targetPlayerId as Id<"players">,
      });
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to kick player"));
    }
  }

  async function handleStartGame() {
    if (startPendingRef.current || !hostCapability) return;
    startPendingRef.current = true;
    setActionError("");
    try {
      await startMutation({ capability: hostCapability });
      playSound("game-start");
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to start"));
      startPendingRef.current = false;
    }
  }

  async function handleVote(responseId: string) {
    if (!playerCapability || !currentPrompt || votingBusy) return;
    setVotingBusy(true);
    setActionError("");
    try {
      await voteMutation({
        capability: playerCapability,
        promptId: currentPrompt.id as Id<"prompts">,
        responseId: responseId as Id<"responses">,
      });
      setVotedPromptId(currentPrompt.id);
      playSound("vote-cast");
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to vote"));
    } finally {
      setVotingBusy(false);
    }
  }

  async function handleNextRound() {
    if (advancePendingRef.current || !hostCapability || !gameState) return;
    advancePendingRef.current = true;
    setAdvancing(true);
    setActionError("");
    playSound("round-transition");
    try {
      await advanceMutation({
        capability: hostCapability,
        expectedPhaseGeneration: gameState.version,
      });
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to advance"));
      advancePendingRef.current = false;
      setAdvancing(false);
    }
  }

  async function handleEndGame() {
    if (!hostCapability || !canEndGame) return;
    if (!window.confirm("End the game early? Scores will be calculated for completed rounds."))
      return;
    setEndingGame(true);
    setActionError("");
    try {
      await endMutation({ capability: hostCapability });
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to end game"));
    } finally {
      setEndingGame(false);
    }
  }

  async function handleForceAdvance() {
    if (!hostCapability || advancePendingRef.current || !gameState) return;
    advancePendingRef.current = true;
    setAdvancing(true);
    setActionError("");
    try {
      await advanceMutation({
        capability: hostCapability,
        expectedPhaseGeneration: gameState.version,
      });
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Action failed"));
      advancePendingRef.current = false;
      setAdvancing(false);
    }
  }

  // ─── Loading / Error states ───

  if (error) {
    return (
      <div
        data-game="chatslop"
        className="h-svh flex items-center justify-center"
        style={{ background: "var(--cs-bg)" }}
      >
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-fail-soft border border-fail/30 flex items-center justify-center">
            <svg
              width="20"
              height="20"
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
          <p className="text-fail font-bold text-lg">{error}</p>
        </motion.div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div
        data-game="chatslop"
        className="h-svh flex flex-col"
        style={{ background: "var(--cs-bg)" }}
      >
        <div
          className="shrink-0 px-4 py-3 flex items-center gap-2.5 border-b"
          style={{ borderColor: "var(--cs-edge)" }}
        >
          <div
            className="h-4 w-20 rounded-md animate-pulse"
            style={{ background: "var(--cs-edge)" }}
          />
        </div>
        <div className="flex-1 px-4 py-6 space-y-4">
          <div className="flex justify-center">
            <div
              className="h-5 w-28 rounded-full animate-pulse"
              style={{ background: "var(--cs-edge)" }}
            />
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 rounded-2xl animate-pulse"
              style={{
                background: "var(--cs-edge)",
                opacity: 1 - i * 0.2,
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
        <div className="shrink-0 px-4 py-3 border-t" style={{ borderColor: "var(--cs-edge)" }}>
          <div
            className="h-10 rounded-2xl animate-pulse"
            style={{ background: "var(--cs-edge)" }}
          />
        </div>
      </div>
    );
  }

  const game = gameState;
  const { chatBubbles, feedItems } = buildChatFeed({
    activePlayers,
    chatMessages,
    currentPrompt: currentPrompt ?? null,
    dismissFailed,
    gameState,
    handleVote,
    hasSubmitted,
    hasVoted,
    playerId,
    retryMessage,
    triggerElement,
    viewMode,
    votingBusy,
  });

  // Determine input bar mode
  const inputMode: "chat" | "response" | "disabled" = (() => {
    if (viewMode === "stage") return "disabled";
    if (game.status === "FINAL_RESULTS") return "disabled";
    if (game.status === "WRITING" && !hasSubmitted) return "response";
    return "chat";
  })();

  const inputPlaceholder = (() => {
    if (inputMode === "response") return "Your funniest answer...";
    if (game.status === "VOTING" && !hasVoted) return "Vote above first...";
    return "Say something...";
  })();

  async function handleInputSend(text: string) {
    if (inputMode === "response") {
      if (!playerCapability || !currentPrompt) return;
      setSubmitting(true);
      setActionError("");
      try {
        await respondMutation({
          capability: playerCapability,
          promptId: currentPrompt.id as Id<"prompts">,
          text: text.trim(),
        });
        playSound("submitted");
        // Response is a joke → particle rises into the rain
        const container = particleContainerRef.current;
        const originY = container ? container.clientHeight - 20 : 400;
        emitOutgoing(originY, true);
      } catch (cause) {
        setActionError(getConvexErrorMessage(cause, "Failed to submit"));
      } finally {
        setSubmitting(false);
      }
    } else {
      playSound("chat-send");
      // Particle rises from the input area into the rain above
      const container = particleContainerRef.current;
      const originY = container ? container.clientHeight - 20 : 400;
      emitOutgoing(originY, true);
      await sendChatMessage(text);
    }
  }

  // Host action button
  const hostAction = (() => {
    if (!isHost) return null;

    if (game.status === "LOBBY") {
      const canStart = activePlayers.length >= MIN_PLAYERS;
      const needed = MIN_PLAYERS - activePlayers.length;
      return (
        <motion.button
          onClick={(e) => {
            if (startPendingRef.current) return;
            triggerElement(e.currentTarget);
            void handleStartGame();
          }}
          disabled={startPendingRef.current || !canStart}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: canStart ? "var(--cs-accent)" : "var(--cs-raised)",
            color: canStart ? "var(--cs-bg)" : "var(--cs-ink-dim)",
            border: canStart ? "none" : "1px solid var(--cs-edge)",
          }}
          whileHover={canStart ? { scale: 1.02 } : {}}
          whileTap={canStart ? { scale: 0.98 } : {}}
        >
          {startPendingRef.current
            ? "Starting..."
            : canStart
              ? "Start Game"
              : `Need ${needed} more player${needed === 1 ? "" : "s"}`}
        </motion.button>
      );
    }

    if (game.status === "WRITING" || game.status === "VOTING") {
      const label = game.status === "WRITING" ? "Skip to Voting" : "Skip to Results";
      return (
        <button
          onClick={() => void handleForceAdvance()}
          disabled={advancing}
          className="w-full py-2 rounded-xl text-[11px] font-medium transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: "var(--cs-ink-dim)", border: "1px solid var(--cs-edge)" }}
        >
          {advancing ? "Working..." : label}
        </button>
      );
    }

    if (game.status === "ROUND_RESULTS") {
      const isLast = game.currentRound >= game.totalRounds;
      return (
        <motion.button
          onClick={(e) => {
            if (advancePendingRef.current) return;
            triggerElement(e.currentTarget);
            void handleNextRound();
          }}
          disabled={advancing}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer disabled:opacity-40"
          style={{ background: "var(--cs-accent)", color: "var(--cs-bg)" }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {advancing ? "Starting..." : isLast ? "Finish Game" : "Next Round"}
        </motion.button>
      );
    }

    if (game.status === "FINAL_RESULTS") {
      return (
        <Link
          href="/host"
          className="block w-full text-center py-3 rounded-xl font-bold text-sm transition-all"
          style={{ background: "var(--cs-accent)", color: "var(--cs-bg)" }}
        >
          Play Again
        </Link>
      );
    }

    return null;
  })();

  // Non-host waiting / final actions
  const nonHostAction = (() => {
    if (isHost) return null;

    if (game.status === "LOBBY") {
      return <TypingDots label="Waiting for host to start..." />;
    }

    if (game.status === "ROUND_RESULTS") {
      const isLast = game.currentRound >= game.totalRounds;
      return (
        <TypingDots
          label={isLast ? "Waiting for host to finish..." : "Waiting for next round..."}
        />
      );
    }

    if (game.status === "FINAL_RESULTS") {
      return (
        <Link
          href="/join"
          className="block w-full text-center py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            background: "var(--cs-raised)",
            color: "var(--cs-ink)",
            border: "1px solid var(--cs-edge)",
          }}
        >
          Join Another Game
        </Link>
      );
    }

    return null;
  })();

  // ─── Render ───

  return (
    <div
      data-game="chatslop"
      className="h-svh flex flex-col"
      style={{ background: "var(--cs-bg)" }}
    >
      {/* Header */}
      <header
        className="shrink-0 px-4 py-2.5 flex items-center justify-between z-30"
        style={{
          borderBottom: "1px solid var(--cs-edge)",
          background: "color-mix(in srgb, var(--cs-bg) 90%, transparent)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-display font-extrabold text-xs tracking-tight"
            style={{ color: "var(--cs-accent)" }}
          >
            CHAT<span style={{ color: "var(--cs-violet)" }}>SLOP</span>
          </Link>
          <span className="w-px h-3" style={{ background: "var(--cs-edge)" }} />
          <span
            className="font-mono font-bold text-[11px] tracking-[0.15em]"
            style={{ color: "var(--cs-ink-dim)" }}
          >
            {game.roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {game.status !== "LOBBY" && (
            <span
              className="text-[10px] font-mono font-semibold tabular-nums"
              style={{ color: "var(--cs-ink-dim)" }}
            >
              R{game.currentRound}/{game.totalRounds}
            </span>
          )}
          <button
            onClick={() => setPlayersOpen(!playersOpen)}
            className="flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
            style={{ color: "var(--cs-ink-dim)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="font-mono font-semibold tabular-nums">{activePlayers.length}</span>
          </button>
          {canEndGame && (
            <button
              onClick={handleEndGame}
              disabled={endingGame}
              className="text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
              style={{ color: "var(--cs-ink-dim)" }}
            >
              {endingGame ? "..." : "End"}
            </button>
          )}
        </div>
      </header>

      {/* Players drawer */}
      <AnimatePresence>
        {playersOpen && (
          <motion.div
            className="shrink-0 px-4 py-3 overflow-y-auto max-h-48"
            style={{ borderBottom: "1px solid var(--cs-edge)", background: "var(--cs-surface)" }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-1.5">
              {game.players.map((p) => {
                const isDisconnected = p.participationStatus === "DISCONNECTED";
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 py-1 ${isDisconnected ? "opacity-40" : ""}`}
                  >
                    <PlayerAvatar
                      name={p.name}
                      modelId={p.modelId}
                      size={18}
                      className="rounded-full"
                    />
                    <span
                      className={`text-sm font-medium flex-1 ${isDisconnected ? "line-through" : ""}`}
                      style={{ color: "var(--cs-ink)" }}
                    >
                      {p.name}
                    </span>
                    {p.modelId && (
                      <span
                        className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                        style={{ background: "var(--cs-violet-soft)", color: "var(--cs-violet)" }}
                      >
                        AI
                      </span>
                    )}
                    {isDisconnected && (
                      <span
                        className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                        style={{ background: "var(--cs-raised)", color: "var(--cs-ink-dim)" }}
                      >
                        Left
                      </span>
                    )}
                    {game.status !== "LOBBY" && (
                      <span
                        className="text-xs font-mono tabular-nums"
                        style={{ color: "var(--cs-ink-dim)" }}
                      >
                        {p.score}
                      </span>
                    )}
                    {isHost &&
                      game.status === "LOBBY" &&
                      p.type === "HUMAN" &&
                      p.id !== playerId &&
                      !isDisconnected && (
                        <button
                          type="button"
                          aria-label={`Kick ${p.name}`}
                          onClick={() => void handleKick(p.id)}
                          className="text-[10px] cursor-pointer"
                          style={{ color: "var(--cs-ink-dim)" }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified chat feed */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 lg:py-6 relative">
        <ChatParticleLayer particles={chatParticles} containerRef={particleContainerRef} />
        <div className="max-w-lg lg:max-w-2xl mx-auto space-y-3 lg:space-y-4">
          {/* Game events */}
          {feedItems}

          {loadingChatHistory && chatMessages.length === 0 ? (
            <p
              className="py-1 text-center text-[10px] font-medium"
              style={{ color: "var(--cs-ink-dim)" }}
            >
              Loading messages...
            </p>
          ) : canLoadOlderMessages || loadingOlderMessages ? (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlderMessages}
                className="rounded-full px-3 py-1 text-[10px] font-medium transition-colors disabled:opacity-50"
                style={{
                  border: "1px solid var(--cs-edge)",
                  color: "var(--cs-ink-dim)",
                }}
              >
                {loadingOlderMessages ? "Loading..." : "Load earlier messages"}
              </button>
            </div>
          ) : null}

          {/* Chat messages */}
          {chatBubbles}

          <div ref={feedEndRef} />
        </div>
      </div>

      {/* Action bar + input */}
      <div
        className="shrink-0 px-4 lg:px-8 py-3 space-y-2"
        style={{
          borderTop: "1px solid var(--cs-edge)",
          background: "color-mix(in srgb, var(--cs-bg) 92%, transparent)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Error banner */}
        <AnimatePresence>
          {actionError && (
            <motion.div
              className="text-center text-[11px] font-medium py-1.5 px-3 rounded-lg"
              style={{
                background: "var(--fail-soft, #2A1010)",
                color: "var(--fail, #F87171)",
                border: "1px solid color-mix(in srgb, var(--fail, #F87171) 30%, transparent)",
              }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {actionError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Host/Non-host actions */}
        <div className="max-w-lg lg:max-w-2xl mx-auto w-full space-y-2">
          {hostAction}
          {nonHostAction}

          {/* Chat/response input */}
          {inputMode !== "disabled" && !!playerId && (
            <ChatBar
              mode={inputMode}
              onSend={handleInputSend}
              disabled={submitting || (game.status === "WRITING" && hasSubmitted)}
              placeholder={inputPlaceholder}
            />
          )}
        </div>
      </div>
    </div>
  );
}
