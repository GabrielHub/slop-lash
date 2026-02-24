"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameState } from "@/lib/types";
import { Timer } from "@/components/timer";
import { CompletionCard } from "@/components/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import {
  fadeInUp,
  slideInLeft,
  slideInRight,
  scaleIn,
  staggerContainer,
  voteCardTap,
  buttonTap,
} from "@/lib/animations";
import { playSound } from "@/lib/sounds";

function getSkipButtonText(
  skipping: boolean,
  timersDisabled: boolean,
  phase: string
): string {
  if (skipping) return "Skipping...";
  if (timersDisabled) return `End ${phase}`;
  return "Skip Timer";
}

export function Voting({
  game,
  playerId,
  code,
  isHost,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
  isHost: boolean;
}) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");

  const currentRound = game.rounds[0];

  const votablePrompts = useMemo(() => {
    if (!currentRound || !playerId) return [];
    return currentRound.prompts.filter(
      (p) =>
        p.responses.length >= 2 &&
        !p.responses.some((r) => r.playerId === playerId)
    );
  }, [currentRound, playerId]);

  const alreadyVoted = useMemo(() => {
    if (!currentRound || !playerId) return new Set<string>();
    const set = new Set<string>();
    for (const prompt of currentRound.prompts) {
      if (prompt.votes.some((v) => v.voterId === playerId)) {
        set.add(prompt.id);
      }
    }
    return set;
  }, [currentRound, playerId]);

  async function castVote(promptId: string, responseId: string) {
    if (!playerId) return;
    setVoting(true);
    setError("");

    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: playerId, promptId, responseId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to vote");
        return;
      }

      playSound("vote-cast");
      setVoted((prev) => new Set(prev).add(promptId));
    } catch {
      setError("Something went wrong");
    } finally {
      setVoting(false);
    }
  }

  async function skipTimer() {
    setSkipping(true);
    setError("");
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to skip");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSkipping(false);
    }
  }

  const player = game.players.find((p) => p.id === playerId);
  const isAI = player?.type === "AI";

  if (isAI || !playerId) {
    return (
      <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <h1 className="font-display text-3xl font-bold mb-3">
            Voting Time
          </h1>
          <PulsingDot>Players are casting their votes...</PulsingDot>
        </motion.div>
      </main>
    );
  }

  const allDone =
    votablePrompts.length === 0 ||
    votablePrompts.every(
      (p) => voted.has(p.id) || alreadyVoted.has(p.id)
    );

  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <motion.div
        className="w-full max-w-lg"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            Vote!
          </h1>
          <p className="text-ink-dim text-sm mt-1">
            Pick the funnier answer
          </p>
        </div>

        {/* Timer */}
        <div className="mb-8">
          <Timer deadline={game.phaseDeadline} disabled={game.timersDisabled} />
          {isHost && (
            <motion.button
              onClick={skipTimer}
              disabled={skipping}
              className="mt-3 w-full py-2 text-sm font-medium text-ink-dim hover:text-ink bg-raised/80 backdrop-blur-sm hover:bg-surface border border-edge rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              {...buttonTap}
            >
              {getSkipButtonText(skipping, game.timersDisabled, "Voting")}
            </motion.button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {allDone ? (
            <CompletionCard
              title="All votes cast!"
              subtitle="Waiting for other players..."
            />
          ) : (
            <motion.div
              key="prompts"
              className="space-y-10"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence>
                {votablePrompts.map((prompt) => {
                  const isDone =
                    voted.has(prompt.id) || alreadyVoted.has(prompt.id);
                  if (isDone) return null;

                  const [respA, respB] = prompt.responses;
                  return (
                    <motion.div
                      key={prompt.id}
                      variants={fadeInUp}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                      layout
                    >
                      {/* Prompt text */}
                      <p className="font-display font-semibold text-base sm:text-lg text-center mb-5 text-gold leading-snug">
                        {prompt.text}
                      </p>

                      <div className="space-y-3">
                        {/* Response A */}
                        <motion.button
                          onClick={() => castVote(prompt.id, respA.id)}
                          disabled={voting}
                          className="w-full p-4 sm:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge text-left transition-colors hover:border-teal hover:bg-teal-soft disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group"
                          style={{ boxShadow: "var(--shadow-card)" }}
                          variants={slideInLeft}
                          {...voteCardTap}
                        >
                          <p className="text-base sm:text-lg leading-snug group-hover:text-teal transition-colors">
                            {respA.text}
                          </p>
                        </motion.button>

                        {/* VS Divider */}
                        <motion.div
                          className="flex items-center justify-center gap-3"
                          variants={scaleIn}
                        >
                          <div className="h-px flex-1 bg-edge" />
                          <span className="font-display font-extrabold text-xs text-ink-dim/50 tracking-widest">
                            VS
                          </span>
                          <div className="h-px flex-1 bg-edge" />
                        </motion.div>

                        {/* Response B */}
                        <motion.button
                          onClick={() => castVote(prompt.id, respB.id)}
                          disabled={voting}
                          className="w-full p-4 sm:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge text-left transition-colors hover:border-punch hover:bg-fail-soft disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group"
                          style={{ boxShadow: "var(--shadow-card)" }}
                          variants={slideInRight}
                          {...voteCardTap}
                        >
                          <p className="text-base sm:text-lg leading-snug group-hover:text-punch transition-colors">
                            {respB.text}
                          </p>
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <ErrorBanner error={error} className="mt-4" />
      </motion.div>
    </main>
  );
}
