"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { GameState } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { PlayerList } from "@/components/player-list";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import { ScoreBarChart } from "@/components/score-bar-chart";
import {
  BestPromptsCarousel,
  extractBestPrompts,
} from "@/components/best-prompts-carousel";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { computeAchievements } from "@/lib/achievements";
import {
  fadeInUp,
  floatIn,
  popIn,
  staggerContainerSlow,
  springGentle,
  buttonTapPrimary,
} from "@/lib/animations";
import { playSound } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";

function getAdvanceButtonText(advancing: boolean, isLastRound: boolean): string {
  if (advancing) return "Starting...";
  if (isLastRound) return "Finish Game";
  return "Next Round";
}

export interface PromptOutcome {
  totalVotes: number;
  isUnanimous: boolean;
  aiBeatsHuman: boolean;
}

export function analyzePromptOutcome(
  prompt: GameState["rounds"][0]["prompts"][0],
): PromptOutcome {
  const totalVotes = prompt.votes.length;

  const voteCounts = prompt.responses.map((r) => ({
    resp: r,
    count: prompt.votes.filter((v) => v.responseId === r.id).length,
  }));
  const ranked = [...voteCounts].sort((a, b) => b.count - a.count);
  const top = ranked[0];
  const bottom = ranked[1];

  const isUnanimous = totalVotes > 0 && !!top && top.count === totalVotes;
  const hasWinner =
    totalVotes > 0 && !!top && top.count > (bottom?.count ?? 0);
  const aiBeatsHuman =
    hasWinner &&
    top!.resp.player.type === "AI" &&
    bottom?.resp.player.type === "HUMAN";

  return { totalVotes, isUnanimous, aiBeatsHuman };
}

function getBadgeColor(id: string) {
  switch (id) {
    case "mvp":
      return {
        border: "border-gold/50",
        bg: "bg-gradient-to-br from-gold/10 to-transparent",
        iconBg: "bg-gold/20",
        text: "text-gold",
        glow: "0 0 12px rgba(255, 214, 68, 0.2)",
      };
    case "slopMaster":
    case "slopped":
      return {
        border: "border-punch/40",
        bg: "bg-gradient-to-br from-punch/10 to-transparent",
        iconBg: "bg-punch/20",
        text: "text-punch",
        glow: "0 0 12px rgba(255, 86, 71, 0.2)",
      };
    case "aiSlayer":
      return {
        border: "border-teal/40",
        bg: "bg-gradient-to-br from-teal/10 to-transparent",
        iconBg: "bg-teal/20",
        text: "text-teal",
        glow: "0 0 12px rgba(45, 212, 184, 0.2)",
      };
    default:
      return {
        border: "border-edge-strong",
        bg: "bg-gradient-to-br from-ink/5 to-transparent",
        iconBg: "bg-raised",
        text: "text-ink",
        glow: "0 0 8px rgba(0, 0, 0, 0.1)",
      };
  }
}

interface ResultsProps {
  game: GameState;
  isHost: boolean;
  playerId: string | null;
  code: string;
  isFinal: boolean;
}

