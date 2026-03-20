"use client";

import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import { CompletionCard } from "@/components/completion-card";
import {
  floatIn,
  buttonTap,
  buttonTapPrimary,
  phaseTransition,
  staggerContainer,
} from "@/lib/animations";
import { MIN_PLAYERS } from "../game-constants";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useControllerStream } from "@/hooks/use-controller-stream";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { getPlayerId, getPlayerToken, noopSubscribe } from "@/lib/client-session";

function phaseAccent(status: string) {
  switch (status) {
    case "LOBBY":
      return { pill: "bg-teal/15 text-teal", line: "bg-teal/50" };
    case "WRITING":
      return { pill: "bg-gold/15 text-gold", line: "bg-gold/50" };
    case "VOTING":
      return { pill: "bg-punch/15 text-punch", line: "bg-punch/50" };
    case "ROUND_RESULTS":
    case "FINAL_RESULTS":
      return { pill: "bg-win/15 text-win", line: "bg-win/50" };
    default:
      return { pill: "bg-edge text-ink-dim", line: "bg-edge" };
  }
}

function phaseLabel(status: string) {
  switch (status) {
    case "LOBBY":
      return "Lobby";
    case "WRITING":
      return "Write";
    case "VOTING":
      return "Vote";
    case "ROUND_RESULTS":
      return "Results";
    case "FINAL_RESULTS":
      return "Game Over";
    default:
      return "";
  }
}

