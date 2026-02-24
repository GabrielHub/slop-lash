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

interface PromptOutcome {
  totalVotes: number;
  isUnanimous: boolean;
  aiBeatsHuman: boolean;
}

function analyzePromptOutcome(
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
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-10">
            <motion.h1
              className="font-display text-4xl sm:text-5xl font-extrabold text-punch mb-3"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              Game Over!
            </motion.h1>
          </div>

          {/* Score Bar Chart */}
          <motion.div
            className="mb-10"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <h2 className="text-sm font-medium text-ink-dim mb-3">
              Scoreboard
            </h2>
            <ScoreBarChart game={game} />
          </motion.div>

          {/* Awards */}
          {achievements.length > 0 && (
            <motion.div
              className="mb-10"
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-sm font-medium text-ink-dim mb-3">
                Awards
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {achievements.map((a, i) => (
                  <motion.div
                    key={`${a.playerId}-${a.achievement.id}`}
                    className="p-3 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.4 + i * 0.08,
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                    }}
                  >
                    <div className="text-2xl mb-1">{a.achievement.icon}</div>
                    <p className="font-display font-bold text-xs text-ink leading-tight">
                      {a.achievement.name}
                    </p>
                    <p className="text-[11px] text-ink-dim truncate">
                      {a.playerName}
                    </p>
                    <p className="text-[10px] text-ink-dim/60 mt-0.5 leading-tight">
                      {a.achievement.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Best Prompts Carousel */}
          {bestPrompts.length > 0 && (
            <motion.div
              className="mb-10"
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

          <ErrorBanner error={error} />

          {/* Actions */}
          {isHost && (
            <motion.button
              onClick={playAgain}
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
      </main>
    );
  }

  /* ---- ROUND RESULTS layout (unchanged) ---- */
  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <h1 className="font-display text-3xl font-bold mb-1">
              Round {game.currentRound} Results
            </h1>
            <p className="text-ink-dim text-sm">
              Round {game.currentRound} of {game.totalRounds}
            </p>
          </motion.div>
        </div>

        {/* Prompt Results */}
        {currentRound && (
          <motion.div
            className="mb-10 space-y-5"
            variants={staggerContainerSlow}
            initial="hidden"
            animate="visible"
          >
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
                              <p className="font-semibold text-sm leading-snug text-ink">
                                {resp.text}
                              </p>
                              <p className="flex items-center gap-1.5 mt-1">
                                {respModel && (
                                  <ModelIcon model={respModel} size={14} />
                                )}
                                <span className="text-xs text-ink-dim">
                                  {resp.player.name}
                                </span>
                                {isWinner && (
                                  <motion.span
                                    className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gold/20 text-gold ml-1"
                                    variants={popIn}
                                    initial="hidden"
                                    animate="visible"
                                    transition={{
                                      delay: 0.6 + respIdx * 0.15,
                                    }}
                                  >
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
                                {voteCount} vote{voteCount !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* SLOPPED! banner — unanimous vote */}
                  {isUnanimous && (
                    <motion.div
                      className="mt-4 text-center py-2.5 rounded-lg bg-punch/10 border border-punch/30"
                      initial={{ opacity: 0, scale: 0.5, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 15,
                        delay: 0.8 + promptIdx * 0.2,
                      }}
                    >
                      <span className="font-display font-extrabold text-xl text-punch tracking-wider uppercase">
                        Slopped!
                      </span>
                      {aiBeatsHuman && (
                        <p className="text-xs font-medium text-punch/70 mt-0.5">
                          You lost to the slop
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* AI beats human — non-unanimous */}
                  {aiBeatsHuman && !isUnanimous && (
                    <motion.div
                      className="mt-4 text-center py-2 rounded-lg bg-punch/5 border border-punch/20"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.9 + promptIdx * 0.2 }}
                    >
                      <span className="font-display font-bold text-sm text-punch/80">
                        Lost to the slop
                      </span>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Scoreboard */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink-dim mb-3">
            Scoreboard
          </h2>
          <PlayerList players={sortedPlayers} showScores />
        </div>

        <ErrorBanner error={error} />

        {/* Actions */}
        {isHost ? (
          <motion.button
            onClick={nextRound}
            disabled={advancing}
            className="w-full bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            {...buttonTapPrimary}
          >
            {advancing ? "Starting..." : "Next Round"}
          </motion.button>
        ) : (
          <div className="text-center py-4">
            <PulsingDot>
              <span className="text-sm">Waiting for host to start next round...</span>
            </PulsingDot>
          </div>
        )}
      </div>
    </main>
  );
}
