"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SloplashVote } from "../../../../convex/sloplash/view";
import type { AnswerResult, MatchupResult } from "@/games/sloplash/outcomes";
import { CrownIcon, SlopIcon } from "@/components/icons";
import { PlayerAvatar } from "@/components/player-avatar";
import { scaleIn, springBouncy, springGentle } from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import { usePlayers, type RoomPlayer } from "@/room/context";
import { useCelebration, type ConfettiBurst } from "@/room/effects";
import { ReactionBar } from "./reaction-bar";

/**
 * "VS" between two answers: a rule across them when stacked, and down
 * between them once the surrounding container is wide enough to sit them
 * side by side.
 */
export function VsDivider({
  className = "text-ink-dim/40 text-xs @2xl:text-lg",
}: {
  className?: string;
}) {
  return (
    <motion.div
      className="flex @2xl:flex-col items-center justify-center gap-3 py-1 @2xl:py-0"
      variants={scaleIn}
      initial="hidden"
      animate="visible"
    >
      <div className="h-px @2xl:h-auto @2xl:w-px flex-1 bg-edge" />
      <span className={`font-display font-black tracking-[0.3em] ${className}`}>VS</span>
      <div className="h-px @2xl:h-auto @2xl:w-px flex-1 bg-edge" />
    </motion.div>
  );
}

