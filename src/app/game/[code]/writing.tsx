"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameState } from "@/lib/types";
import { Timer } from "@/components/timer";
import { CompletionCard } from "@/components/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import {
  fadeInUp,
  floatIn,
  popIn,
  staggerContainer,
  buttonTap,
} from "@/lib/animations";
import { playSound } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";

/** Inline character counter that appears as input approaches the limit. */
function CharCount({ length, max, threshold, show }: { length: number; max: number; threshold: number; show: boolean }) {
  if (!show || length < threshold) return null;
  return (
    <span className={`text-xs tabular-nums shrink-0 pt-0.5 ${length >= max ? "text-punch" : "text-ink-dim/50"}`}>
      {length}/{max}
    </span>
  );
}

function getSkipButtonText(
  skipping: boolean,
  timersDisabled: boolean,
  phase: string
): string {
  if (skipping) return "Skipping...";
  if (timersDisabled) return `End ${phase}`;
  return "Skip Timer";
}

export function Writing({
  game,
  playerId,
  code,
  isHost,
  isSpectator = false,
  forceStageView = false,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
  isHost: boolean;
  isSpectator?: boolean;
  forceStageView?: boolean;
}) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");
  const { triggerElement } = usePixelDissolve();

  const currentRound = game.rounds[0];
  const myPrompts = useMemo(() => {
    if (!currentRound || !playerId) return [];
    return currentRound.prompts.filter((p) =>
      p.assignments.some((a) => a.playerId === playerId)
    );
  }, [currentRound, playerId]);

  const alreadyAnswered = useMemo(() => {
    if (!currentRound || !playerId) return new Set<string>();
    const set = new Set<string>();
    for (const prompt of currentRound.prompts) {
      if (prompt.responses.some((r) => r.playerId === playerId)) {
        set.add(prompt.id);
      }
    }
    return set;
  }, [currentRound, playerId]);

  useEffect(() => {
    if (game.status !== "WRITING") {
      setSkipping(false);
    }
  }, [game.status]);

  async function submitResponse(promptId: string) {
    const text = responses[promptId];
    if (!text?.trim()) return;

    setSubmitting(promptId);
    setError("");

    try {
      const res = await fetch(`/api/games/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, promptId, text: text.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit");
        return;
      }

      playSound("submitted");
      setSubmitted((prev) => new Set(prev).add(promptId));
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(null);
    }
  }

  async function skipTimer() {
    const hostToken = localStorage.getItem("hostControlToken");
    setSkipping(true);
    setError("");
    let keepPending = false;
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to skip");
      } else {
        keepPending = true;
      }
    } catch {
      setError("Something went wrong");
    } finally {
      if (!keepPending) {
        setSkipping(false);
      }
    }
  }

  const player = game.players.find((p) => p.id === playerId);
  const isAI = player?.type === "AI";

  if (forceStageView) {
    return (
      <main className="flex-1 flex flex-col items-center px-6 py-12">
        <motion.div
          className="w-full max-w-lg"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <div className="text-center mb-6">
            <h1 className="font-display text-3xl font-bold mb-3 text-ink">
              Round {game.currentRound}
            </h1>
            <PulsingDot>Players are writing their answers...</PulsingDot>
          </div>
          {!game.timersDisabled && (
            <div className="mb-6">
              <Timer deadline={game.phaseDeadline} />
            </div>
          )}
          {isHost && (
            <motion.button
              onClick={skipTimer}
              disabled={skipping}
              className="w-full py-2 text-sm font-medium text-ink-dim hover:text-ink bg-raised/80 backdrop-blur-sm hover:bg-surface border border-edge rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              {...buttonTap}
            >
              {getSkipButtonText(skipping, game.timersDisabled, "Writing")}
            </motion.button>
          )}
        </motion.div>
      </main>
    );
  }

  if (isSpectator) {
    // Spectator: read-only view of all prompts with assignments
    const allPrompts = currentRound?.prompts ?? [];
    const playerById = new Map(game.players.map((p) => [p.id, p]));
    return (
      <main className="flex-1 flex flex-col items-center px-6 py-12">
        <motion.div
          className="w-full max-w-lg"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              Round {game.currentRound}
            </h1>
            <p className="text-ink-dim text-sm mt-1">Watching players write...</p>
          </div>
          {!game.timersDisabled && (
            <div className="mb-6">
              <Timer deadline={game.phaseDeadline} />
            </div>
          )}
          <div className="space-y-4">
            {allPrompts.map((prompt) => {
              const assigned = prompt.assignments
                .map((a) => playerById.get(a.playerId)?.name ?? "?")
                .join(" vs ");
              return (
                <div
                  key={prompt.id}
                  className="p-4 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <p className="font-display font-semibold text-base text-gold mb-2">
                    {prompt.text}
                  </p>
                  <p className="text-xs text-ink-dim">{assigned}</p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </main>
    );
  }

  if (isAI || !playerId) {
    return (
      <main className="flex-1 flex flex-col items-center px-6 py-12">
        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <h1 className="font-display text-3xl font-bold mb-3 text-ink">
            Round {game.currentRound}
          </h1>
          <PulsingDot>Players are writing their answers...</PulsingDot>
        </motion.div>
      </main>
    );
  }

  const allDone =
    myPrompts.length === 0 ||
    myPrompts.every(
      (p) => submitted.has(p.id) || alreadyAnswered.has(p.id)
    );

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12">
      <motion.div
        className="w-full max-w-lg"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Round {game.currentRound}
          </h1>
          <p className="text-ink-dim text-sm mt-1">
            Write your funniest answers
          </p>
        </div>

        {/* Timer */}
        <div className="mb-8">
          {!game.timersDisabled && (
            <Timer deadline={game.phaseDeadline} />
          )}
          {isHost && (
            <motion.button
              onClick={skipTimer}
              disabled={skipping}
              className={`${game.timersDisabled ? "" : "mt-3 "}w-full py-2 text-sm font-medium text-ink-dim hover:text-ink bg-raised/80 backdrop-blur-sm hover:bg-surface border border-edge rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
              {...buttonTap}
            >
              {getSkipButtonText(skipping, game.timersDisabled, "Writing")}
            </motion.button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {allDone ? (
            <CompletionCard
              title="All submitted!"
              subtitle="Waiting for other players to finish..."
            />
          ) : (
            <motion.div
              key="prompts"
              className="space-y-5"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {myPrompts.map((prompt) => {
                const isDone =
                  submitted.has(prompt.id) || alreadyAnswered.has(prompt.id);
                return (
                  <motion.div
                    key={prompt.id}
                    className={`p-4 sm:p-5 rounded-xl border-2 transition-colors ${
                      isDone
                        ? "bg-win-soft/80 backdrop-blur-md border-win/30"
                        : "bg-surface/80 backdrop-blur-md border-edge"
                    }`}
                    style={{ boxShadow: isDone ? undefined : "var(--shadow-card)" }}
                    variants={floatIn}
                    layout
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="font-display font-semibold text-base sm:text-lg leading-snug text-ink">
                        {prompt.text}
                      </p>
                      <CharCount length={responses[prompt.id]?.length ?? 0} max={100} threshold={80} show={!isDone} />
                    </div>
                    <AnimatePresence mode="wait">
                      {isDone ? (
                        <motion.div
                          key="submitted"
                          className="flex items-center gap-1.5 text-win text-sm font-medium"
                          variants={popIn}
                          initial="hidden"
                          animate="visible"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Submitted
                        </motion.div>
                      ) : (
                        <motion.div
                          key="input"
                          className="flex gap-2"
                          initial={{ opacity: 1 }}
                          exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        >
                          <input
                            type="text"
                            value={responses[prompt.id] || ""}
                            onChange={(e) =>
                              setResponses((prev) => ({
                                ...prev,
                                [prompt.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && responses[prompt.id]?.trim()) {
                                submitResponse(prompt.id);
                              }
                            }}
                            placeholder="Your answer..."
                            className="flex-1 py-3 px-4 rounded-xl bg-raised/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors text-base"
                            maxLength={100}
                            disabled={submitting === prompt.id}
                            autoComplete="off"
                            autoCapitalize="sentences"
                            enterKeyHint="send"
                          />
                          <motion.button
                            onClick={(e) => {
                              triggerElement(e.currentTarget);
                              submitResponse(prompt.id);
                            }}
                            disabled={
                              submitting === prompt.id ||
                              !responses[prompt.id]?.trim()
                            }
                            className="px-5 py-3 bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                            {...buttonTap}
                          >
                            {submitting === prompt.id ? (
                              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : (
                              "Send"
                            )}
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <ErrorBanner error={error} className="mt-4" />
      </motion.div>
    </main>
  );
}
