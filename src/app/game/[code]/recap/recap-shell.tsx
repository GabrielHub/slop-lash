"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { GameState } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { analyzePromptOutcome } from "@/app/game/[code]/results";
import { ModelIcon } from "@/components/model-icon";
import { ScoreBarChart } from "@/components/score-bar-chart";
import {
  BestPromptsCarousel,
  extractBestPrompts,
} from "@/components/best-prompts-carousel";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import {
  fadeInUp,
  floatIn,
  staggerContainerSlow,
  springGentle,
  popIn,
} from "@/lib/animations";

export function RecapShell({ code }: { code: string }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const confettiFired = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/games/${code}/recap`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load recap");
          setErrorStatus(data.status || null);
          return;
        }
        setGame(await res.json());
      } catch {
        setError("Something went wrong");
      }
    }
    void load();
  }, [code]);

  // Fire confetti once on load
  useEffect(() => {
    if (!game || confettiFired.current) return;
    confettiFired.current = true;

    const colors = ["#FF5647", "#2DD4B8", "#FFD644"];
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 60,
          origin: { x: 0.75, y: 0.6 },
          colors,
        });
      }, 200);
    });
  }, [game]);

  /* ---- Loading skeleton ---- */
  if (!game && !error) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-30 px-4 py-2.5 flex items-center gap-2 bg-base/80 backdrop-blur-sm border-b border-edge">
          <div className="h-4 w-20 rounded bg-edge/40 animate-pulse" />
          <div className="h-4 w-px bg-edge-strong" />
          <div className="h-4 w-14 rounded bg-edge/40 animate-pulse" />
        </div>
        <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
          <div className="w-full max-w-lg lg:max-w-4xl space-y-8">
            <div className="flex justify-center">
              <div className="h-10 w-48 rounded-lg bg-edge/40 animate-pulse" />
            </div>
            <div className="lg:grid lg:grid-cols-2 lg:gap-8">
              <div className="space-y-3 mb-8 lg:mb-0">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded-lg bg-edge/40 animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
              <div className="h-44 rounded-xl bg-edge/40 animate-pulse" />
            </div>
          </div>
        </main>
      </>
    );
  }

  /* ---- Error state ---- */
  if (error) {
    const isInProgress = errorStatus && errorStatus !== "FINAL_RESULTS";
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
          <p className="text-fail font-display font-bold text-xl mb-2">
            {error}
          </p>
          {isInProgress && (
            <Link
              href={`/game/${code}`}
              className="inline-block mt-2 text-sm font-medium text-teal hover:underline"
            >
              Join the live game &rarr;
            </Link>
          )}
          <div className="mt-4">
            <Link
              href="/"
              className="text-sm text-ink-dim hover:text-ink transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </motion.div>
      </main>
    );
  }

  /* ---- Success: render recap ---- */
  if (!game) return null;
  const bestPrompts = extractBestPrompts(game);

  return (
    <>
      {/* Static header */}
      <div className="fixed top-0 left-0 right-0 z-30 px-4 py-2.5 flex items-center gap-2 bg-base/80 backdrop-blur-sm border-b border-edge">
        <span className="font-display font-bold text-xs text-punch tracking-tight">
          SLOP-LASH
        </span>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
          {game.roomCode}
        </span>
        <span className="text-edge-strong">|</span>
        <span className="text-xs font-medium text-ink-dim">Recap</span>
      </div>

      <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
        <div className="w-full max-w-lg lg:max-w-4xl">
          {/* Title */}
          <div className="text-center mb-10">
            <motion.h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-punch mb-3"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              Game Recap
            </motion.h1>
          </div>

          {/* Scoreboard + Best Moments — side by side on desktop */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 mb-10">
            {/* Score Bar Chart */}
            <motion.div
              className="mb-10 lg:mb-0"
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
            >
              <h2 className="text-sm font-medium text-ink-dim mb-3">
                Scoreboard
              </h2>
              <ScoreBarChart game={game} />
            </motion.div>

            {/* Best Prompts Carousel */}
            {bestPrompts.length > 0 && (
              <motion.div
                className="mb-10 lg:mb-0"
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.3 }}
              >
                <h2 className="text-sm font-medium text-ink-dim mb-3">
                  Best Moments
                </h2>
                <BestPromptsCarousel prompts={bestPrompts} />
              </motion.div>
            )}
          </div>

          {/* Round-by-round breakdown */}
          {game.rounds.map((round) => (
            <motion.div
              key={round.id}
              className="mb-10"
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
            >
              <h2 className="text-sm font-medium text-ink-dim mb-3">
                Round {round.roundNumber}
              </h2>
              <motion.div
                className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5"
                variants={staggerContainerSlow}
                initial="hidden"
                animate="visible"
              >
                {round.prompts.map((prompt, promptIdx) => {
                  const { totalVotes, isUnanimous, aiBeatsHuman } =
                    analyzePromptOutcome(prompt);

                  return (
                    <motion.div
                      key={prompt.id}
                      className={`p-4 sm:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 ${
                        isUnanimous ? "border-punch" : "border-edge"
                      }`}
                      style={{
                        boxShadow: isUnanimous
                          ? "0 0 20px rgba(255, 86, 71, 0.15)"
                          : "var(--shadow-card)",
                      }}
                      variants={floatIn}
                    >
                      <p className="font-display font-semibold text-sm text-gold mb-4">
                        {prompt.text}
                      </p>
                      <div className="space-y-3">
                        {prompt.responses.map((resp, respIdx) => {
                          const voteCount = prompt.votes.filter(
                            (v) => v.responseId === resp.id
                          ).length;
                          const pct =
                            totalVotes > 0
                              ? Math.round((voteCount / totalVotes) * 100)
                              : 0;
                          const isWinner =
                            totalVotes > 0 &&
                            voteCount > totalVotes - voteCount;
                          const respModel =
                            resp.player.type === "AI" && resp.player.modelId
                              ? getModelByModelId(resp.player.modelId)
                              : null;

                          return (
                            <div
                              key={resp.id}
                              className={`p-3 rounded-xl relative overflow-hidden border-2 ${
                                isWinner
                                  ? "border-gold bg-gold-soft/80 backdrop-blur-sm"
                                  : "border-edge bg-raised/80 backdrop-blur-sm"
                              }`}
                            >
                              {/* Vote bar */}
                              <motion.div
                                className={`absolute inset-0 ${
                                  isWinner ? "bg-gold/10" : "bg-ink/[0.03]"
                                }`}
                                initial={{ width: "0%" }}
                                animate={{ width: `${pct}%` }}
                                transition={{
                                  ...springGentle,
                                  delay: 0.3 + respIdx * 0.15,
                                }}
                              />
                              <div className="relative flex justify-between items-center gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm leading-snug text-ink">
                                    {resp.text}
                                  </p>
                                  <p className="flex items-center gap-1.5 mt-1">
                                    {respModel && (
                                      <ModelIcon
                                        model={respModel}
                                        size={14}
                                      />
                                    )}
                                    <span className="text-xs text-ink-dim">
                                      {resp.player.name}
                                    </span>
                                    {isWinner && (
                                      <motion.span
                                        className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gold/20 text-gold ml-1"
                                        variants={popIn}
                                        initial="hidden"
                                        animate="visible"
                                        transition={{
                                          delay: 0.6 + respIdx * 0.15,
                                        }}
                                      >
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                                          <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06l-4.23 1.14-3.47-6.22c-.42-.75-1.64-.75-2.06 0L7.01 9.72l-4.23-1.14c-.8-.22-1.63.26-1.84 1.06-.11.4-.02.82.24 1.13L5.5 15.5h13l4.32-4.73c.26-.31.35-.73.25-1.13z" />
                                        </svg>
                                        Winner
                                      </motion.span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span
                                    className={`font-mono font-bold text-sm tabular-nums ${
                                      isWinner ? "text-gold" : "text-ink-dim"
                                    }`}
                                  >
                                    {pct}%
                                  </span>
                                  <p className="text-[11px] text-ink-dim/60 tabular-nums">
                                    {voteCount} vote
                                    {voteCount !== 1 ? "s" : ""}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* SLOPPED! stamp — unanimous AI win */}
                      {isUnanimous && aiBeatsHuman && (
                        <motion.div
                          className="mt-4 flex justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.8 + promptIdx * 0.2 }}
                        >
                          <div
                            className="animate-stamp-slam inline-flex flex-col items-center gap-0.5 px-5 py-2 rounded-lg border-2 border-punch bg-punch/15"
                            style={{
                              boxShadow: "0 0 20px rgba(255, 86, 71, 0.2)",
                              textShadow: "0 0 12px rgba(255, 86, 71, 0.3)",
                            }}
                          >
                            <span className="font-display font-black text-lg tracking-[0.15em] uppercase text-punch">
                              SLOPPED!
                            </span>
                            <span className="text-[10px] font-bold text-punch/60 uppercase tracking-wider">
                              Lost to the machine
                            </span>
                          </div>
                        </motion.div>
                      )}

                      {/* FLAWLESS! stamp — unanimous non-AI win */}
                      {isUnanimous && !aiBeatsHuman && (
                        <motion.div
                          className="mt-4 flex justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.8 + promptIdx * 0.2 }}
                        >
                          <div
                            className="animate-stamp-slam inline-flex items-center gap-1.5 px-5 py-2 rounded-lg border-2 border-teal bg-teal/15"
                            style={{
                              boxShadow: "0 0 20px rgba(45, 212, 184, 0.2)",
                              textShadow: "0 0 12px rgba(45, 212, 184, 0.3)",
                            }}
                          >
                            <span className="font-display font-black text-lg tracking-[0.15em] uppercase text-teal">
                              FLAWLESS!
                            </span>
                          </div>
                        </motion.div>
                      )}

                      {/* Lost to the slop — non-unanimous AI win */}
                      {aiBeatsHuman && !isUnanimous && (
                        <motion.div
                          className="mt-4 flex justify-center"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.9 + promptIdx * 0.2 }}
                        >
                          <div className="animate-slop-drip inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border-2 border-punch/30 bg-gradient-to-b from-punch/10 to-punch/5"
                            style={{ boxShadow: "0 4px 12px rgba(255, 86, 71, 0.1)" }}
                          >
                            <span className="font-display font-bold text-sm text-punch uppercase tracking-wider">
                              Lost to the slop
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          ))}

          {/* AI Usage Stats */}
          <motion.div
            className="mb-10"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <h2 className="text-sm font-medium text-ink-dim mb-3">
              AI Usage
            </h2>
            <AiUsageBreakdown
              modelUsages={game.modelUsages}
              totalInput={game.aiInputTokens}
              totalOutput={game.aiOutputTokens}
              totalCost={game.aiCostUsd}
            />
          </motion.div>

          {/* Back to Home */}
          <div className="text-center pb-8">
            <Link
              href="/"
              className="inline-block text-sm font-medium text-teal hover:underline"
            >
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