export function Results({
  game,
  isHost,
  playerId,
  code,
  isFinal,
}: ResultsProps) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);
  const [playingAgain, setPlayingAgain] = useState(false);
  const [error, setError] = useState("");
  const { triggerElement } = usePixelDissolve();

  const confettiFired = useRef(false);
  const sloppedFired = useRef(false);

  useEffect(() => {
    if (!isFinal || confettiFired.current) return;
    confettiFired.current = true;

    const colors = ["#FF5647", "#2DD4B8", "#FFD644"];

    playSound("celebration");

    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors,
      });

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
  }, [isFinal]);

  const currentRound = game.rounds[0];

  // Fire confetti for SLOPPED! (unanimous vote) during round results
  useEffect(() => {
    if (isFinal || sloppedFired.current || !currentRound) return;
    const hasUnanimous = currentRound.prompts.some((prompt) => {
      const total = prompt.votes.length;
      if (total === 0) return false;
      return prompt.responses.some(
        (r) =>
          prompt.votes.filter((v) => v.responseId === r.id).length === total
      );
    });
    if (hasUnanimous) {
      sloppedFired.current = true;
      playSound("winner-reveal");
      setTimeout(() => {
        import("canvas-confetti").then(({ default: confetti }) => {
          confetti({
            particleCount: 50,
            spread: 90,
            origin: { y: 0.5 },
            colors: ["#FF5647", "#FF8A80", "#FFD644"],
            startVelocity: 25,
          });
        });
      }, 1200);
    }
  }, [currentRound, isFinal]);
  const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);

  const bestPrompts = isFinal ? extractBestPrompts(game) : [];
  const achievements = isFinal ? computeAchievements(game) : [];

  async function nextRound() {
    playSound("round-transition");
    setAdvancing(true);
    setError("");
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to advance");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setAdvancing(false);
    }
  }

  async function playAgain() {
    setPlayingAgain(true);
    setError("");
    try {
      const res = await fetch(`/api/games/${code}/play-again`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create new game");
        return;
      }
      const data = await res.json();
      localStorage.setItem("playerId", data.hostPlayerId);
      router.push(`/game/${data.roomCode}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setPlayingAgain(false);
    }
  }

  /* ---- FINAL RESULTS layout ---- */
  if (isFinal) {
    return (
      <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
        <div className="w-full max-w-lg lg:max-w-4xl">
          {/* Header */}
          <div className="text-center mb-10">
            <motion.h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-punch mb-3"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              Game Over!
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
              <h2 className="text-base font-medium text-ink-dim mb-3">
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
                <h2 className="text-base font-medium text-ink-dim mb-3">
                  Best Moments
                </h2>
                <BestPromptsCarousel prompts={bestPrompts} />
              </motion.div>
            )}
          </div>

          {/* Awards */}
          {achievements.length > 0 && (
            <motion.div
              className="mb-10"
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-base font-medium text-ink-dim mb-3">
                Awards
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {achievements.map((a, i) => {
                  const badgeColor = getBadgeColor(a.achievement.id);
                  return (
                    <motion.div
                      key={`${a.playerId}-${a.achievement.id}`}
                      className={`p-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 ${badgeColor.border} relative overflow-hidden`}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: 0.4 + i * 0.08,
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      {/* Subtle gradient overlay */}
                      <div className={`absolute inset-0 ${badgeColor.bg} opacity-30`} />
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-xl ${badgeColor.iconBg} flex items-center justify-center mb-2`}
                          style={{ boxShadow: badgeColor.glow }}
                        >
                          <span className="text-xl leading-none">{a.achievement.icon}</span>
                        </div>
                        <p className={`font-display font-bold text-sm leading-tight ${badgeColor.text}`}>
                          {a.achievement.name}
                        </p>
                        <p className="text-sm text-ink-dim truncate mt-0.5">
                          {a.playerName}
                        </p>
                        <p className="text-xs text-ink-dim/60 mt-1 leading-tight">
                          {a.achievement.description}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* AI Usage Stats */}
          <motion.div
            className="mb-10"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-base font-medium text-ink-dim mb-3">
              AI Usage
            </h2>
            <AiUsageBreakdown
              modelUsages={game.modelUsages}
              totalInput={game.aiInputTokens}
              totalOutput={game.aiOutputTokens}
              totalCost={game.aiCostUsd}
            />
          </motion.div>

          <ErrorBanner error={error} />

          {/* Actions */}
          <div className="lg:max-w-lg lg:mx-auto">
            {isHost && (
              <motion.button
                onClick={(e) => {
                  triggerElement(e.currentTarget);
                  playAgain();
                }}
                disabled={playingAgain}
                className="w-full bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                {...buttonTapPrimary}
              >
                {playingAgain ? "Creating..." : "Play Again"}
              </motion.button>
            )}

            {!isHost && (
              <div className="text-center py-4">
                <PulsingDot>
                  <span className="text-sm">
                    Waiting for host to start a new game...
                  </span>
                </PulsingDot>
              </div>
            )}

            {/* Shareable recap link */}
            <div className="text-center mt-4">
              <Link
                href={`/game/${code}/recap`}
                className="text-sm text-ink-dim hover:text-teal transition-colors"
              >
                Shareable recap link &rarr;
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ---- ROUND RESULTS layout ---- */
  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg lg:max-w-5xl">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <h1 className="font-display text-3xl font-bold mb-1 text-ink">
              Round {game.currentRound} Results
            </h1>
            <p className="text-ink-dim text-sm">
              Round {game.currentRound} of {game.totalRounds}
            </p>
          </motion.div>
        </div>

        {/* Two-column layout on desktop; sidebar-first on mobile */}
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-8">
          {/* Sidebar: Scoreboard + Actions — renders first on mobile, right column on desktop */}
          <div className="mb-8 lg:mb-0 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
            <div className="mb-6 lg:mb-8">
              <h2 className="text-base font-medium text-ink-dim mb-3">
                Scoreboard
              </h2>
              <PlayerList players={sortedPlayers} showScores />
            </div>

            <ErrorBanner error={error} />

            {/* Actions */}
            {isHost ? (
              <motion.button
                onClick={(e) => {
                  triggerElement(e.currentTarget);
                  nextRound();
                }}
                disabled={advancing}
                className="w-full bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                {...buttonTapPrimary}
              >
                {getAdvanceButtonText(advancing, game.currentRound >= game.totalRounds)}
              </motion.button>
            ) : (
              <div className="text-center py-4">
                <PulsingDot>
                  <span className="text-sm">
                    {game.currentRound >= game.totalRounds
                      ? "Waiting for host to finish the game..."
                      : "Waiting for host to start next round..."}
                  </span>
                </PulsingDot>
              </div>
            )}
          </div>

          {/* Prompt Results — below sidebar on mobile, left column on desktop */}
          {currentRound && (
            <motion.div
              className="space-y-5 lg:col-start-1 lg:row-start-1"
              variants={staggerContainerSlow}
              initial="hidden"
              animate="visible"
            >
              {/* Grid of prompt cards on desktop */}
              <div className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5">
                {currentRound.prompts.map((prompt, promptIdx) => {
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
                      <p className="font-display font-semibold text-base text-gold mb-4">
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
                            totalVotes > 0 && voteCount > totalVotes - voteCount;
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
                                  <p className="font-semibold text-base leading-snug text-ink">
                                    {resp.text}
                                  </p>
                                  <p className="flex items-center gap-1.5 mt-1">
                                    {respModel && (
                                      <ModelIcon model={respModel} size={16} />
                                    )}
                                    <span className="text-sm text-ink-dim">
                                      {resp.player.name}
                                    </span>
                                    {isWinner && (
                                      <motion.span
                                        className="inline-flex items-center gap-0.5 text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gold/20 text-gold ml-1"
                                        variants={popIn}
                                        initial="hidden"
                                        animate="visible"
                                        transition={{
                                          delay: 0.6 + respIdx * 0.15,
                                        }}
                                      >
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                          <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06l-4.23 1.14-3.47-6.22c-.42-.75-1.64-.75-2.06 0L7.01 9.72l-4.23-1.14c-.8-.22-1.63.26-1.84 1.06-.11.4-.02.82.24 1.13L5.5 15.5h13l4.32-4.73c.26-.31.35-.73.25-1.13z" />
                                        </svg>
                                        Winner
                                      </motion.span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span
                                    className={`font-mono font-bold text-base tabular-nums ${
                                      isWinner ? "text-gold" : "text-ink-dim"
                                    }`}
                                  >
                                    {pct}%
                                  </span>
                                  <p className="text-xs text-ink-dim/80 tabular-nums">
                                    {voteCount} vote{voteCount !== 1 ? "s" : ""}
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
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </main>
  );
}