/** Where the room is in the round's matchups. */
export function ProgressDots({
  total,
  current,
  revealing,
}: {
  total: number;
  current: number;
  revealing: boolean;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <motion.div
          key={index}
          className={`rounded-full transition-colors duration-300 ${
            index < current
              ? "bg-teal w-1.5 h-1.5"
              : index > current
                ? "bg-edge-strong w-1.5 h-1.5"
                : revealing
                  ? "bg-gold w-2.5 h-2.5"
                  : "bg-punch w-2.5 h-2.5"
          }`}
          animate={index === current ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/** A small avatar-and-name chip for a voter. */
export function VoterChip({ player, large = false }: { player: RoomPlayer; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-surface/85 border border-edge font-medium ${
        large
          ? "gap-2 px-3 py-1.5 text-sm text-ui-soft"
          : "gap-1.5 px-2.5 py-1 text-xs text-ink-dim"
      }`}
    >
      <PlayerAvatar name={player.name} modelId={player.modelId} size={large ? 18 : 14} />
      <span className="truncate max-w-[6rem]">{player.name}</span>
    </span>
  );
}

function VoterRow({ label, votes, tone }: { label: string; votes: SloplashVote[]; tone: string }) {
  const { byId } = usePlayers();
  const voters = votes.flatMap((vote) => byId(vote.voterId) ?? []);
  if (voters.length === 0) return null;
  return (
    <motion.div
      className="flex justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
    >
      <div
        className={`inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-lg border text-sm ${tone}`}
      >
        <span className="font-medium">{label}</span>
        {voters.map((voter) => (
          <VoterChip key={voter.id} player={voter} />
        ))}
      </div>
    </motion.div>
  );
}

function StampFrame({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <motion.div
      className="flex justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The verdict slammed onto a revealed matchup: ALL PASSED, SLOPPED!,
 * FLAWLESS!, "Lost to the slop", or a tie. `large` is the reveal's version.
 */
export function OutcomeStamp({
  result,
  delay,
  large = false,
}: {
  result: Pick<MatchupResult, "allPassed" | "isUnanimous" | "aiBeatsHuman" | "isTie">;
  delay: number;
  large?: boolean;
}) {
  const { allPassed, isUnanimous, aiBeatsHuman, isTie } = result;
  useCelebration(allPassed || isUnanimous, [], {
    followUp: { sound: "stamp-slam", delayMs: delay * 1000 },
  });

  const word = large
    ? "font-display font-black tracking-[0.2em] uppercase text-2xl @3xl:text-4xl @6xl:text-5xl"
    : "font-display font-black tracking-[0.15em] uppercase text-lg";
  const caption = `font-bold uppercase tracking-wider ${large ? "text-sm" : "text-[10px]"}`;
  const box = large ? "px-10 py-4 rounded-xl border-3" : "px-5 py-2 rounded-lg border-2";

  if (allPassed) {
    return (
      <StampFrame delay={delay}>
        <div
          className={`animate-stamp-slam inline-flex flex-col items-center gap-0.5 ${box} border-ink-dim/40 bg-ink/5`}
        >
          <span className={`${word} text-ink-dim`}>All passed</span>
          <span className={`${caption} text-ink-dim/60`}>Penalty applied</span>
        </div>
      </StampFrame>
    );
  }
  if (isUnanimous && aiBeatsHuman) {
    return (
      <StampFrame delay={delay}>
        <div
          className={`animate-stamp-slam inline-flex flex-col items-center gap-0.5 ${box} border-punch bg-punch/15`}
          style={{
            boxShadow: "0 0 40px rgba(255, 86, 71, 0.25)",
            textShadow: "0 0 20px rgba(255, 86, 71, 0.4)",
          }}
        >
          <span className={`${word} text-punch`}>Slopped!</span>
          <span className={`${caption} text-punch/70`}>Obliterated by the machine</span>
        </div>
      </StampFrame>
    );
  }
  if (isUnanimous) {
    return (
      <StampFrame delay={delay}>
        <div
          className={`animate-stamp-slam inline-flex items-center ${box} border-teal bg-teal/15`}
          style={{
            boxShadow: "0 0 40px rgba(45, 212, 184, 0.25)",
            textShadow: "0 0 20px rgba(45, 212, 184, 0.4)",
          }}
        >
          <span className={`${word} text-teal`}>Flawless!</span>
        </div>
      </StampFrame>
    );
  }
  if (aiBeatsHuman) {
    return (
      <StampFrame delay={delay + 0.1}>
        <div
          className={`animate-slop-drip inline-flex items-center gap-2 rounded-lg border-2 border-punch/30 bg-gradient-to-b from-punch/10 to-punch/5 ${
            large ? "px-8 py-3" : "px-4 py-1.5"
          }`}
          style={{ boxShadow: "0 4px 20px rgba(255, 86, 71, 0.12)" }}
        >
          <SlopIcon className={`text-punch/60 ${large ? "w-6 h-6" : "w-4 h-4"}`} />
          <span
            className={`font-display font-bold text-punch uppercase tracking-wider ${large ? "text-lg" : "text-sm"}`}
          >
            Lost to the slop
          </span>
          <SlopIcon className={`text-punch/60 ${large ? "w-6 h-6" : "w-4 h-4"}`} />
        </div>
      </StampFrame>
    );
  }
  if (isTie) {
    return (
      <StampFrame delay={delay}>
        <span
          className={`inline-flex items-center px-5 py-2 rounded-lg border border-gold/30 bg-gold/10 font-display font-bold text-gold ${large ? "text-lg" : "text-sm"}`}
        >
          It&apos;s a tie!
        </span>
      </StampFrame>
    );
  }
  return null;
}

function revealCardTone(entry: AnswerResult, result: MatchupResult) {
  if (entry.isWinner) {
    return {
      card: "border-teal bg-teal-soft/90",
      shadow: "0 0 18px rgba(14, 163, 146, 0.18), 0 0 36px rgba(14, 163, 146, 0.05)",
      bar: "bg-teal",
      fill: "bg-teal/8",
      pct: "text-teal",
    };
  }
  if (result.isTie) {
    return {
      card: "border-gold/50 bg-gold-soft/70",
      shadow: "var(--shadow-card)",
      bar: "bg-gold/70",
      fill: "bg-ink/[0.02]",
      pct: "text-gold",
    };
  }
  if (result.aiBeatsHuman) {
    return {
      card: "border-punch/35 bg-fail-soft/45",
      shadow: "0 0 14px rgba(255, 86, 71, 0.08)",
      bar: "bg-punch/60",
      fill: "bg-punch/5",
      pct: "text-ink-dim/40",
    };
  }
  return {
    card: "border-edge bg-surface/70",
    shadow: "var(--shadow-card)",
    bar: "bg-edge",
    fill: "bg-ink/[0.02]",
    pct: "text-ink-dim/40",
  };
}

function RevealCard({
  entry,
  result,
  side,
}: {
  entry: AnswerResult;
  result: MatchupResult;
  side: "left" | "right";
}) {
  const { byId } = usePlayers();
  const author = byId(entry.answer.playerId);
  const tone = revealCardTone(entry, result);
  return (
    <motion.div
      className={`p-5 @3xl:p-8 @6xl:p-10 rounded-2xl border-2 relative overflow-hidden flex flex-col ${tone.card}`}
      style={{ boxShadow: tone.shadow }}
      initial={{ opacity: 0, x: side === "left" ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.bar}`} />
      <motion.div
        className={`absolute inset-0 ${tone.fill}`}
        initial={{ width: "0%" }}
        animate={{ width: `${entry.pct}%` }}
        transition={{ ...springGentle, delay: 0.3 }}
      />
      <div className="relative flex flex-col flex-1">
        {entry.isWinner && (
          <motion.div
            className="absolute -top-1 -right-1 z-10"
            initial={{ opacity: 0, scale: 0, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ ...springBouncy, delay: 0.8 }}
          >
            <span
              className="animate-crown-shimmer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-teal to-teal-hover text-white font-display font-bold uppercase tracking-wider text-xs @3xl:text-sm"
              style={{ boxShadow: "0 2px 8px rgba(14, 163, 146, 0.3)" }}
            >
              <CrownIcon className="w-4 h-4" />
              Winner
            </span>
          </motion.div>
        )}
        <p
          className={`text-xl @3xl:text-2xl @6xl:text-3xl @7xl:text-4xl leading-snug text-ink mb-3 font-medium flex-1 ${entry.isWinner ? "pr-20" : ""}`}
        >
          {entry.answer.text}
        </p>
        <div className="flex items-end justify-between gap-3 mt-auto">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm @3xl:text-[1rem] text-ui-soft font-medium">
              {author && <PlayerAvatar name={author.name} modelId={author.modelId} size={18} />}
              <span className="truncate">{author?.name ?? "Someone"}</span>
            </p>
            {entry.votes.length > 0 && (
              <motion.div
                className="flex flex-wrap gap-1 mt-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                {entry.votes.map((vote) => {
                  const voter = byId(vote.voterId);
                  return voter ? <VoterChip key={vote.voterId} player={voter} large /> : null;
                })}
              </motion.div>
            )}
            <ReactionBar answer={entry.answer} size="lg" />
          </div>
          <motion.div
            className="text-right shrink-0"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springBouncy, delay: 0.4 }}
          >
            <span
              className={`text-4xl @3xl:text-5xl @6xl:text-6xl font-mono font-black tabular-nums ${tone.pct}`}
            >
              {entry.pct}
              <span className="text-lg @3xl:text-2xl">%</span>
            </span>
            <p className="text-sm @3xl:text-[1rem] text-ui-faint tabular-nums">
              {entry.votes.length} vote{entry.votes.length === 1 ? "" : "s"}
            </p>
            <motion.p
              className={`font-mono font-black tabular-nums text-lg @3xl:text-xl mt-1 ${
                entry.points < 0 ? "text-punch" : entry.isWinner ? "text-gold" : "text-ink-dim/50"
              }`}
              initial={{ opacity: 0, scale: 0.3, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...springBouncy, delay: 1 }}
            >
              {formatSigned(entry.points)}
            </motion.p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

