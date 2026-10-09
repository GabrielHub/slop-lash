"use client";

import { motion } from "motion/react";
import type { SloplashAnswer, SloplashPrompt } from "../../../../convex/sloplash/view";
import { CheckIcon } from "@/components/icons";
import { PlayerAvatar } from "@/components/player-avatar";
import { PulsingDot } from "@/components/pulsing-dot";
import { Timer, usePhaseCountdown } from "@/components/timer";
import { sortPlayersByScore } from "@/games/core/player-rankings";
import { matchupResult, type MatchupResult } from "@/games/sloplash/outcomes";
import { roundMultiplier } from "@/games/sloplash/scoring";
import { fadeInUp, popIn, springDefault, staggerContainer } from "@/lib/animations";
import { useModeView, usePlayers, useRoom } from "@/room/context";
import { ProgressDots, RevealedMatchup, RunningScores, VoterChip, VsDivider } from "./matchup";
import { ReactionBar } from "./reaction-bar";

const COUNTDOWN_TONES = {
  urgent: { text: "text-fail", bar: "timer-bar-urgent" },
  warning: { text: "text-gold", bar: "timer-bar-warning" },
  normal: { text: "text-teal", bar: "timer-bar-normal" },
} as const;

/** The writing timer, big enough to read from the couch. */
function BigCountdown() {
  const countdown = usePhaseCountdown();
  if (countdown.untimed) return null;
  const tone = COUNTDOWN_TONES[countdown.urgency];
  return (
    <div className="w-full max-w-xl mx-auto text-center" role="timer" aria-live="off">
      <p
        className={`font-mono font-black tabular-nums leading-none text-7xl @3xl:text-8xl @6xl:text-[9rem] ${
          countdown.expired ? "text-ui-faint" : tone.text
        }`}
      >
        {countdown.expired ? "Time!" : countdown.remaining}
      </p>
      <div className="mt-5 h-3 bg-raised/80 rounded-full overflow-hidden border border-edge">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${tone.bar}`}
          style={{ width: `${countdown.pct}%` }}
        />
      </div>
    </div>
  );
}

/** Writing: who is still typing, against the clock. Prompts stay on the phones. */
export function StageWriting() {
  const { room, players } = useRoom().view;
  const { writing } = useModeView("SLOPLASH");
  const done = new Set<string>(writing?.finishedPlayerIds ?? []);
  return (
    <main className="@container flex-1 flex flex-col items-center px-6 py-8 @5xl:py-12">
      <motion.div
        className="w-full max-w-5xl flex flex-col items-center gap-8 @5xl:gap-12"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <div className="text-center">
          <h1 className="font-display font-bold text-ink text-4xl @5xl:text-6xl">
            Round {room.round}
          </h1>
          <p className="mt-3 text-ink-dim text-base @5xl:text-xl">
            Answer the prompts on your phone
            {room.round > 1 ? ` · points are worth ${roundMultiplier(room.round)}×` : ""}
          </p>
        </div>
        <BigCountdown />
        <div className="w-full">
          <p className="mb-3 text-center text-sm @5xl:text-[1rem] font-medium uppercase tracking-[0.2em] text-ui-soft">
            {done.size} of {players.length} done
          </p>
          <motion.ul
            className="grid grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4 gap-3 @5xl:gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {players.map((player) => {
              const finished = done.has(player.id);
              return (
                <motion.li
                  key={player.id}
                  layout
                  variants={popIn}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 @5xl:py-4 transition-colors ${
                    finished ? "border-win/40 bg-win-soft/80" : "border-edge bg-surface/70"
                  } ${player.online ? "" : "opacity-50"}`}
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <PlayerAvatar name={player.name} modelId={player.modelId} size={28} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink @5xl:text-lg">
                    {player.name}
                  </span>
                  {finished ? (
                    <motion.span className="text-win" variants={popIn}>
                      <CheckIcon size={20} />
                    </motion.span>
                  ) : (
                    <motion.span
                      className="h-2 w-2 rounded-full bg-teal"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      aria-label="Writing"
                    />
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        </div>
      </motion.div>
    </main>
  );
}

/** What the revealed matchup did to everyone's scores: writers, and voters who passed. */
function matchupDeltas(prompt: SloplashPrompt | undefined, result: MatchupResult | null) {
  const deltas = new Map<string, number>();
  for (const { answer, points } of result?.answers ?? []) {
    if (answer.playerId) deltas.set(answer.playerId, points);
  }
  for (const vote of prompt?.votes ?? []) {
    if (vote.penalty) deltas.set(vote.voterId, (deltas.get(vote.voterId) ?? 0) + vote.penalty);
  }
  return deltas;
}

/** Voting and reveal: one matchup at a time, then its verdict. */
export function StageMatchup() {
  const { room } = useRoom().view;
  const mode = useModeView("SLOPLASH");
  const { players, byId } = usePlayers();
  const prompt = mode.round?.prompts.find((candidate) => candidate.id === mode.currentPromptId);
  const revealing = room.phase === "REVEAL";
  const total = mode.matchupCount;
  const result = revealing && prompt ? matchupResult(prompt, (id) => byId(id)?.type) : null;

  return (
    <main className="@container flex-1 flex flex-col items-center px-5 @3xl:px-10 @6xl:px-16 py-8 @5xl:py-10">
      <div className="w-full max-w-6xl">
        <div className="flex flex-col items-center gap-3 mb-6 @5xl:mb-8">
          <span
            className={`inline-block px-4 py-1 rounded-full text-xs @5xl:text-sm font-bold uppercase tracking-[0.2em] border ${
              revealing
                ? "bg-gold/20 text-gold border-gold/40"
                : "bg-punch/20 text-punch border-punch/40"
            }`}
          >
            {revealing ? "Results" : "Vote now"} · Matchup {room.step + 1}/{Math.max(total, 1)}
          </span>
          <ProgressDots total={total} current={room.step} revealing={revealing} />
          {!revealing && (
            <div className="w-full max-w-md">
              <Timer label="Voting closes in" />
            </div>
          )}
        </div>

        {prompt ? (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
          >
            <p className="mb-8 @5xl:mb-10 font-display font-extrabold text-3xl @3xl:text-4xl @6xl:text-5xl @7xl:text-6xl text-gold leading-tight text-center text-balance">
              {prompt.text}
            </p>
            {result ? <RevealedMatchup result={result} /> : <VotingMatchup prompt={prompt} />}
          </motion.div>
        ) : (
          <div className="text-center py-20">
            <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-edge border-t-teal animate-spin" />
            <p className="text-ink-dim text-lg">Tallying results...</p>
          </div>
        )}

        {mode.round && (
          <motion.div
            className="mt-8 @5xl:mt-10"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springDefault, delay: 0.2 }}
          >
            <RunningScores
              players={sortPlayersByScore(players)}
              deltas={matchupDeltas(prompt, result)}
            />
          </motion.div>
        )}
      </div>
    </main>
  );
}

