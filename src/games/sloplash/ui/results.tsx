"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SloplashPrompt } from "../../../../convex/sloplash/view";
import { sortPlayersByScore } from "@/games/core/player-rankings";
import { computeAchievements, type PlayerAchievement } from "@/games/sloplash/achievements";
import {
  bestAnswers,
  matchupResult,
  type BestAnswer,
  type MatchupResult,
} from "@/games/sloplash/outcomes";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { CrownIcon } from "@/components/icons";
import { ModelIcon } from "@/components/model-icon";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerList } from "@/components/player-list";
import { PulsingDot } from "@/components/pulsing-dot";
import { ScoreBarChart } from "@/components/score-bar-chart";
import { fadeInUp, floatIn, popIn, springGentle, staggerContainerSlow } from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import { getModelByModelId } from "@/lib/models";
import { useModeView, usePlayerName, usePlayers, useRoom, type RoomPlayer } from "@/room/context";
import { useCelebration, type ConfettiBurst } from "@/room/effects";
import { OutcomeStamp } from "./matchup";

/** The AI leader's victory line, typed out while it is still being written. */
function WinnerTagline() {
  const { tagline } = useModeView("SLOPLASH");
  const { byId } = usePlayers();
  const winner = byId(tagline?.playerId);
  if (!tagline || !winner) return null;
  const model = winner.modelId ? getModelByModelId(winner.modelId) : null;
  const writing = tagline.text === null;

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto mb-8"
      variants={popIn}
      initial="hidden"
      animate="visible"
    >
      <div className="relative p-4 @5xl:p-6 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-gold/40 icon-glow-gold">
        <div className="flex items-center gap-2 mb-2">
          {model && <ModelIcon model={model} size={20} />}
          <span className="text-sm @5xl:text-[1rem] font-medium text-gold">
            {model?.shortName ?? winner.name} says:
          </span>
        </div>
        <p className="text-base @5xl:text-xl font-semibold text-ink leading-relaxed">
          {writing ? (
            <span className="inline-block w-[2px] h-[1em] bg-gold ml-0.5 align-middle animate-blink-cursor" />
          ) : (
            <>&ldquo;{tagline.text}&rdquo;</>
          )}
        </p>
      </div>
    </motion.div>
  );
}

