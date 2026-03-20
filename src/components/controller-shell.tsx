"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { CompletionCard } from "@/components/completion-card";
import { PulsingDot } from "@/components/pulsing-dot";
import { fadeInUp, buttonTap, buttonTapPrimary } from "@/lib/animations";
import { MIN_PLAYERS, VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS, ROUND_RESULTS_SECONDS } from "@/games/sloplash/game-constants";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useControllerStream } from "@/hooks/use-controller-stream";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { getPlayerId, getPlayerToken, noopSubscribe } from "@/lib/client-session";

function ControllerHeader({
  roomCode,
  roundLabel,
}: {
  roomCode: string | null;
  roundLabel: string | null;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 pl-4 pr-16 py-2.5 flex items-center justify-between bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-display font-bold text-xs text-punch tracking-tight hover:text-punch-hover transition-colors">
          SLOP-LASH
        </Link>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
          {roomCode ?? "...."}
        </span>
      </div>
      <span className="text-xs text-ink-dim">{roundLabel ?? "Controller"}</span>
    </div>
  );
}

export function ControllerShell({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const { triggerElement } = usePixelDissolve();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const playerToken = useSyncExternalStore(noopSubscribe, getPlayerToken, () => null);
  const { gameState, error, refresh } = useControllerStream(code, playerToken);
  useScreenWakeLock(gameState != null);

  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submittedPromptIds, setSubmittedPromptIds] = useState<Set<string>>(new Set());
  const [submittingPromptId, setSubmittingPromptId] = useState<string | null>(null);
  const [votingPromptIds, setVotingPromptIds] = useState<Set<string>>(new Set());
  const [votingBusy, setVotingBusy] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const rejoinAttempted = useRef(false);
  const phaseKeyRef = useRef<string>("");

  useEffect(() => {
    if (!gameState) return;
    const nextKey = `${gameState.status}:${gameState.currentRound}:${gameState.votingPromptIndex}:${gameState.votingRevealing ? 1 : 0}`;
    if (phaseKeyRef.current !== nextKey) {
      phaseKeyRef.current = nextKey;
      setActionError("");
      if (gameState.status !== "WRITING") {
        setResponses({});
        setSubmittedPromptIds(new Set());
      }
      if (gameState.status !== "VOTING") {
        setVotingPromptIds(new Set());
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (!gameState || rejoinAttempted.current) return;
    const localPlayer = playerId
      ? gameState.players.find((p) => p.id === playerId)
      : null;
    const needsRejoin =
      playerId == null ||
      localPlayer == null ||
      localPlayer.participationStatus === "DISCONNECTED";
    if (!needsRejoin) return;

    rejoinAttempted.current = true;
    const token = searchParams.get("rejoin") ?? localStorage.getItem("rejoinToken");
    if (!token) {
      rejoinAttempted.current = false;
      return;
    }

    setReconnecting(true);
    fetch(`/api/games/${code}/rejoin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          rejoinAttempted.current = false;
          return;
        }
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

  const isHost = !!(gameState && playerId && gameState.hostPlayerId === playerId);
  const activePlayerCount = gameState?.players.filter((p) => p.type !== "SPECTATOR").length ?? 0;

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
    const text = responses[promptId]?.trim();
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
    } catch {
      setActionError("Something went wrong");
    } finally {
      setSubmittingPromptId(null);
    }
  }

  async function castVote(promptId: string, responseId: string | null) {
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

  if (reconnecting) {
    return (
      <>
        <ControllerHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
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
        <ControllerHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <p className="text-fail font-display font-bold text-xl">{error}</p>
        </main>
      </>
    );
  }

  if (!gameState) {
    return (
      <>
        <ControllerHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <div className="w-8 h-8 rounded-full border-2 border-edge border-t-teal animate-spin" />
        </main>
      </>
    );
  }

  const roundLabel =
    gameState.status === "LOBBY"
      ? "Controller"
      : `Round ${gameState.currentRound}/${gameState.totalRounds}`;
  const isDisplayOnlyHostMode = gameState.hostPlayerId == null;
  const isAutoAdvancingResults =
    gameState.status === "ROUND_RESULTS" &&
    isDisplayOnlyHostMode &&
    !gameState.timersDisabled &&
    gameState.phaseDeadline != null;

  const showTimer = !gameState.timersDisabled && (gameState.status === "WRITING" || gameState.status === "VOTING");
  const canHostAdvance =
    isHost &&
    (gameState.status === "WRITING" || gameState.status === "VOTING" || gameState.status === "ROUND_RESULTS");

  const writingPrompts = gameState.writing?.prompts ?? [];
  const allWritingDone =
    writingPrompts.length === 0 ||
    writingPrompts.every((p) => p.submitted || submittedPromptIds.has(p.id));

  const votingState = gameState.voting;
  const currentVotePrompt = votingState?.currentPrompt ?? null;
  const hasVotedCurrent = currentVotePrompt
    ? currentVotePrompt.hasVoted || votingPromptIds.has(currentVotePrompt.id)
    : false;

  return (
    <>
      <ControllerHeader roomCode={gameState.roomCode} roundLabel={roundLabel} />
      <main className="min-h-svh flex flex-col items-center px-4 py-6 pt-16">
        <motion.div
          className="w-full max-w-md"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <div className="mb-4 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">
              {gameState.status === "LOBBY" && "Lobby"}
              {gameState.status === "WRITING" && "Write"}
              {gameState.status === "VOTING" && "Vote"}
              {gameState.status === "ROUND_RESULTS" && "Round Results"}
              {gameState.status === "FINAL_RESULTS" && "Game Over"}
            </h1>
            <p className="text-xs text-ink-dim mt-1">
              {isHost ? "Host controller" : "Player controller"}
            </p>
          </div>

          {showTimer && (
            <div className="mb-4">
              <Timer
                deadline={gameState.phaseDeadline}
                total={
                  gameState.status === "VOTING"
                    ? (gameState.votingRevealing ? REVEAL_SECONDS : VOTE_PER_PROMPT_SECONDS)
                    : undefined
                }
              />
            </div>
          )}

          {gameState.status === "LOBBY" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-edge bg-surface/70 p-4">
                <p className="text-sm text-ink-dim mb-2">Players</p>
                <p className="font-mono text-lg text-ink">
                  {activePlayerCount} active
                </p>
                <p className="text-xs text-ink-dim mt-2">
                  {gameState.players.map((p) => p.name).join(", ")}
                </p>
              </div>
              {isHost ? (
                <motion.button
                  type="button"
                  onClick={(e) => {
                    triggerElement(e.currentTarget);
                    void postHostAction("start");
                  }}
                  disabled={hostActionBusy || activePlayerCount < MIN_PLAYERS}
                  className="w-full bg-teal/90 hover:bg-teal-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                  {...buttonTapPrimary}
                >
                  {hostActionBusy ? "Starting..." : activePlayerCount < MIN_PLAYERS ? `Need ${MIN_PLAYERS - activePlayerCount} more` : "Start Game"}
                </motion.button>
              ) : (
                <div className="text-center py-3">
                  <PulsingDot>
                    {isDisplayOnlyHostMode
                      ? "Waiting for the host to start the game..."
                      : "Waiting for host to start..."}
                  </PulsingDot>
                </div>
              )}
            </div>
          )}

          {gameState.status === "WRITING" && (
            <div className="space-y-4">
              {(() => {
                if (allWritingDone) {
                  return (
                    <CompletionCard
                      title="Submitted!"
                      subtitle="Waiting for everyone else..."
                    />
                  );
                }
                return writingPrompts.map((prompt) => {
                  const isDone = prompt.submitted || submittedPromptIds.has(prompt.id);
                  return (
                    <div key={prompt.id} className="rounded-xl border border-edge bg-surface/70 p-4">
                      <p className="font-display font-semibold text-base text-gold mb-3">
                        {prompt.text}
                      </p>
                      {isDone ? (
                        <p className="text-sm text-win font-medium">Submitted</p>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={responses[prompt.id] ?? ""}
                            onChange={(e) =>
                              setResponses((prev) => ({ ...prev, [prompt.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void submitResponse(prompt.id);
                            }}
                            placeholder="Your answer..."
                            maxLength={100}
                            className="w-full py-3 px-4 rounded-xl bg-raised/80 border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
                          />
                          <motion.button
                            type="button"
                            onClick={(e) => {
                              triggerElement(e.currentTarget);
                              void submitResponse(prompt.id);
                            }}
                            disabled={submittingPromptId === prompt.id || !responses[prompt.id]?.trim()}
                            className="w-full py-3 bg-punch/90 hover:bg-punch-hover disabled:opacity-50 text-white rounded-xl font-bold transition-colors cursor-pointer disabled:cursor-not-allowed"
                            {...buttonTap}
                          >
                            {submittingPromptId === prompt.id ? "Sending..." : "Send"}
                          </motion.button>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {gameState.status === "VOTING" && (
            <div className="space-y-4">
              {(() => {
                const statusCard = (children: React.ReactNode) => (
                  <div className="rounded-xl border border-edge bg-surface/70 p-5 text-center">{children}</div>
                );

                if (gameState.votingRevealing) {
                  return statusCard(<PulsingDot>Results are revealing on the main screen...</PulsingDot>);
                }
                if (!currentVotePrompt) {
                  return statusCard(<PulsingDot>Waiting for the next matchup...</PulsingDot>);
                }
                if (currentVotePrompt.isRespondent) {
                  return statusCard(
                    <>
                      <p className="font-display font-semibold text-gold mb-2">{currentVotePrompt.text}</p>
                      <PulsingDot>You wrote one of these. Waiting...</PulsingDot>
                    </>
                  );
                }
                if (hasVotedCurrent) {
                  return statusCard(
                    <>
                      <p className="font-display font-semibold text-gold mb-2">{currentVotePrompt.text}</p>
                      <CompletionCard title="Vote Cast" subtitle="Waiting for other players..." />
                    </>
                  );
                }

                const totalPrompts = Math.max(votingState?.totalPrompts ?? 1, 1);
                return (
                  <div className="rounded-xl border border-edge bg-surface/70 p-4">
                    <p className="text-xs uppercase tracking-wider text-ink-dim mb-2">
                      Prompt {Math.min(gameState.votingPromptIndex + 1, totalPrompts)}/{totalPrompts}
                    </p>
                    <p className="font-display font-semibold text-lg text-gold mb-4">
                      {currentVotePrompt.text}
                    </p>
                    <div className="space-y-2">
                      {currentVotePrompt.responses.map((resp) => (
                        <motion.button
                          key={resp.id}
                          type="button"
                          onClick={(e) => {
                            triggerElement(e.currentTarget);
                            void castVote(currentVotePrompt.id, resp.id);
                          }}
                          disabled={votingBusy}
                          className="w-full text-left py-3 px-4 rounded-xl border-2 border-edge bg-raised/80 hover:bg-surface hover:border-edge-strong text-ink transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          {...buttonTap}
                        >
                          {resp.text}
                        </motion.button>
                      ))}
                      <motion.button
                        type="button"
                        onClick={() => void castVote(currentVotePrompt.id, null)}
                        disabled={votingBusy}
                        className="w-full py-2.5 rounded-xl border border-edge text-ink-dim hover:text-ink hover:bg-surface transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        {...buttonTap}
                      >
                        Pass
                      </motion.button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {(gameState.status === "ROUND_RESULTS" || gameState.status === "FINAL_RESULTS") && (
            <div className="space-y-4">
              <div className="rounded-xl border border-edge bg-surface/70 p-5 text-center">
                <PulsingDot>
                  {gameState.status === "FINAL_RESULTS"
                    ? "Check the main screen for final standings."
                    : "Round results are on the main screen."}
                </PulsingDot>
              </div>

              {isAutoAdvancingResults && (
                <div className="rounded-xl border border-edge bg-surface/70 p-4 text-center">
                  <p className="mb-2 text-xs uppercase tracking-wider text-ink-dim">
                    TV Mode Auto-Advance
                  </p>
                  <Timer
                    deadline={gameState.phaseDeadline}
                    total={ROUND_RESULTS_SECONDS}
                  />
                  <p className="mt-2 text-xs text-ink-dim">
                    {gameState.currentRound >= gameState.totalRounds
                      ? "The game will finish automatically when the countdown ends."
                      : "The next round will start automatically when the countdown ends."}
                  </p>
                </div>
              )}

              {isHost && gameState.status === "ROUND_RESULTS" ? (
                <motion.button
                  type="button"
                  onClick={(e) => {
                    triggerElement(e.currentTarget);
                    void postHostAction("next");
                  }}
                  disabled={hostActionBusy}
                  className="w-full bg-punch/90 hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                  {...buttonTapPrimary}
                >
                  {hostActionBusy ? "Advancing..." : (gameState.currentRound >= gameState.totalRounds ? "Finish Game" : "Next Round")}
                </motion.button>
              ) : (
                <div className="text-center py-2">
                  <PulsingDot>
                    {gameState.status === "FINAL_RESULTS"
                      ? "Waiting for the next game..."
                      : isAutoAdvancingResults
                        ? (gameState.currentRound >= gameState.totalRounds
                          ? "Waiting for the game to finish automatically..."
                          : "Waiting for the next round to start automatically...")
                        : "Waiting for host to continue..."}
                  </PulsingDot>
                </div>
              )}

              {gameState.status === "FINAL_RESULTS" && (
                <div className="grid grid-cols-1 gap-2">
                  <Link
                    href={`/game/${code}/recap`}
                    className="block text-center py-3 rounded-xl border border-edge bg-surface/60 hover:bg-surface text-ink transition-colors"
                  >
                    View Recap
                  </Link>
                  <Link
                    href="/join"
                    className="block text-center py-3 rounded-xl border border-edge text-ink-dim hover:text-ink hover:bg-surface/60 transition-colors"
                  >
                    Join Another Game
                  </Link>
                </div>
              )}
            </div>
          )}

          {canHostAdvance && (gameState.status === "WRITING" || gameState.status === "VOTING") && (
            <div className="mt-4">
              <motion.button
                type="button"
                onClick={() => void postHostAction("next")}
                disabled={hostActionBusy}
                className="w-full py-2.5 rounded-xl border border-edge text-ink-dim hover:text-ink hover:bg-surface transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                {...buttonTap}
              >
                {hostActionBusy ? "Working..." : (gameState.timersDisabled ? "Advance" : "Skip Timer")}
              </motion.button>
            </div>
          )}

          <ErrorBanner error={actionError} className="mt-4" />
        </motion.div>
      </main>
    </>
  );
}