function AnonymousAnswer({ answer, from }: { answer: SloplashAnswer; from: "left" | "right" }) {
  return (
    <motion.div
      className="relative p-6 @3xl:p-8 @6xl:p-10 rounded-2xl bg-surface/88 backdrop-blur-md border-2 border-edge flex flex-col justify-between"
      style={{ boxShadow: "var(--shadow-card)" }}
      initial={{ opacity: 0, x: from === "left" ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
    >
      <p className="text-xl @3xl:text-2xl @6xl:text-3xl @7xl:text-4xl leading-snug text-ink font-medium">
        {answer.text}
      </p>
      <ReactionBar answer={answer} size="lg" />
    </motion.div>
  );
}

/** Both answers, anonymous, and how many of the judges have voted. */
function VotingMatchup({ prompt }: { prompt: SloplashPrompt }) {
  const { players } = usePlayers();
  const judges = players.filter((player) => !prompt.assigneeIds.includes(player.id));
  const voted = new Set<string>(prompt.votes.map((vote) => vote.voterId));
  const [first, second] = prompt.answers;
  if (!first || !second) return null;

  return (
    <div className="space-y-6 @5xl:space-y-8">
      <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-stretch gap-4 @2xl:gap-2">
        <AnonymousAnswer answer={first} from="left" />
        <VsDivider className="text-ink-dim/30 text-lg @3xl:text-2xl" />
        <AnonymousAnswer answer={second} from="right" />
      </div>

      <div className="flex flex-col items-center gap-3">
        <PulsingDot>
          <span className="@5xl:text-lg">
            {voted.size} of {judges.length} votes in
          </span>
        </PulsingDot>
        <div className="flex flex-wrap justify-center gap-2">
          {judges.map((judge) => (
            <span
              key={judge.id}
              className={`transition-opacity ${voted.has(judge.id) ? "" : "opacity-35"}`}
            >
              <VoterChip player={judge} large />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