const FLAWLESS_COLORS = ["#2DD4B8", "#FFD644", "#5DDFC8"];
const SLOPPED_COLORS = ["#FF5647", "#FF8A80", "#FF6E62"];

/** A flawless win bursts from the middle; a slopping fires red from both sides. */
function revealBursts(slopped: boolean): ConfettiBurst[] {
  if (slopped) {
    const side = { particleCount: 40, spread: 55, colors: SLOPPED_COLORS, startVelocity: 30 };
    return [
      { ...side, angle: 60, origin: { x: 0, y: 0.6 }, delayMs: 800 },
      { ...side, angle: 120, origin: { x: 1, y: 0.6 }, delayMs: 800 },
    ];
  }
  return [
    {
      particleCount: 60,
      spread: 80,
      origin: { y: 0.55 },
      colors: FLAWLESS_COLORS,
      startVelocity: 28,
      delayMs: 800,
    },
    {
      particleCount: 30,
      spread: 50,
      origin: { x: 0.3, y: 0.5 },
      colors: FLAWLESS_COLORS.slice(0, 2),
      startVelocity: 20,
      delayMs: 1100,
    },
  ];
}

/** A revealed matchup: who wrote what, who voted for it, and the verdict. */
export function RevealedMatchup({ result }: { result: MatchupResult }) {
  useCelebration(result.isUnanimous, revealBursts(result.aiBeatsHuman), {
    sound: "winner-reveal",
  });
  const [first, second] = result.answers;
  if (!first || !second) return null;
  return (
    <div className="space-y-5 @3xl:space-y-6">
      <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] items-stretch gap-3 @2xl:gap-4">
        <RevealCard entry={first} result={result} side="left" />
        <VsDivider className="text-ink-dim/25 text-sm @3xl:text-xl" />
        <RevealCard entry={second} result={result} side="right" />
      </div>
      <OutcomeStamp result={result} delay={0.6} large />
      <VoterRow
        label="Passed:"
        votes={result.passed}
        tone="border-edge bg-surface/50 text-ink-dim/60"
      />
      <VoterRow
        label="No vote:"
        votes={result.timedOut}
        tone="border-punch/30 bg-punch/5 text-punch/70"
      />
    </div>
  );
}

/** Everyone's score as the round's matchups are revealed, with the last swing. */
export function RunningScores({
  players,
  deltas,
}: {
  players: RoomPlayer[];
  deltas: ReadonlyMap<string, number>;
}) {
  return (
    <div className="flex items-center justify-center gap-x-5 gap-y-2 flex-wrap px-4 py-3 rounded-xl bg-surface/60 backdrop-blur-sm border border-edge">
      <span className="text-xs font-medium text-ui-soft uppercase tracking-wider shrink-0">
        Scores
      </span>
      {players.map((player, index) => {
        const delta = deltas.get(player.id) ?? 0;
        return (
          <motion.div key={player.id} className="flex items-center gap-1.5" layout>
            <PlayerAvatar name={player.name} modelId={player.modelId} size={18} />
            <span className="text-sm font-medium text-ink truncate max-w-[7rem]">
              {player.name}
            </span>
            <AnimatePresence mode="popLayout">
              {delta !== 0 && (
                <motion.span
                  key={`${player.id}-${delta}`}
                  className={`text-xs font-mono font-bold tabular-nums ${delta > 0 ? "text-teal/80" : "text-punch/80"}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={springBouncy}
                >
                  {formatSigned(delta)}
                </motion.span>
              )}
            </AnimatePresence>
            <motion.span
              key={`${player.id}-${player.score}`}
              className={`font-mono font-bold text-sm tabular-nums ${index === 0 ? "text-gold" : "text-ink"}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springBouncy}
            >
              {player.score.toLocaleString()}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}