function ChatControllerHeader({
  roomCode,
  roundLabel,
  phase,
}: {
  roomCode: string | null;
  roundLabel: string | null;
  phase: string | null;
}) {
  const accent = phase ? phaseAccent(phase) : null;
  return (
    <div className="fixed top-0 left-0 right-0 z-30">
      <div className="px-4 py-2.5 flex items-center justify-between bg-base/90 backdrop-blur-md border-b border-edge">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-display font-bold text-xs text-teal tracking-tight hover:text-teal-hover transition-colors"
          >
            CHATSLOP
          </Link>
          <span className="text-edge-strong">|</span>
          <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
            {roomCode ?? "...."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {accent && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${accent.pill}`}
            >
              {phaseLabel(phase!)}
            </span>
          )}
          {roundLabel && (
            <span className="text-[11px] text-ink-dim font-mono">
              {roundLabel}
            </span>
          )}
        </div>
      </div>
      {accent && (
        <div
          className={`h-[2px] w-full transition-colors duration-500 ${accent.line}`}
        />
      )}
    </div>
  );
}

function PromptCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-gold/25 bg-gold-soft/30 px-4 py-3.5">
      <p className="font-display font-bold text-base leading-snug text-ink">
        {text}
      </p>
    </div>
  );
}

export function ChatControllerShell({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const { triggerElement } = usePixelDissolve();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const playerToken = useSyncExternalStore(noopSubscribe, getPlayerToken, () => null);
  const { gameState, error, refresh } = useControllerStream(code, playerToken);
  useScreenWakeLock(gameState != null);

  const [responseText, setResponseText] = useState("");
  const [submittedPromptIds, setSubmittedPromptIds] = useState<Set<string>>(
    new Set(),
  );
  const [submittingPromptId, setSubmittingPromptId] = useState<string | null>(
    null,
  );
  const [votingPromptIds, setVotingPromptIds] = useState<Set<string>>(
    new Set(),
  );
  const [votingBusy, setVotingBusy] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const rejoinAttempted = useRef(false);
  const phaseKeyRef = useRef("");

  // Reset transient state on phase change
  useEffect(() => {
    if (!gameState) return;
    const nextKey = `${gameState.status}:${gameState.currentRound}`;
    if (phaseKeyRef.current !== nextKey) {
      phaseKeyRef.current = nextKey;
      setActionError("");
      if (gameState.status !== "WRITING") {
        setResponseText("");
        setSubmittedPromptIds(new Set());
      }
      if (gameState.status !== "VOTING") {
        setVotingPromptIds(new Set());
      }
    }
  }, [gameState]);

  // Rejoin attempt
  useEffect(() => {
    if (!gameState || rejoinAttempted.current) return;
    if (!playerId) return;
    const inGame = gameState.players.some((p) => p.id === playerId);
    if (inGame) return;

    rejoinAttempted.current = true;
    const token =
      searchParams.get("rejoin") ?? localStorage.getItem("rejoinToken");
    if (!token) return;

    setReconnecting(true);
    fetch(`/api/games/${code}/rejoin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        localStorage.setItem("playerId", data.playerId);
        localStorage.setItem("playerName", data.playerName);
        localStorage.setItem("rejoinToken", token);
        if (data.playerType) localStorage.setItem("playerType", data.playerType);
        refresh();
      })
      .catch(() => {
        rejoinAttempted.current = false;
      })
      .finally(() => setReconnecting(false));
  }, [gameState, playerId, code, searchParams, refresh]);

  const isHost = !!(
    gameState &&
    playerId &&
    gameState.hostPlayerId === playerId
  );
  const activePlayerCount =
    gameState?.players.filter((p) => p.type !== "SPECTATOR").length ?? 0;

  // --- Actions ---

  async function postHostAction(path: "start" | "next") {
    const hostToken = localStorage.getItem("hostControlToken");
    if (!playerId && !hostToken) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Action failed");
      }
    } catch {
      setActionError("Something went wrong");
    } finally {
      setHostActionBusy(false);
    }
  }

  async function submitResponse(promptId: string) {
    if (!playerToken) return;
    const text = responseText.trim();
    if (!text) return;
    setSubmittingPromptId(promptId);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerToken, promptId, text }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to submit");
        return;
      }
      setSubmittedPromptIds((prev) => new Set(prev).add(promptId));
      setResponseText("");
    } catch {
      setActionError("Something went wrong");
    } finally {
      setSubmittingPromptId(null);
    }
  }

  async function castVote(promptId: string, responseId: string) {
    if (!playerToken) return;
    setVotingBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerToken, promptId, responseId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to vote");
        return;
      }
      setVotingPromptIds((prev) => new Set(prev).add(promptId));
    } catch {
      setActionError("Something went wrong");
    } finally {
      setVotingBusy(false);
    }
  }

  // --- Loading / Error states ---

  if (reconnecting) {
    return (
      <>
        <ChatControllerHeader roomCode={null} roundLabel={null} phase={null} />
        <main className="min-h-svh flex items-center justify-center px-6 pt-16">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-edge border-t-teal animate-spin" />
            <p className="text-ink-dim text-sm">Reconnecting...</p>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ChatControllerHeader roomCode={null} roundLabel={null} phase={null} />
        <main className="min-h-svh flex items-center justify-center px-6 pt-16">
          <p className="text-fail font-display font-bold text-xl">{error}</p>
        </main>
      </>
    );
  }

  if (!gameState) {
    return (
      <>
        <ChatControllerHeader roomCode={null} roundLabel={null} phase={null} />
        <main className="min-h-svh flex items-center justify-center px-6 pt-16">
          <div className="w-8 h-8 rounded-full border-2 border-edge border-t-teal animate-spin" />
        </main>
      </>
    );
  }

  // --- Render ---

  const roundLabel =
    gameState.status === "LOBBY"
      ? null
      : `R${gameState.currentRound}/${gameState.totalRounds}`;

  const writingPrompts = gameState.writing?.prompts ?? [];
  const allWritingDone =
    writingPrompts.length === 0 ||
    writingPrompts.every(
      (p) => p.submitted || submittedPromptIds.has(p.id),
    );

  const votingState = gameState.voting;
  const currentVotePrompt = votingState?.currentPrompt ?? null;
  const hasVotedCurrent = currentVotePrompt
    ? currentVotePrompt.hasVoted || votingPromptIds.has(currentVotePrompt.id)
    : false;

  const canHostAdvance =
    isHost &&
    (gameState.status === "WRITING" ||
      gameState.status === "VOTING" ||
      gameState.status === "ROUND_RESULTS");

  return (
    <>
      <ChatControllerHeader
        roomCode={gameState.roomCode}
        roundLabel={roundLabel}
        phase={gameState.status}
      />
      <main className="min-h-svh flex flex-col items-center px-4 pb-6 pt-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${gameState.status}:${gameState.currentRound}`}
            className="w-full max-w-md mt-4"
            variants={phaseTransition}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* ── LOBBY ── */}
            {gameState.status === "LOBBY" && (
              <div className="space-y-5">
                {/* Room code hero */}
                <div className="rounded-2xl bg-teal-soft/50 border border-teal/20 p-6 text-center">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-teal font-bold mb-2">
                    Room Code
                  </p>
                  <p className="font-mono text-4xl font-black tracking-[0.25em] text-teal">
                    {gameState.roomCode}
                  </p>
                </div>

                {/* Player roster */}
                <div className="text-center space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-sm text-ink-dim">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
                    <span className="font-medium">
                      {activePlayerCount} player
                      {activePlayerCount !== 1 ? "s" : ""} connected
                    </span>
                  </div>
                  <p className="text-xs text-ink-dim/70 leading-relaxed px-2">
                    {gameState.players.map((p) => p.name).join(" \u00B7 ")}
                  </p>
                </div>

                {/* Start / Waiting */}
                {isHost ? (
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      triggerElement(e.currentTarget);
                      void postHostAction("start");
                    }}
                    disabled={
                      hostActionBusy || activePlayerCount < MIN_PLAYERS
                    }
                    className="w-full bg-teal hover:bg-teal-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
                    {...buttonTapPrimary}
                  >
                    {hostActionBusy
                      ? "Starting..."
                      : activePlayerCount < MIN_PLAYERS
                        ? `Need ${MIN_PLAYERS - activePlayerCount} more`
                        : "Start Game"}
                  </motion.button>
                ) : (
                  <div className="text-center py-3">
                    <PulsingDot>Waiting for host to start...</PulsingDot>
                  </div>
                )}
              </div>
            )}

            {/* ── WRITING ── */}
            {gameState.status === "WRITING" && (
              <div className="space-y-4">
                {allWritingDone ? (
                  <CompletionCard
                    title="Submitted!"
                    subtitle="Waiting for everyone else..."
                  />
                ) : (
                  writingPrompts.map((prompt) => {
                    const isDone =
                      prompt.submitted || submittedPromptIds.has(prompt.id);
                    return (
                      <div key={prompt.id} className="space-y-3">
                        <PromptCard text={prompt.text} />
                        {isDone ? (
                          <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-win-soft/50 border border-win/20">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-win"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-sm text-win font-semibold">
                              Submitted
                            </span>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={responseText}
                              onChange={(e) => setResponseText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  void submitResponse(prompt.id);
                              }}
                              placeholder="Type your answer..."
                              maxLength={100}
                              className="flex-1 min-w-0 py-3.5 px-4 rounded-2xl bg-raised/80 border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-teal transition-colors"
                            />
                            <motion.button
                              type="button"
                              onClick={(e) => {
                                triggerElement(e.currentTarget);
                                void submitResponse(prompt.id);
                              }}
                              disabled={
                                submittingPromptId === prompt.id ||
                                !responseText.trim()
                              }
                              className="flex-none px-5 py-3.5 bg-teal hover:bg-teal-hover disabled:opacity-40 text-white rounded-2xl font-bold transition-colors cursor-pointer disabled:cursor-not-allowed"
                              {...buttonTap}
                            >
                              {submittingPromptId === prompt.id
                                ? "..."
                                : "Send"}
                            </motion.button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── VOTING ── */}
            {gameState.status === "VOTING" && (
              <div className="space-y-4">
                {(() => {
                  const statusCard = (children: React.ReactNode) => (
                    <div className="rounded-2xl border border-edge bg-surface/70 p-6 text-center">
                      {children}
                    </div>
                  );

                  if (gameState.votingRevealing) {
                    return statusCard(
                      <PulsingDot>Results are being calculated...</PulsingDot>,
                    );
                  }
                  if (!currentVotePrompt) {
                    return statusCard(
                      <PulsingDot>
                        Waiting for voting to start...
                      </PulsingDot>,
                    );
                  }
                  if (hasVotedCurrent) {
                    return statusCard(
                      <>
                        <PromptCard text={currentVotePrompt.text} />
                        <div className="mt-4">
                          <CompletionCard
                            title="Vote Cast"
                            subtitle="Waiting for other players..."
                          />
                        </div>
                      </>,
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <PromptCard text={currentVotePrompt.text} />
                      <p className="text-[11px] uppercase tracking-wider text-ink-dim font-semibold">
                        Pick the best answer
                      </p>
                      <motion.div
                        className="space-y-2.5"
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                      >
                        {currentVotePrompt.responses.map((resp) => (
                          <motion.button
                            key={resp.id}
                            type="button"
                            variants={floatIn}
                            onClick={(e) => {
                              triggerElement(e.currentTarget);
                              void castVote(currentVotePrompt.id, resp.id);
                            }}
                            disabled={votingBusy}
                            className="w-full text-left py-3.5 px-4 rounded-2xl border-2 border-edge bg-raised/60 hover:bg-surface hover:border-teal/50 active:scale-[0.98] text-ink transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            {...buttonTap}
                          >
                            <span className="text-[15px] leading-relaxed">
                              {resp.text}
                            </span>
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── ROUND_RESULTS / FINAL_RESULTS ── */}
            {(gameState.status === "ROUND_RESULTS" ||
              gameState.status === "FINAL_RESULTS") && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-edge bg-surface/70 p-6 text-center">
                  <p className="font-display font-bold text-lg text-ink mb-2">
                    {gameState.status === "FINAL_RESULTS"
                      ? "Game Over"
                      : `Round ${gameState.currentRound} Complete`}
                  </p>
                  <PulsingDot>
                    {gameState.status === "FINAL_RESULTS"
                      ? "Check the main screen for final standings."
                      : "Round results are on the main screen."}
                  </PulsingDot>
                </div>

                {isHost && gameState.status === "ROUND_RESULTS" ? (
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      triggerElement(e.currentTarget);
                      void postHostAction("next");
                    }}
                    disabled={hostActionBusy}
                    className="w-full bg-teal hover:bg-teal-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
                    {...buttonTapPrimary}
                  >
                    {hostActionBusy
                      ? "Advancing..."
                      : gameState.currentRound >= gameState.totalRounds
                        ? "Finish Game"
                        : "Next Round"}
                  </motion.button>
                ) : (
                  <div className="text-center py-2">
                    <PulsingDot>
                      {gameState.status === "FINAL_RESULTS"
                        ? "Waiting for the next game..."
                        : "Waiting for host to continue..."}
                    </PulsingDot>
                  </div>
                )}

                {gameState.status === "FINAL_RESULTS" && (
                  <Link
                    href="/join"
                    className="block text-center py-3 rounded-2xl border border-edge text-ink-dim hover:text-ink hover:bg-surface/60 transition-colors"
                  >
                    Join Another Game
                  </Link>
                )}
              </div>
            )}

            {/* ── Host force-advance (writing/voting) ── */}
            {canHostAdvance &&
              (gameState.status === "WRITING" ||
                gameState.status === "VOTING") && (
                <div className="mt-5 pt-4 border-t border-edge/50">
                  <motion.button
                    type="button"
                    onClick={() => void postHostAction("next")}
                    disabled={hostActionBusy}
                    className="w-full py-3 rounded-2xl border-2 border-dashed border-teal/30 text-teal/80 hover:text-teal hover:border-teal/50 hover:bg-teal/5 font-display font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    {...buttonTap}
                  >
                    {hostActionBusy ? "Working..." : "Force Advance"}
                  </motion.button>
                </div>
              )}

            <ErrorBanner error={actionError} className="mt-4" />
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}
