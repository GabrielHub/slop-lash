"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { AI_MODELS, getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
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

interface LeaderboardData {
  leaderboard: ContestantStats[];
  headToHead: HeadToHead[];
  bestResponses: BestResponse[];
  stats: {
    totalGames: number;
    totalPrompts: number;
    totalVotes: number;
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
            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Rank */}
              <span
                className={`w-6 text-center font-mono font-bold text-sm shrink-0 ${
                  isTop ? "text-gold" : "text-ink-dim"
                }`}
              >
                {idx + 1}
              </span>

              {/* Icon */}
              <div className="shrink-0">
                {model ? (
                  <ModelIcon model={model} size={22} />
                ) : (
                  <span className="w-[22px] h-[22px] flex items-center justify-center rounded-sm bg-human-soft text-human text-xs font-bold">
                    H
                  </span>
                )}
              </div>

              {/* Name */}
              <span
                className={`w-16 sm:w-24 text-sm font-semibold truncate shrink-0 ${
                  isTop ? "text-gold" : "text-ink"
                }`}
              >
                {entry.shortName}
              </span>

              {/* Bar track */}
              <div className="flex-1 h-8 rounded-lg bg-edge/40 relative overflow-hidden">
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
                className={`font-mono font-bold text-sm tabular-nums shrink-0 w-10 text-right ${
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
            <div className="flex gap-3 ml-[54px] sm:ml-[66px] mt-1.5">
              <span className="text-[11px] text-ink-dim/70 tabular-nums font-mono">
                {entry.winRate}% win
              </span>
              <span className="text-[11px] text-ink-dim/70 tabular-nums font-mono">
                {entry.totalResponses} resp
              </span>
              <span className="text-[11px] text-ink-dim/70 tabular-nums font-mono">
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
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
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
                <span className="w-4 h-4 flex items-center justify-center rounded-sm bg-human-soft text-human text-[10px] font-bold shrink-0">
                  H
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
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch(() => setError("Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, []);

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

      <div className="w-full max-w-2xl relative z-10">
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
            className="font-display text-4xl sm:text-5xl font-extrabold text-punch mb-2 title-glow"
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
        {loading && (
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
            <p className="text-ink-dim text-sm mt-4">
              Crunching the numbers...
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-16">
            <p className="text-fail text-sm">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {data && data.stats.totalGames === 0 && <EmptyState />}

        {/* Main content */}
        {data && data.stats.totalGames > 0 && (
          <>
            {/* Stats Banner */}
            <StatsBanner stats={data.stats} />

            {/* Leaderboard */}
            <motion.div
              className="mb-10"
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
          </>
        )}
      </div>
    </main>
  );
}
