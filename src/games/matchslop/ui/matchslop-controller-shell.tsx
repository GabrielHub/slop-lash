"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { CompletionCard } from "@/components/completion-card";
import { PulsingDot } from "@/components/pulsing-dot";
import { fadeInUp, buttonTap, buttonTapPrimary } from "@/lib/animations";
import { useControllerStream } from "@/hooks/use-controller-stream";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import type { MatchSlopProfilePromptOption } from "@/lib/controller-types";

function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

const noopSubscribe = () => () => {};

function identityLabel(value: string | null | undefined) {
  switch (value) {
    case "MAN":
      return "Man";
    case "WOMAN":
      return "Woman";
    case "NON_BINARY":
      return "Non-binary";
    case "OTHER":
      return "Other";
    default:
      return value ?? "Unknown";
  }
}

function outcomeLabel(value: string | null | undefined) {
  switch (value) {
    case "DATE_SEALED":
      return "Date sealed";
    case "UNMATCHED":
      return "Unmatched";
    case "TURN_LIMIT":
      return "Turn limit";
    default:
      return "In progress";
  }
}

function MatchHeader({
  roomCode,
  roundLabel,
}: {
  roomCode: string | null;
  roundLabel: string | null;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 px-4 py-2.5 flex items-center justify-between bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-display font-bold text-xs text-punch tracking-tight hover:text-punch-hover transition-colors">
          MATCHSLOP
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

function ProfilePromptCard({
  option,
  selected,
  onSelect,
}: {
  option: MatchSlopProfilePromptOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border-2 px-4 py-3 text-left transition-colors cursor-pointer ${
        selected
          ? "bg-punch/10 border-punch"
          : "bg-surface/80 border-edge hover:border-edge-strong"
      }`}
      {...buttonTap}
    >
      <p className={`text-sm font-semibold ${selected ? "text-punch" : "text-ink"}`}>
        {option.prompt}
      </p>
      {option.answer && (
        <p className="text-xs text-ink-dim mt-1">
          Answer: {option.answer}
        </p>
      )}
    </motion.button>
  );
}

export function MatchSlopControllerShell({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const { triggerElement } = usePixelDissolve();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const { gameState, error, refresh } = useControllerStream(code, playerId);

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [submittedPromptIds, setSubmittedPromptIds] = useState<Set<string>>(new Set());
  const [submittingPromptId, setSubmittingPromptId] = useState<string | null>(null);
  const [votingPromptIds, setVotingPromptIds] = useState<Set<string>>(new Set());
  const [votingBusy, setVotingBusy] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const rejoinAttempted = useRef(false);
  const phaseKeyRef = useRef("");

  useEffect(() => {
    if (!gameState) return;
    const nextKey = `${gameState.status}:${gameState.currentRound}:${gameState.votingPromptIndex}:${gameState.votingRevealing ? 1 : 0}`;
    if (phaseKeyRef.current !== nextKey) {
      phaseKeyRef.current = nextKey;
      setActionError("");
      if (gameState.status !== "WRITING") {
        setResponseText("");
        setSubmittedPromptIds(new Set());
        setSelectedPromptId(null);
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
  const matchslop = gameState?.matchslop ?? null;
  const promptOptions = matchslop?.writing?.openerOptions ?? [];
  const openerPromptById = new Map(
    (matchslop?.profile?.prompts ?? []).map((prompt) => [prompt.id, prompt.prompt]),
  );
  const firstPromptOptionId = promptOptions[0]?.id ?? null;
  const currentVotePrompt = gameState?.voting?.currentPrompt ?? null;
  const hasVotedCurrent = currentVotePrompt
    ? currentVotePrompt.hasVoted || votingPromptIds.has(currentVotePrompt.id)
    : false;
  const hasSubmittedCurrent = matchslop?.writing?.submitted || (matchslop?.writing?.promptId ? submittedPromptIds.has(matchslop.writing.promptId) : false);

  useEffect(() => {
    if (!selectedPromptId && firstPromptOptionId) {
      setSelectedPromptId(firstPromptOptionId);
    }
  }, [firstPromptOptionId, selectedPromptId]);

  async function postHostAction(path: "start" | "next" | "end") {
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
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Action failed");
      }
    } catch {
      setActionError("Something went wrong");
    } finally {
      setHostActionBusy(false);
    }
  }

  async function submitResponse(promptId: string) {
    if (!playerId) return;
    const text = responseText.trim();
    if (!text) return;
    setSubmittingPromptId(promptId);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          promptId,
          text,
          metadata: selectedPromptId ? { selectedPromptId } : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to submit");
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

  async function castVote(promptId: string, responseId: string | null) {
    if (!playerId) return;
    setVotingBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: playerId, promptId, responseId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to vote");
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
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-edge border-t-punch animate-spin" />
            <p className="text-ink-dim text-sm">Reconnecting...</p>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <p className="text-fail font-display font-bold text-xl">{error}</p>
        </main>
      </>
    );
  }

  if (!gameState) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <div className="w-8 h-8 rounded-full border-2 border-edge border-t-punch animate-spin" />
        </main>
      </>
    );
  }

  const roundLabel =
    gameState.status === "LOBBY"
      ? "Controller"
      : `Round ${gameState.currentRound}/${gameState.totalRounds}`;
  const canHostAdvance =
    isHost &&
    (gameState.status === "WRITING" ||
      gameState.status === "VOTING" ||
      gameState.status === "ROUND_RESULTS");

  return (
    <>
      <MatchHeader roomCode={gameState.roomCode} roundLabel={roundLabel} />
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
              {matchslop?.seekerIdentity || matchslop?.personaIdentity
                ? `${identityLabel(matchslop?.seekerIdentity)} looking for ${identityLabel(matchslop?.personaIdentity)}`
                : "MatchSlop controller"}
            </p>
          </div>

          {gameState.phaseDeadline && !gameState.timersDisabled && (
            <div className="mb-4">
              <Timer deadline={gameState.phaseDeadline} />
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-2xl border border-edge bg-surface/70 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-dim mb-2">
                Persona
              </p>
              <p className="font-display text-lg font-bold text-ink">
                {matchslop?.profile?.displayName ?? "Waiting for persona"}
              </p>
              <p className="text-sm text-ink-dim mt-1">
                {matchslop?.outcome ? outcomeLabel(matchslop.outcome) : "In progress"}
              </p>
            </div>

            <div className="rounded-2xl border border-edge bg-surface/70 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-dim mb-2">
                Transcript
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {(matchslop?.transcript ?? []).length > 0 ? (
                  (matchslop?.transcript ?? []).map((entry, index) => (
                    <div key={entry.id ?? `${entry.turn ?? index}-${index}`} className="rounded-xl border border-edge bg-base/80 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                          {entry.speaker === "PERSONA" ? "Persona" : entry.authorName ?? "Players"}
                        </span>
                        <span className="text-[10px] font-mono text-ink-dim">
                          Turn {entry.turn ?? index + 1}
                        </span>
                      </div>
                      <p className="text-sm text-ink leading-relaxed">
                        {entry.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-ink-dim">
                    Transcript will fill in as the conversation starts.
                  </p>
                )}
              </div>
            </div>

            {gameState.status === "LOBBY" && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-teal-soft/50 border border-teal/20 p-6 text-center">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-teal font-bold mb-2">
                    Room Code
                  </p>
                  <p className="font-mono text-4xl font-black tracking-[0.25em] text-teal">
                    {gameState.roomCode}
                  </p>
                </div>
                <div className="text-center space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-sm text-ink-dim">
                    <span className="w-1.5 h-1.5 rounded-full bg-punch animate-pulse" />
                    <span className="font-medium">
                      {activePlayerCount} player{activePlayerCount !== 1 ? "s" : ""} connected
                    </span>
                  </div>
                  <p className="text-xs text-ink-dim/70 leading-relaxed px-2">
                    {gameState.players.map((p) => p.name).join(" · ")}
                  </p>
                </div>
                {isHost ? (
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      triggerElement(e.currentTarget);
                      void postHostAction("start");
                    }}
                    disabled={hostActionBusy || activePlayerCount < 2}
                    className="w-full bg-punch hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
                    {...buttonTapPrimary}
                  >
                    {hostActionBusy
                      ? "Starting..."
                      : activePlayerCount < 2
                        ? "Need more players"
                        : "Start Game"}
                  </motion.button>
                ) : (
                  <div className="text-center py-3">
                    <PulsingDot>Waiting for the TV screen to start the game...</PulsingDot>
                  </div>
                )}
              </div>
            )}

            {gameState.status === "WRITING" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-edge bg-surface/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-ink-dim mb-2">
                    Writing context
                  </p>
                  <p className="font-display font-semibold text-lg text-punch leading-snug">
                    {matchslop?.writing?.text ?? "Pick a prompt and send the funniest opener."}
                  </p>
                </div>

                {matchslop?.writing?.openerOptions && matchslop.writing.openerOptions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-ink-dim font-semibold">
                      Pick a profile prompt
                    </p>
                    <div className="space-y-2">
                      {matchslop.writing.openerOptions.map((option) => (
                        <ProfilePromptCard
                          key={option.id}
                          option={option}
                          selected={selectedPromptId === option.id}
                          onSelect={() => setSelectedPromptId(option.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {hasSubmittedCurrent ? (
                  <CompletionCard title="Submitted!" subtitle="Waiting for everyone else to write." />
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && matchslop?.writing?.promptId) {
                          void submitResponse(matchslop.writing.promptId);
                        }
                      }}
                      placeholder="Type your funniest opener..."
                      maxLength={100}
                      className="w-full py-3.5 px-4 rounded-2xl bg-raised/80 border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
                    />
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        triggerElement(e.currentTarget);
                        if (matchslop?.writing?.promptId) {
                          void submitResponse(matchslop.writing.promptId);
                        }
                      }}
                      disabled={!responseText.trim() || !matchslop?.writing?.promptId || submittingPromptId === matchslop.writing.promptId}
                      className="w-full py-3 bg-punch/90 hover:bg-punch-hover disabled:opacity-50 text-white rounded-2xl font-bold transition-colors cursor-pointer disabled:cursor-not-allowed"
                      {...buttonTap}
                    >
                      {submittingPromptId === matchslop?.writing?.promptId ? "Sending..." : "Send"}
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            {gameState.status === "VOTING" && (
              <div className="space-y-4">
                {gameState.votingRevealing ? (
                  <CompletionCard title="Revealing" subtitle="The main screen is calculating results." />
                ) : !currentVotePrompt ? (
                  <CompletionCard title="Waiting" subtitle="The next ballot is not ready yet." />
                ) : hasVotedCurrent ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-edge bg-surface/70 p-4">
                      <p className="font-display font-semibold text-lg text-punch mb-2">
                        {currentVotePrompt.text}
                      </p>
                      <PulsingDot>Vote cast. Waiting on other players...</PulsingDot>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-edge bg-surface/70 p-4">
                      <p className="text-xs uppercase tracking-wider text-ink-dim mb-2">
                        Vote for the funniest line
                      </p>
                      <p className="font-display font-semibold text-lg text-punch mb-1">
                        {currentVotePrompt.text}
                      </p>
                      <p className="text-xs text-ink-dim">
                        Human votes count double.
                      </p>
                    </div>
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
                          className="w-full text-left py-3 px-4 rounded-2xl border-2 border-edge bg-raised/80 hover:bg-surface hover:border-edge-strong text-ink transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          {...buttonTap}
                        >
                          {resp.openerPromptId && openerPromptById.get(resp.openerPromptId) && (
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-punch/80">
                              {openerPromptById.get(resp.openerPromptId)}
                            </span>
                          )}
                          <span className="text-[15px] leading-relaxed">
                            {resp.text}
                          </span>
                        </motion.button>
                      ))}
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          triggerElement(e.currentTarget);
                          void castVote(currentVotePrompt.id, null);
                        }}
                        disabled={votingBusy}
                        className="w-full py-2.5 rounded-2xl border border-edge text-ink-dim hover:text-ink hover:bg-surface/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        {...buttonTap}
                      >
                        Pass
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(gameState.status === "ROUND_RESULTS" || gameState.status === "FINAL_RESULTS") && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-edge bg-surface/70 p-5 text-center">
                  <p className="font-display font-bold text-lg text-ink mb-2">
                    {gameState.status === "FINAL_RESULTS"
                      ? "Game Over"
                      : `Round ${gameState.currentRound} Complete`}
                  </p>
                  <PulsingDot>
                    {gameState.status === "FINAL_RESULTS"
                      ? "Check the main screen for the final transcript."
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
                    className="w-full bg-punch/90 hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                    {...buttonTapPrimary}
                  >
                    {hostActionBusy ? "Advancing..." : "Next Round"}
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

            {canHostAdvance && (gameState.status === "WRITING" || gameState.status === "VOTING") && (
              <div className="mt-5 pt-4 border-t border-edge/50">
                <motion.button
                  type="button"
                  onClick={(e) => {
                    triggerElement(e.currentTarget);
                    void postHostAction("next");
                  }}
                  disabled={hostActionBusy}
                  className="w-full py-3 rounded-2xl border-2 border-dashed border-punch/30 text-punch/80 hover:text-punch hover:border-punch/50 hover:bg-punch/5 font-display font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  {...buttonTap}
                >
                  {hostActionBusy ? "Working..." : "Force Advance"}
                </motion.button>
              </div>
            )}

            <AnimatePresence>
              {actionError && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <ErrorBanner error={actionError} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>
    </>
  );
}