function PromptResultCard({
  prompt,
  result,
  index,
}: {
  prompt: SloplashPrompt;
  result: MatchupResult;
  index: number;
}) {
  const { byId } = usePlayers();
  return (
    <motion.div
      className={`p-4 @5xl:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 ${
        result.isUnanimous ? "border-punch" : result.allPassed ? "border-ink-dim/30" : "border-edge"
      }`}
      style={{
        boxShadow: result.isUnanimous ? "0 0 20px rgba(255, 86, 71, 0.15)" : "var(--shadow-card)",
      }}
      variants={floatIn}
    >
      <p className="font-display font-semibold text-base @5xl:text-lg text-gold mb-4">
        {prompt.text}
      </p>
      <div className="space-y-3">
        {result.answers.map((entry, answerIndex) => {
          const author = byId(entry.answer.playerId);
          return (
            <div
              key={entry.answer.id}
              className={`p-3 rounded-xl relative overflow-hidden border-2 ${
                entry.isWinner ? "border-gold bg-gold-soft/80" : "border-edge bg-raised/80"
              }`}
            >
              <motion.div
                className={`absolute inset-0 ${entry.isWinner ? "bg-gold/10" : "bg-ink/[0.03]"}`}
                initial={{ width: "0%" }}
                animate={{ width: `${entry.pct}%` }}
                transition={{ ...springGentle, delay: 0.3 + answerIndex * 0.15 }}
              />
              <div className="relative flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-base @5xl:text-lg leading-snug text-ink">
                    {entry.answer.text}
                  </p>
                  <p className="flex items-center gap-1.5 mt-1">
                    {author && (
                      <PlayerAvatar name={author.name} modelId={author.modelId} size={16} />
                    )}
                    <span className="text-sm text-ink-dim">{author?.name ?? "Someone"}</span>
                    {entry.isWinner && (
                      <motion.span
                        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gradient-to-r from-gold/25 to-gold/15 text-gold border border-gold/20 ml-1"
                        variants={popIn}
                        initial="hidden"
                        animate="visible"
                        transition={{ delay: 0.6 + answerIndex * 0.15 }}
                      >
                        <CrownIcon className="w-3 h-3 animate-crown-shimmer" />
                        Winner
                      </motion.span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`font-mono font-bold text-base tabular-nums ${
                      entry.points < 0
                        ? "text-punch"
                        : entry.isWinner
                          ? "text-gold"
                          : "text-ink-dim"
                    }`}
                  >
                    {formatSigned(entry.points)}
                  </span>
                  <p className="text-xs text-ink-dim/80 tabular-nums">
                    {entry.votes.length} vote{entry.votes.length === 1 ? "" : "s"} ({entry.pct}%)
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <OutcomeStamp result={result} delay={0.8 + index * 0.2} />
      </div>
    </motion.div>
  );
}

/** Matchups that never reached a vote because someone ran out of time. */
function ForfeitedMatchups({ prompts }: { prompts: SloplashPrompt[] }) {
  const { byId } = usePlayers();
  const playerName = usePlayerName();
  if (prompts.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-xs font-medium text-ink-dim/50 uppercase tracking-wider mb-3">
        Forfeited matchups
      </p>
      <div className="grid gap-3 @3xl:grid-cols-2">
        {prompts.map((prompt) => {
          const survivor = prompt.answers.find((answer) => !answer.forfeited);
          const quitters = prompt.answers
            .filter((answer) => answer.forfeited)
            .flatMap((answer) => byId(answer.playerId) ?? []);
          return (
            <motion.div
              key={prompt.id}
              className="p-4 rounded-xl bg-surface/40 border border-edge/50 opacity-70"
              variants={fadeInUp}
            >
              <p className="font-display font-semibold text-sm text-gold/70 mb-2">{prompt.text}</p>
              {survivor && (
                <p className="text-sm text-ink-dim mb-2">
                  <span className="text-ink">{survivor.text}</span>{" "}
                  <span className="text-ink-dim/60">
                    &mdash; {playerName(survivor.playerId)} (auto-win)
                  </span>
                </p>
              )}
              {quitters.map((player) => (
                <span
                  key={player.id}
                  className="mr-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-punch/10 border border-punch/20 text-xs text-punch/80"
                >
                  <PlayerAvatar name={player.name} modelId={player.modelId} size={14} />
                  {player.name} ran out of time
                </span>
              ))}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** A burst from the middle, then a second from the right. */
function bursts(colors: string[]): ConfettiBurst[] {
  return [
    { particleCount: 80, spread: 70, origin: { y: 0.6 }, colors },
    {
      particleCount: 50,
      angle: 120,
      spread: 60,
      origin: { x: 0.75, y: 0.6 },
      colors,
      delayMs: 200,
    },
  ];
}

const SLOP_BURSTS = bursts(["#FF5647", "#FF8A80", "#FFD644"]);
const FINAL_BURSTS = bursts(["#FF5647", "#2DD4B8", "#FFD644"]);

/** Between rounds: every matchup's verdict and the standings. */
export function StageRoundResults() {
  const { room } = useRoom().view;
  const { round } = useModeView("SLOPLASH");
  const { players, byId } = usePlayers();
  const prompts = round?.prompts ?? [];
  const voted = prompts
    .filter((prompt) => prompt.votable)
    .map((prompt) => ({ prompt, result: matchupResult(prompt, (id) => byId(id)?.type) }));
  const forfeited = prompts.filter((prompt) => !prompt.votable);
  const isLast = room.round >= room.totalRounds;
  useCelebration(
    voted.some(({ result }) => result.isUnanimous),
    SLOP_BURSTS,
    { sound: "winner-reveal" },
  );

  return (
    <main className="@container flex-1 flex flex-col items-center px-6 py-8 @5xl:py-10">
      <div className="w-full max-w-6xl">
        <motion.div
          className="text-center mb-8"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <h1 className="font-display text-3xl @5xl:text-5xl font-bold mb-1 text-ink">
            Round {room.round} results
          </h1>
          <p className="text-ink-dim text-sm @5xl:text-[1rem]">
            Round {room.round} of {room.totalRounds}
          </p>
        </motion.div>

        <WinnerTagline />

        <div className="grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_300px]">
          <motion.div variants={staggerContainerSlow} initial="hidden" animate="visible">
            <div className="grid gap-5 @3xl:grid-cols-2">
              {voted.map(({ prompt, result }, index) => (
                <PromptResultCard key={prompt.id} prompt={prompt} result={result} index={index} />
              ))}
            </div>
            <ForfeitedMatchups prompts={forfeited} />
          </motion.div>

          <div className="@4xl:sticky @4xl:top-4 @4xl:self-start space-y-4">
            <h2 className="text-base font-medium text-ink-dim">Scoreboard</h2>
            <PlayerList players={sortPlayersByScore(players)} showScores />
            <div className="text-center py-2">
              <PulsingDot>
                <span className="text-sm">
                  {isLast ? "Final results are up next..." : "Next round starts soon..."}
                </span>
              </PulsingDot>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const PODIUM = [
  { place: 2, height: "h-24 @5xl:h-32", tone: "text-ink-dim", block: "bg-raised/80 border-edge" },
  {
    place: 1,
    height: "h-36 @5xl:h-48",
    tone: "text-gold",
    block: "bg-gold-soft/80 border-gold/60",
  },
  { place: 3, height: "h-16 @5xl:h-24", tone: "text-ink-dim", block: "bg-raised/60 border-edge" },
] as const;

function Podium({ ranked }: { ranked: RoomPlayer[] }) {
  return (
    <div className="flex items-end justify-center gap-3 @3xl:gap-6 mb-10">
      {PODIUM.map(({ place, height, tone, block }, index) => {
        const player = ranked[place - 1];
        if (!player) return null;
        return (
          <motion.div
            key={player.id}
            className="flex flex-col items-center w-28 @3xl:w-40 @5xl:w-48"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.3 + (2 - index) * 0.25 }}
          >
            {place === 1 && <CrownIcon className="w-8 h-8 @5xl:w-10 @5xl:h-10 text-gold mb-1" />}
            <PlayerAvatar
              name={player.name}
              modelId={player.modelId}
              size={place === 1 ? 48 : 36}
            />
            <p
              className={`mt-2 w-full truncate text-center font-display font-bold ${
                place === 1
                  ? "text-xl @5xl:text-2xl text-ink"
                  : "text-base @5xl:text-lg text-ui-soft"
              }`}
            >
              {player.name}
            </p>
            <p className={`font-mono font-bold tabular-nums ${tone}`}>
              {player.score.toLocaleString()}
            </p>
            <div
              className={`mt-2 w-full rounded-t-xl border-2 border-b-0 flex items-start justify-center pt-2 ${height} ${block}`}
            >
              <span className={`font-display font-black text-3xl @5xl:text-4xl ${tone}`}>
                {place}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function BestAnswersCarousel({ answers }: { answers: BestAnswer[] }) {
  const { byId } = usePlayers();
  const [current, setCurrent] = useState(0);
  const next = useCallback(
    () => setCurrent((index) => (index + 1) % answers.length),
    [answers.length],
  );
  useEffect(() => {
    if (answers.length <= 1) return;
    const interval = window.setInterval(next, 4000);
    return () => window.clearInterval(interval);
  }, [answers.length, next]);

  const item = answers[current];
  if (!item) return null;
  const author = byId(item.playerId);
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl min-h-[160px]">
        {answers.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              aria-label="Previous"
              onClick={() => setCurrent((index) => (index - 1 + answers.length) % answers.length)}
            />
            <button
              type="button"
              className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              aria-label="Next"
              onClick={next}
            />
          </>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="relative p-4 @5xl:p-6 rounded-xl bg-surface/88 backdrop-blur-md border-2 border-edge"
            style={{ boxShadow: "var(--shadow-card)" }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            <p className="text-xs @5xl:text-sm text-ink-dim mb-2 leading-snug">{item.promptText}</p>
            <p className="text-base @3xl:text-lg @5xl:text-2xl font-semibold text-ink leading-snug mb-4">
              &ldquo;{item.text}&rdquo;
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {author && <PlayerAvatar name={author.name} modelId={author.modelId} size={18} />}
                <span className="text-sm text-ui-muted truncate">{author?.name ?? "Someone"}</span>
                <span className="text-xs text-ui-soft">&middot; Round {item.round}</span>
              </div>
              <span
                className="font-mono font-bold text-lg text-gold tabular-nums shrink-0"
                style={{ textShadow: "0 0 12px rgba(255, 214, 68, 0.2)" }}
              >
                {item.pct}%
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {answers.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {answers.map((answer, index) => (
            <button
              key={`${answer.round}-${answer.promptText}`}
              type="button"
              className={`h-2 rounded-full transition-all cursor-pointer ${
                index === current ? "bg-gold w-5" : "w-2 bg-edge hover:bg-ink-dim/40"
              }`}
              aria-label={`Show answer ${index + 1}`}
              onClick={() => setCurrent(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function badgeTone(id: string) {
  switch (id) {
    case "mvp":
      return { border: "border-gold/50", icon: "bg-gold/20", text: "text-gold" };
    case "slopMaster":
    case "slopped":
      return { border: "border-punch/40", icon: "bg-punch/20", text: "text-punch" };
    case "aiSlayer":
      return { border: "border-teal/40", icon: "bg-teal/20", text: "text-teal" };
    default:
      return { border: "border-edge-strong", icon: "bg-raised", text: "text-ink" };
  }
}

export function AchievementBadge({ award, index }: { award: PlayerAchievement; index: number }) {
  const tone = badgeTone(award.achievement.id);
  return (
    <motion.div
      className={`shimmer-sweep p-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 ${tone.border} relative overflow-hidden`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.4 + index * 0.08, type: "spring", stiffness: 400, damping: 25 }}
    >
      <div className={`w-11 h-11 rounded-xl ${tone.icon} flex items-center justify-center mb-2.5`}>
        <span className="text-2xl leading-none">{award.achievement.icon}</span>
      </div>
      <p className={`font-display font-bold text-sm leading-tight ${tone.text}`}>
        {award.achievement.name}
      </p>
      <p className="text-sm text-ink-dim truncate mt-0.5">{award.playerName}</p>
      <p className="text-xs text-ink-dim/60 mt-1 leading-tight">{award.achievement.description}</p>
    </motion.div>
  );
}

/** The end of the game; also the public recap. */
export function StageFinal() {
  const { players, usage } = useRoom().view;
  const { rounds } = useModeView("SLOPLASH");
  const ranked = sortPlayersByScore(players);
  const best = bestAnswers(rounds);
  const awards = computeAchievements(rounds, players);
  useCelebration(true, FINAL_BURSTS, {
    sound: "game-over",
    followUp: { sound: "celebration", delayMs: 2000 },
  });

  return (
    <main className="@container flex-1 flex flex-col items-center px-6 py-8 @5xl:py-12">
      <div className="w-full max-w-5xl">
        <motion.h1
          className="text-center font-display text-5xl @5xl:text-7xl font-extrabold text-punch mb-8 title-glow"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          Game Over!
        </motion.h1>

        <Podium ranked={ranked} />
        <WinnerTagline />

        <div className="grid gap-10 @4xl:grid-cols-2 @4xl:gap-8 mb-10">
          <motion.section variants={fadeInUp} initial="hidden" animate="visible">
            <h2 className="text-base font-medium text-ink-dim mb-3">Scoreboard</h2>
            <ScoreBarChart players={ranked} />
          </motion.section>
          {best.length > 0 && (
            <motion.section variants={fadeInUp} initial="hidden" animate="visible">
              <h2 className="text-base font-medium text-ink-dim mb-3">Best moments</h2>
              <BestAnswersCarousel answers={best} />
            </motion.section>
          )}
        </div>

        {awards.length > 0 && (
          <section className="mb-10">
            <h2 className="text-base font-medium text-ink-dim mb-3">Awards</h2>
            <div className="grid grid-cols-2 @4xl:grid-cols-4 gap-3">
              {awards.map((award, index) => (
                <AchievementBadge
                  key={`${award.playerId}-${award.achievement.id}`}
                  award={award}
                  index={index}
                />
              ))}
            </div>
          </section>
        )}

        {usage && (
          <section className="mb-6">
            <h2 className="text-base font-medium text-ink-dim mb-3">AI usage</h2>
            <AiUsageBreakdown usage={usage} />
          </section>
        )}
      </div>
    </main>
  );
}
