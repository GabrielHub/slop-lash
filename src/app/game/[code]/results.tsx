"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { GameState, GamePrompt, filterCastVotes } from "@/lib/types";
import { FORFEIT_MARKER } from "@/lib/scoring";
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
import { PromptOutcomeStamp } from "@/components/prompt-outcome-stamp";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { CrownIcon } from "@/components/icons";
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
import { useWinnerTagline } from "@/hooks/use-winner-tagline";
import { WinnerTagline } from "@/components/winner-tagline";

function formatSigned(n: number): string {
  return n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

function getPointsTextColor(pts: number, isWinner: boolean): string {
  if (pts < 0) return "text-punch";
  if (isWinner) return "text-gold";
  return "text-ink-dim";
}

function getAdvanceButtonText(advancing: boolean, isLastRound: boolean): string {
  if (advancing) return "Starting...";
  if (isLastRound) return "Finish Game";
  return "Next Round";
}

export interface PromptOutcome {
  totalVotes: number;
  isUnanimous: boolean;
  aiBeatsHuman: boolean;
  /** Response ID of the points-based winner (null if tie) */
  winnerResponseId: string | null;
  /** True when all human voters abstained */
  allPassed: boolean;
}

export function analyzePromptOutcome(
  prompt: GameState["rounds"][0]["prompts"][0],
): PromptOutcome {
  const castVotes = filterCastVotes(prompt.votes);
  const totalVotes = castVotes.length;

  // Points-based winner determination
  const byPoints = [...prompt.responses].sort(
    (a, b) => b.pointsEarned - a.pointsEarned,
  );
  const pointsTie =
    byPoints.length >= 2 && byPoints[0].pointsEarned === byPoints[1].pointsEarned;
  const winnerResponseId = !pointsTie && byPoints.length > 0
    ? byPoints[0].id
    : null;

  // Unanimous still based on votes (for stamps)
  const voteCounts = prompt.responses
    .map((r) => ({
      resp: r,
      count: castVotes.filter((v) => v.responseId === r.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const top = voteCounts[0];
  const bottom = voteCounts[1];
  const isUnanimous = totalVotes >= 2 && top?.count === totalVotes;
  const hasVoteWinner = top?.count > (bottom?.count ?? 0);
  const aiBeatsHuman =
    hasVoteWinner &&
    top.resp.player.type === "AI" &&
    bottom?.resp.player.type === "HUMAN";

  // Check if all human voters abstained
  const humanVoters = prompt.votes.filter((v) => v.voter.type === "HUMAN");
  const allPassed = humanVoters.length > 0 && humanVoters.every((v) => v.responseId === null);

  return { totalVotes, isUnanimous, aiBeatsHuman, winnerResponseId, allPassed };
}

export function getPromptCardBorder(outcome: PromptOutcome): { border: string; shadow: string } {
  if (outcome.isUnanimous) {
    return { border: "border-punch", shadow: "0 0 20px rgba(255, 86, 71, 0.15)" };
  }
  if (outcome.allPassed) {
    return { border: "border-ink-dim/30", shadow: "var(--shadow-card)" };
  }
  return { border: "border-edge", shadow: "var(--shadow-card)" };
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
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");
  const { triggerElement } = usePixelDissolve();
  const { tagline, isStreaming, winner: taglineWinner } = useWinnerTagline(code, isFinal, game.players);
  const advancePendingRef = useRef(false);

  const confettiFired = useRef(false);
  const sloppedFired = useRef(false);

  useEffect(() => {
    if (game.status !== "ROUND_RESULTS") {
      advancePendingRef.current = false;
      setAdvancing(false);
    }
  }, [game.status]);

  useEffect(() => {
    if (!isFinal || confettiFired.current) return;
    confettiFired.current = true;

    const colors = ["#FF5647", "#2DD4B8", "#FFD644"];
    const timers: ReturnType<typeof setTimeout>[] = [];

    playSound("game-over");
    timers.push(setTimeout(() => playSound("celebration"), 2000));

    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors,
      });

      timers.push(setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 60,
          origin: { x: 0.75, y: 0.6 },
          colors,
        });
      }, 200));
    });

    return () => timers.forEach(clearTimeout);
  }, [isFinal]);

  const currentRound = game.rounds[0];

  // Fire confetti for SLOPPED! (unanimous vote) during round results
  useEffect(() => {
    if (isFinal || sloppedFired.current || !currentRound) return;
    const hasUnanimous = currentRound.prompts.some((prompt) => {
      const castVotes = filterCastVotes(prompt.votes);
      if (castVotes.length < 2) return false;
      return prompt.responses.some(
        (r) => castVotes.every((v) => v.responseId === r.id)
      );
    });
    if (!hasUnanimous) return;

    sloppedFired.current = true;
    playSound("winner-reveal");
    const timer = setTimeout(() => {
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

    return () => clearTimeout(timer);
  }, [currentRound, isFinal]);

  const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
  const afkPlayers = game.players.filter((p) => p.type === "HUMAN" && p.idleRounds >= 2);

  async function handleKick(targetPlayerId: string) {
    const target = game.players.find((p) => p.id === targetPlayerId);
    if (!window.confirm(`Kick ${target?.name ?? "this player"}?`)) return;
    try {
      await fetch(`/api/games/${code}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, targetPlayerId }),
      });
    } catch {
      // ignore
    }
  }

  const bestPrompts = isFinal ? extractBestPrompts(game) : [];
  const achievements = isFinal ? computeAchievements(game) : [];

  async function nextRound() {
    if (advancePendingRef.current) return;
    advancePendingRef.current = true;
    playSound("round-transition");
    setAdvancing(true);
    setError("");
    let keepPending = false;
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to advance");
        advancePendingRef.current = false;
      } else {
        keepPending = true;
      }
    } catch {
      setError("Something went wrong");
      advancePendingRef.current = false;
    } finally {
      if (!keepPending) {
        setAdvancing(false);
      }
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
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-punch mb-3 title-glow"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              Game Over!
            </motion.h1>
          </div>

          {/* Winner tagline speech bubble */}
          {taglineWinner && (
            <WinnerTagline winner={taglineWinner} tagline={tagline} isStreaming={isStreaming} />
          )}

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
                      className={`shimmer-sweep p-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 ${badgeColor.border} relative overflow-hidden`}
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
                        <div className={`w-11 h-11 rounded-xl ${badgeColor.iconBg} flex items-center justify-center mb-2.5`}
                          style={{ boxShadow: badgeColor.glow }}
                        >
                          <span className="text-2xl leading-none">{a.achievement.icon}</span>
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
              <motion.div {...buttonTapPrimary}>
                <Link
                  href="/host"
                  onClick={(e) => triggerElement(e.currentTarget)}
                  className="block w-full text-center bg-punch/90 backdrop-blur-sm hover:bg-punch-hover text-white font-display font-bold py-4 rounded-xl text-lg transition-colors cursor-pointer"
                >
                  Play Again
                </Link>
              </motion.div>
            )}

            {!isHost && (
              <motion.div {...buttonTapPrimary}>
                <Link
                  href="/join"
                  onClick={(e) => triggerElement(e.currentTarget)}
                  className="block w-full text-center bg-surface/70 hover:bg-surface border border-edge text-ink font-medium py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Join Another Game
                </Link>
              </motion.div>
            )}

            {!isHost && (
              <div className="text-center py-4">
                <p className="text-sm text-ink-dim">
                  You can join a new room whenever you&apos;re ready.
                </p>
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

        {/* Winner tagline speech bubble */}
        {taglineWinner && (
          <WinnerTagline winner={taglineWinner} tagline={tagline} isStreaming={isStreaming} />
        )}

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

            {/* AFK Warning */}
            {isHost && !isFinal && afkPlayers.length > 0 && (
              <div className="mb-4 p-3 rounded-xl border-2 border-fail/30 bg-fail-soft/50">
                <p className="text-xs font-medium text-fail mb-2">AFK Players:</p>
                {afkPlayers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink">
                      {p.name} <span className="text-ink-dim text-xs">({p.idleRounds} rounds)</span>
                    </span>
                    <button
                      onClick={() => handleKick(p.id)}
                      className="text-xs font-medium text-fail hover:text-fail/80 transition-colors cursor-pointer px-2 py-0.5 rounded border border-fail/30"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            )}

            <ErrorBanner error={error} />

            {/* Actions */}
            {isHost ? (
              <motion.button
                onClick={(e) => {
                  if (advancing) return;
                  triggerElement(e.currentTarget);
                  void nextRound();
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
                {currentRound.prompts.filter((p) => !p.responses.some((r) => r.text === FORFEIT_MARKER)).map((prompt, promptIdx) => {
                  const outcome = analyzePromptOutcome(prompt);
                  const { totalVotes, isUnanimous, aiBeatsHuman, winnerResponseId, allPassed } = outcome;
                  const cardStyle = getPromptCardBorder(outcome);

                  return (
                    <motion.div
                      key={prompt.id}
                      className={`p-4 sm:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 ${cardStyle.border}`}
                      style={{ boxShadow: cardStyle.shadow }}
                      variants={floatIn}
                    >
                      <p className="font-display font-semibold text-base text-gold mb-4">
                        {prompt.text}
                      </p>
                      <div className="space-y-3">
                        {prompt.responses.map((resp, respIdx) => {
                          const voteCount = filterCastVotes(prompt.votes).filter(
                            (v) => v.responseId === resp.id
                          ).length;
                          const pct =
                            totalVotes > 0
                              ? Math.round((voteCount / totalVotes) * 100)
                              : 0;
                          const isWinner = winnerResponseId === resp.id;
                          const pts = resp.pointsEarned;
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
                                        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gradient-to-r from-gold/25 to-gold/15 text-gold border border-gold/20 ml-1"
                                        style={{ boxShadow: "0 0 8px rgba(255, 214, 68, 0.15)" }}
                                        variants={popIn}
                                        initial="hidden"
                                        animate="visible"
                                        transition={{
                                          delay: 0.6 + respIdx * 0.15,
                                        }}
                                      >
                                        <CrownIcon className="w-3 h-3 animate-crown-shimmer" />
                                        Winner
                                      </motion.span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span
                                    className={`font-mono font-bold text-base tabular-nums ${getPointsTextColor(pts, isWinner)}`}
                                  >
                                    {formatSigned(pts)}
                                  </span>
                                  <p className="text-xs text-ink-dim/80 tabular-nums">
                                    {voteCount} vote{voteCount !== 1 ? "s" : ""} ({pct}%)
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <PromptOutcomeStamp
                        isUnanimous={isUnanimous}
                        aiBeatsHuman={aiBeatsHuman}
                        allPassed={allPassed}
                        delay={0.8 + promptIdx * 0.2}
                      />
                    </motion.div>
                  );
                })}
              </div>

              {/* Forfeited matchups — AI crashed, opponent auto-wins */}
              <ForfeitedMatchups prompts={currentRound.prompts} players={game.players} />
            </motion.div>
          )}

        </div>
      </div>
    </main>
  );
}

/** Show forfeited matchups where an AI crashed and the opponent auto-won. */
function ForfeitedMatchups({
  prompts,
  players,
}: {
  prompts: GamePrompt[];
  players: GameState["players"];
}) {
  const forfeited = prompts.filter((p) =>
    p.responses.some((r) => r.text === FORFEIT_MARKER),
  );
  if (forfeited.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="text-xs font-medium text-ink-dim/50 uppercase tracking-wider mb-3">
        Forfeited Matchups
      </p>
      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
        {forfeited.map((prompt) => {
          const crashed = prompt.responses.find((r) => r.text === FORFEIT_MARKER);
          const survivor = prompt.responses.find((r) => r.text !== FORFEIT_MARKER);
          const crashedPlayer = players.find((p) => p.id === crashed?.playerId);
          const crashedModel =
            crashedPlayer?.type === "AI" && crashedPlayer.modelId
              ? getModelByModelId(crashedPlayer.modelId)
              : null;

          return (
            <motion.div
              key={prompt.id}
              className="p-4 rounded-xl bg-surface/40 border border-edge/50 opacity-60"
              variants={fadeInUp}
            >
              <p className="font-display font-semibold text-sm text-gold/70 mb-2">
                {prompt.text}
              </p>
              {survivor && (
                <p className="text-sm text-ink-dim mb-2">
                  <span className="text-ink">{survivor.text}</span>
                  {" "}
                  <span className="text-ink-dim/60">&mdash; {survivor.player.name} (auto-win)</span>
                </p>
              )}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-punch/10 border border-punch/20 text-xs text-punch/80">
                {crashedModel && <ModelIcon model={crashedModel} size={14} />}
                <span>{crashedPlayer?.name ?? "Unknown"} crashed</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
