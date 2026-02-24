"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { AI_MODELS, getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { getPlayerColor } from "@/lib/player-colors";
import {
  fadeInUp,
  floatIn,
  staggerContainer,
  staggerContainerSlow,
  springGentle,
  buttonTapPrimary,
} from "@/lib/animations";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContestantStats {
  key: string;
  name: string;
  shortName: string;
  type: "HUMAN" | "AI";
  modelId: string | null;
  totalVotes: number;
  totalResponses: number;
  matchupsWon: number;
  matchupsPlayed: number;
  winRate: number;
  voteShare: number;
}

interface HeadToHead {
  modelId: string;
  modelName: string;
  modelShortName: string;
  humanWins: number;
  aiWins: number;
  ties: number;
  total: number;
}

interface BestResponse {
  promptText: string;
  responseText: string;
  playerName: string;
  playerType: "HUMAN" | "AI";
  modelId: string | null;
  votePct: number;
  voteCount: number;
  totalVotes: number;
}

interface ModelUsage {
  modelId: string;
  modelName: string;
  modelShortName: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface LeaderboardData {
  leaderboard: ContestantStats[];
  headToHead: HeadToHead[];
  bestResponses: BestResponse[];
  modelUsage: ModelUsage[];
  stats: {
    totalGames: number;
    totalPrompts: number;
    totalVotes: number;
    totalTokens: number;
    totalCost: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Stats Banner                                                       */
/* ------------------------------------------------------------------ */

function StatsBanner({
  stats,
}: {
  stats: LeaderboardData["stats"];
}) {
  const items = [
    { label: "Games Played", value: stats.totalGames },
    { label: "Prompts Answered", value: stats.totalPrompts },
    { label: "Votes Cast", value: stats.totalVotes },
  ];

  return (
    <motion.div
      className="grid grid-cols-3 gap-3 sm:gap-4 mb-10"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          className="text-center p-3 sm:p-4 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge"
          style={{ boxShadow: "var(--shadow-card)" }}
          variants={fadeInUp}
        >
          <p className="font-mono font-bold text-2xl sm:text-3xl text-punch tabular-nums">
            {item.value.toLocaleString()}
          </p>
          <p className="text-xs sm:text-sm text-ink-dim mt-1">
            {item.label}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard Bar Chart                                              */
/* ------------------------------------------------------------------ */

function LeaderboardChart({
  entries,
}: {
  entries: ContestantStats[];
}) {
  const maxVotes = entries[0]?.totalVotes || 1;

  return (
    <motion.div
      className="space-y-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.08 } },
      }}
    >
      {entries.map((entry, idx) => {
        const pct = (entry.totalVotes / maxVotes) * 100;
        const isTop = idx === 0;
        const model =
          entry.type === "AI" && entry.modelId
            ? getModelByModelId(entry.modelId)
            : null;

        return (
          <motion.div
            key={entry.key}
            className="group"
            variants={{
              hidden: { opacity: 0, x: -20 },
              visible: { opacity: 1, x: 0, transition: springGentle },
            }}
          >
            {/* Main bar row */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Rank */}
              <span
                className={`w-7 text-center font-mono font-bold text-base sm:text-lg shrink-0 ${
                  isTop ? "text-gold" : "text-ink-dim"
                }`}
              >
                {idx + 1}
              </span>

              {/* Icon */}
              <div className="shrink-0">
                {model ? (
                  <ModelIcon model={model} size={26} />
                ) : (
                  <span
                    className="w-[26px] h-[26px] flex items-center justify-center rounded-sm text-sm font-bold"
                    style={{
                      color: getPlayerColor(entry.name),
                      backgroundColor: `${getPlayerColor(entry.name)}20`,
                    }}
                  >
                    {entry.shortName[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>

              {/* Name */}
              <span
                className={`w-20 sm:w-28 text-base font-semibold truncate shrink-0 ${
                  isTop ? "text-gold" : "text-ink"
                }`}
              >
                {entry.shortName}
              </span>

              {/* Bar track */}
              <div className="flex-1 h-9 rounded-lg bg-edge/40 relative overflow-hidden">
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-lg ${
                    isTop ? "bg-gold/80" : "bg-teal/40"
                  }`}
                  initial={{ width: "0%" }}
                  animate={{ width: `${Math.max(pct, 4)}%` }}
                  transition={{
                    ...springGentle,
                    delay: 0.2 + idx * 0.08,
                  }}
                  style={
                    isTop
                      ? { boxShadow: "0 0 12px var(--gold)" }
                      : undefined
                  }
                />
              </div>

              {/* Vote count */}
              <motion.span
                className={`font-mono font-bold text-base sm:text-lg tabular-nums shrink-0 w-10 text-right ${
                  isTop ? "text-gold" : "text-ink-dim"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + idx * 0.08 }}
              >
                {entry.totalVotes}
              </motion.span>
            </div>

            {/* Stat chips (below bar, subtle) */}
            <div className="flex gap-4 ml-[62px] sm:ml-[78px] mt-1.5">
              <span className="text-xs text-ink-dim/70 tabular-nums font-mono">
                {entry.winRate}% win
              </span>
              <span className="text-xs text-ink-dim/70 tabular-nums font-mono">
                {entry.totalResponses} resp
              </span>
              <span className="text-xs text-ink-dim/70 tabular-nums font-mono">
                {entry.voteShare}% share
              </span>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Head-to-Head Cards                                                 */
/* ------------------------------------------------------------------ */

function HeadToHeadSection({
  matchups,
}: {
  matchups: HeadToHead[];
}) {
  if (matchups.length === 0) return null;

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3"
      variants={staggerContainerSlow}
      initial="hidden"
      animate="visible"
    >
      {matchups.map((h2h) => {
        const model = AI_MODELS.find((m) => m.id === h2h.modelId);
        const humanPct =
          h2h.total > 0
            ? Math.round((h2h.humanWins / h2h.total) * 100)
            : 50;
        const aiPct =
          h2h.total > 0
            ? Math.round((h2h.aiWins / h2h.total) * 100)
            : 50;

        return (
          <motion.div
            key={h2h.modelId}
            className="p-3.5 sm:p-4 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge"
            style={{ boxShadow: "var(--shadow-card)" }}
            variants={floatIn}
          >
            {/* Matchup header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 flex items-center justify-center rounded-sm bg-human-soft text-human text-[10px] font-bold">
                  H
                </span>
                <span className="text-xs font-semibold text-ink">
                  Human
                </span>
              </div>
              <span className="text-[10px] font-mono text-ink-dim uppercase tracking-widest">
                vs
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-ink">
                  {h2h.modelShortName}
                </span>
                {model && <ModelIcon model={model} size={18} />}
              </div>
            </div>

            {/* Split bar */}
            <div className="h-5 rounded-full overflow-hidden flex bg-edge/30">
              <motion.div
                className="bg-human/70 rounded-l-full"
                initial={{ width: "0%" }}
                animate={{
                  width: `${humanPct}%`,
                }}
                transition={{ ...springGentle, delay: 0.3 }}
              />
              <motion.div
                className="bg-ai/70 rounded-r-full"
                initial={{ width: "0%" }}
                animate={{
                  width: `${aiPct}%`,
                }}
                transition={{ ...springGentle, delay: 0.35 }}
              />
            </div>

            {/* Record line */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs font-mono text-human tabular-nums font-semibold">
                {h2h.humanWins}W
              </span>
              {h2h.ties > 0 && (
                <span className="text-[10px] font-mono text-ink-dim tabular-nums">
                  {h2h.ties} ties
                </span>
              )}
              <span className="text-xs font-mono text-ai tabular-nums font-semibold">
                {h2h.aiWins}W
              </span>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Best Responses Hall of Fame                                        */
/* ------------------------------------------------------------------ */

function HallOfFame({
  responses,
}: {
  responses: BestResponse[];
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (responses.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((c) => (c + 1) % responses.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [responses.length]);

  if (responses.length === 0) return null;

  const item = responses[current];
  const model =
    item.playerType === "AI" && item.modelId
      ? getModelByModelId(item.modelId)
      : null;

  return (
    <div className="relative">
      {/* Card area */}
      <div className="relative overflow-hidden rounded-xl min-h-[160px]">
        {/* Tap zones */}
        {responses.length > 1 && (
          <>
            <button
              className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              aria-label="Previous"
              onClick={() =>
                setCurrent(
                  (c) =>
                    (c - 1 + responses.length) % responses.length
                )
              }
            />
            <button
              className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              aria-label="Next"
              onClick={() =>
                setCurrent((c) => (c + 1) % responses.length)
              }
            />
          </>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="p-4 sm:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge"
            style={{ boxShadow: "var(--shadow-card)" }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            {/* Rank badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gold bg-gold-soft px-2 py-0.5 rounded-md">
                #{current + 1} All Time
              </span>
              <span className="font-mono font-bold text-sm text-gold tabular-nums">
                {item.votePct}%
              </span>
            </div>

            {/* Prompt */}
            <p className="font-display font-semibold text-sm text-gold mb-3 leading-snug">
              {item.promptText}
            </p>

            {/* Response */}
            <p className="text-ink font-semibold text-sm sm:text-base leading-snug mb-3">
              &ldquo;{item.responseText}&rdquo;
            </p>

            {/* Attribution */}
            <div className="flex items-center gap-1.5">
              {model ? (
                <ModelIcon
                  model={model}
                  size={16}
                  className="shrink-0"
                />
              ) : (
                <span
                  className="w-4 h-4 flex items-center justify-center rounded-sm text-[10px] font-bold shrink-0"
                  style={{
                    color: getPlayerColor(item.playerName),
                    backgroundColor: `${getPlayerColor(item.playerName)}20`,
                  }}
                >
                  {item.playerName[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="text-xs text-ink-dim truncate">
                {item.playerName}
              </span>
              <span className="text-[10px] text-ink-dim/50">
                &middot; {item.voteCount}/{item.totalVotes} votes
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {responses.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {responses.map((_, i) => (
            <button
              key={i}
              className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                i === current
                  ? "bg-gold w-5"
                  : "bg-edge hover:bg-ink-dim/40"
              }`}
              aria-label={`Go to response ${i + 1}`}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI Cost Breakdown                                                  */
/* ------------------------------------------------------------------ */

function formatCost(cost: number): string {
  return cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2);
}

function ModelUsageSection({
  usages,
  totalTokens,
  totalCost,
}: {
  usages: ModelUsage[];
  totalTokens: number;
  totalCost: number;
}) {
  if (usages.length === 0) return null;

  const maxCost = usages[0]?.costUsd || 1;

  return (
    <motion.div
      className="space-y-2.5"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      {usages.map((mu, idx) => {
        const model = AI_MODELS.find((m) => m.id === mu.modelId);
        const pct = (mu.costUsd / maxCost) * 100;
        const tokens = mu.inputTokens + mu.outputTokens;

        return (
          <motion.div
            key={mu.modelId}
            className="p-3 rounded-lg bg-surface/60 border border-edge/60"
            variants={{
              hidden: { opacity: 0, x: -12 },
              visible: { opacity: 1, x: 0, transition: springGentle },
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="shrink-0">
                {model ? (
                  <ModelIcon model={model} size={22} />
                ) : (
                  <span className="w-[22px] h-[22px] rounded-full bg-edge" />
                )}
              </div>
              <span className="font-semibold text-sm text-ink truncate flex-1">
                {mu.modelShortName}
              </span>
              <span className="font-mono text-xs tabular-nums text-ink-dim shrink-0">
                {tokens.toLocaleString()} tok
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-teal shrink-0">
                ${formatCost(mu.costUsd)}
              </span>
            </div>
            {/* Cost bar */}
            <div className="h-2 rounded-full bg-edge/30 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${idx === 0 ? "bg-punch/70" : "bg-teal/50"}`}
                initial={{ width: "0%" }}
                animate={{ width: `${Math.max(pct, 3)}%` }}
                transition={{ ...springGentle, delay: 0.15 + idx * 0.06 }}
              />
            </div>
          </motion.div>
        );
      })}

      {/* Total row */}
      <div className="flex items-center gap-3 pt-2 mt-1 border-t border-edge/40">
        <span className="font-bold text-sm text-ink flex-1">Total</span>
        <span className="font-mono text-xs font-bold tabular-nums text-ink shrink-0">
          {totalTokens.toLocaleString()} tok
        </span>
        <span className="font-mono text-sm font-bold tabular-nums text-teal shrink-0">
          ${formatCost(totalCost)}
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <motion.div
      className="text-center py-16"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      <p className="font-display text-2xl font-bold text-ink mb-3">
        No games yet
      </p>
      <p className="text-ink-dim text-sm mb-6">
        Play some games to see who&rsquo;s the funniest!
      </p>
      <motion.div {...buttonTapPrimary}>
        <Link
          href="/host"
          className="inline-block bg-punch/90 backdrop-blur-sm hover:bg-punch-hover text-white font-display font-bold py-3 px-8 rounded-xl text-lg transition-colors"
        >
          Host a Game
        </Link>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Taglines                                                   */
/* ------------------------------------------------------------------ */

const LOADING_TAGLINES = [
  "Crunching the numbers...",
  "Tallying the votes...",
  "Ranking the contestants...",
  "Sizing up the matchups...",
  "Polishing the trophies...",
];

function LoadingSpinner() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % LOADING_TAGLINES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-16">
      <motion.div
        className="w-8 h-8 border-3 border-edge border-t-punch rounded-full mx-auto"
        animate={{ rotate: 360 }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          className="text-ink-dim text-sm mt-4"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {LOADING_TAGLINES[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch(() => setError("Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, [retryCount]);

  return (
    <main className="min-h-svh flex flex-col items-center px-4 sm:px-6 py-12 pt-16 relative overflow-hidden">
      {/* Background gradient blobs */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[120px] bg-gold opacity-[0.05]" />
        <div className="absolute bottom-[30%] right-[15%] w-[350px] h-[350px] rounded-full blur-[90px] bg-teal opacity-[0.04]" />
        <div className="absolute top-[55%] left-[8%] w-[250px] h-[250px] rounded-full blur-[70px] bg-punch opacity-[0.04]" />
      </div>

      <div className="w-full max-w-2xl lg:max-w-5xl relative z-10">
        {/* Back link */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Link
            href="/"
            className="text-sm text-ink-dim hover:text-ink transition-colors"
          >
            &larr; Back
          </Link>
        </motion.div>

        {/* Title */}
        <div className="text-center mb-8">
          <motion.h1
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-punch mb-2 title-glow"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
            }}
          >
            Leaderboard
          </motion.h1>
          <motion.p
            className="text-ink-dim text-sm"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            Who&rsquo;s the funniest? Human vs Machine vs Machine.
          </motion.p>
        </div>

        {/* Loading state */}
        {loading && <LoadingSpinner />}

        {/* Error state */}
        {error && (
          <div className="text-center py-16">
            <p className="text-fail text-sm mb-4">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setError("");
                setRetryCount((c) => c + 1);
              }}
              className="text-sm text-ink-dim hover:text-ink underline transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {data &&
          (data.stats.totalGames === 0 || data.leaderboard.length === 0) && (
            <EmptyState />
          )}

        {/* Main content */}
        {data && data.stats.totalGames > 0 && data.leaderboard.length > 0 && (
          <>
            {/* Stats Banner */}
            <StatsBanner stats={data.stats} />

            {/* Desktop: two-column layout — Rankings left, H2H + Hall of Fame right */}
            <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-10">
              {/* Leaderboard (left column on desktop) */}
              <motion.div
                className="mb-10 lg:mb-0"
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
              >
                <h2 className="text-sm font-medium text-ink-dim mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                  Rankings
                </h2>
                <LeaderboardChart entries={data.leaderboard} />
              </motion.div>

              {/* Right column on desktop: H2H + Hall of Fame stacked */}
              <div>
                {/* Head-to-Head */}
                {data.headToHead.length > 0 && (
                  <motion.div
                    className="mb-10"
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: 0.15 }}
                  >
                    <h2 className="text-sm font-medium text-ink-dim mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                      Human vs AI
                    </h2>
                    <HeadToHeadSection matchups={data.headToHead} />
                  </motion.div>
                )}

                {/* Hall of Fame */}
                {data.bestResponses.length > 0 && (
                  <motion.div
                    className="mb-10"
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: 0.3 }}
                  >
                    <h2 className="text-sm font-medium text-ink-dim mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-punch" />
                      Hall of Fame
                    </h2>
                    <HallOfFame responses={data.bestResponses} />
                  </motion.div>
                )}

                {/* AI Cost Breakdown */}
                {data.modelUsage && data.modelUsage.length > 0 && (
                  <motion.div
                    className="mb-10"
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: 0.45 }}
                  >
                    <h2 className="text-sm font-medium text-ink-dim mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                      AI Cost
                    </h2>
                    <ModelUsageSection
                      usages={data.modelUsage}
                      totalTokens={data.stats.totalTokens}
                      totalCost={data.stats.totalCost}
                    />
                  </motion.div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
