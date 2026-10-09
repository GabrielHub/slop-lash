"use client";

import { motion } from "motion/react";
import { PlayerAvatar } from "@/components/player-avatar";
import { ScoreBarChart } from "@/components/score-bar-chart";
import { sortPlayersByScore } from "@/games/core/player-rankings";
import {
  fadeInUp,
  springDefault,
  springGentle,
  staggerContainer,
  staggerContainerSlow,
} from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import { usePlayerName, usePlayers } from "@/room/context";
import {
  CrownIcon,
  HeartIcon,
  SparkleIcon,
  TypingDots,
  card,
  personaName,
  raised,
  type MatchslopMode,
} from "./primitives";

/** Who wrote what, once the winning line has gone out. */
export function RoundReveal({ mode }: { mode: MatchslopMode }) {
  const nameOf = usePlayerName();
  const round = mode.round;
  const winner = round?.answers.find((answer) => answer.id === round.winnerResponseId);
  if (!round || !winner) return null;
  const others = round.answers
    .filter((answer) => answer !== winner)
    .toSorted((left, right) => right.weightedVotes - left.weightedVotes);
  const alone = round.answers.length === 1;

  return (
    <motion.div className="space-y-3" variants={fadeInUp} initial="hidden" animate="visible">
      <div
        className="relative rounded-[1.25rem] overflow-hidden"
        style={{
          background: "var(--ms-raised)",
          border: "1.5px solid var(--gold)",
          boxShadow:
            "0 0 24px color-mix(in srgb, var(--gold) 15%, transparent), 0 2px 12px color-mix(in srgb, var(--gold) 8%, transparent) inset",
        }}
      >
        <div
          className="h-[3px] opacity-70"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, var(--gold) 30%, var(--gold) 70%, transparent 100%)",
          }}
        />
        <div style={{ padding: "clamp(1rem, 2vw, 1.75rem)", color: "var(--gold)" }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, -8, 8, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <CrownIcon size={20} />
              </motion.div>
              <span
                className="font-display font-bold uppercase tracking-wider"
                style={{ fontSize: "clamp(0.7rem, 0.85vw, 0.8rem)" }}
              >
                {alone ? "The only message" : "Winning line"}
              </span>
            </div>
            {!alone && (
              <span
                className="font-mono font-bold px-2.5 py-0.5 rounded-full"
                style={{
                  fontSize: "clamp(0.65rem, 0.75vw, 0.75rem)",
                  background: "var(--gold-soft)",
                }}
              >
                {winner.weightedVotes} vote{winner.weightedVotes === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p
            className="leading-relaxed break-words"
            style={{ fontSize: "clamp(1rem, 1.4vw, 1.3rem)", color: "var(--ms-ink)" }}
          >
            &ldquo;{winner.text}&rdquo;
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div
              className="w-1 h-[1.1em] rounded-full opacity-50"
              style={{ background: "var(--gold)" }}
            />
            <span
              className="font-display font-bold"
              style={{ fontSize: "clamp(0.8rem, 1vw, 0.95rem)" }}
            >
              {nameOf(winner.playerId)}
            </span>
            {winner.pointsEarned > 0 && (
              <span className="font-mono text-xs opacity-80">
                {formatSigned(winner.pointsEarned)}
              </span>
            )}
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <motion.div
          className="space-y-1.5"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {others.map((answer) => (
            <motion.div
              key={answer.id}
              className="flex items-baseline gap-3 rounded-xl px-3 py-2"
              style={raised}
              variants={fadeInUp}
            >
              <p
                className="flex-1 min-w-0 break-words"
                style={{ fontSize: "clamp(0.8rem, 0.95vw, 0.95rem)", color: "var(--ms-ink)" }}
              >
                {answer.text}
              </p>
              <span
                className="shrink-0 font-display font-bold"
                style={{ fontSize: "clamp(0.7rem, 0.8vw, 0.8rem)", color: "var(--ms-violet)" }}
              >
                {nameOf(answer.playerId)}
              </span>
              <span
                className="shrink-0 font-mono tabular-nums"
                style={{ fontSize: "clamp(0.65rem, 0.75vw, 0.75rem)", color: "var(--ms-ink-dim)" }}
              >
                {formatSigned(answer.pointsEarned)}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

export function Scoreboard() {
  const { players } = usePlayers();
  const sorted = sortPlayersByScore(players);
  return (
    <div className="mt-2">
      <span
        className="font-display font-bold uppercase tracking-wider block mb-2"
        style={{ fontSize: "clamp(0.6rem, 0.7vw, 0.7rem)", color: "var(--ms-ink-dim)" }}
      >
        Leaderboard
      </span>
      <motion.div
        className="flex flex-wrap gap-1.5"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {sorted.map((player, index) => {
          const leader = index === 0 && player.score > 0;
          return (
            <motion.div
              key={player.id}
              className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5"
              style={{
                background: leader ? "var(--gold-soft)" : "var(--ms-raised)",
                border: `1px solid ${leader ? "var(--gold)" : "var(--ms-edge)"}`,
                boxShadow: leader
                  ? "0 0 8px color-mix(in srgb, var(--gold) 15%, transparent)"
                  : "none",
                color: leader ? "var(--gold)" : "var(--ms-ink)",
              }}
              variants={{
                hidden: { opacity: 0, scale: 0.85 },
                visible: { opacity: 1, scale: 1, transition: springGentle },
              }}
            >
              {leader && <CrownIcon size={10} />}
              <PlayerAvatar name={player.name} modelId={player.modelId} size={18} />
              <span
                className="font-semibold truncate max-w-[6rem]"
                style={{ fontSize: "clamp(0.7rem, 0.8vw, 0.8rem)" }}
              >
                {player.name}
              </span>
              <span
                className="font-mono font-bold tabular-nums"
                style={{
                  fontSize: "clamp(0.7rem, 0.8vw, 0.8rem)",
                  color: leader ? "var(--gold)" : "var(--ms-ink-dim)",
                }}
              >
                {player.score}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

export function FinalStandings() {
  const { players } = usePlayers();
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-4" style={{ color: "var(--gold)" }}>
        <CrownIcon size={16} />
        <span
          className="font-display font-bold uppercase tracking-wider"
          style={{ fontSize: "clamp(0.7rem, 0.85vw, 0.8rem)" }}
        >
          Final standings
        </span>
        <div
          className="flex-1 h-px"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--gold) 30%, transparent), transparent)",
          }}
        />
      </div>
      <ScoreBarChart players={players} />
    </div>
  );
}

/** The persona's verdict on the room once the date is over. */
export function PostMortem({ mode }: { mode: MatchslopMode }) {
  const name = personaName(mode.persona);
  const postMortem = mode.postMortem;
  if (!postMortem) return null;
  const take = postMortem.value;

  if (!postMortem.pending && !take) {
    return (
      <motion.p
        className="rounded-2xl p-[clamp(1rem,2vw,1.5rem)] text-center"
        style={{ ...card, fontSize: "clamp(0.8rem, 1vw, 0.95rem)", color: "var(--ms-ink-dim)" }}
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        {name} had nothing to say.
      </motion.p>
    );
  }

  const section = { padding: "clamp(1rem,2vw,1.5rem)" };
  return (
    <motion.div
      className="rounded-[1.5rem] overflow-hidden"
      style={card}
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      <div
        className="flex items-center gap-2"
        style={{ ...section, borderBottom: take ? "1px solid var(--ms-edge)" : "none" }}
      >
        <div
          className="shrink-0 flex items-center justify-center rounded-lg w-[clamp(1.5rem,2vw,2rem)] h-[clamp(1.5rem,2vw,2rem)]"
          style={{ background: "var(--ms-rose-soft)", color: "var(--ms-rose)" }}
        >
          <HeartIcon size={14} />
        </div>
        <h3
          className="font-display font-bold"
          style={{ fontSize: "clamp(0.9rem, 1.2vw, 1.15rem)", color: "var(--ms-ink)" }}
        >
          {name}&apos;s take
        </h3>
        {postMortem.pending && (
          <span
            className="font-mono uppercase tracking-wider"
            style={{ fontSize: "clamp(0.55rem, 0.65vw, 0.65rem)", color: "var(--ms-ink-dim)" }}
          >
            typing...
          </span>
        )}
      </div>

      <div style={section}>
        {!take ? (
          <div className="flex items-center justify-center py-4">
            <TypingDots />
          </div>
        ) : (
          <motion.div
            className="space-y-[clamp(1rem,1.5vw,1.5rem)]"
            variants={staggerContainerSlow}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={fadeInUp}>
              <p
                className="font-display leading-relaxed italic"
                style={{ fontSize: "clamp(1rem, 1.4vw, 1.35rem)", color: "var(--ms-ink)" }}
              >
                &ldquo;{take.opening}&rdquo;
              </p>
              <p
                className="font-bold uppercase tracking-wider mt-2"
                style={{ fontSize: "clamp(0.6rem, 0.7vw, 0.7rem)", color: "var(--ms-rose)" }}
              >
                &mdash; {name}
              </p>
            </motion.div>

            {take.playerCallouts.length > 0 && (
              <motion.div className="grid gap-2 @xl:grid-cols-2" variants={fadeInUp}>
                {take.playerCallouts.map((callout, index) => (
                  <motion.div
                    key={callout.playerName}
                    className="rounded-xl"
                    style={{
                      ...raised,
                      padding: "clamp(0.75rem, 1.2vw, 1rem) clamp(1rem, 1.5vw, 1.25rem)",
                    }}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...springDefault, delay: index * 0.08 }}
                  >
                    <span
                      className="font-display font-bold"
                      style={{
                        fontSize: "clamp(0.8rem, 0.95vw, 0.95rem)",
                        color: "var(--ms-violet)",
                      }}
                    >
                      {callout.playerName}
                    </span>
                    <p
                      className="leading-relaxed mt-0.5"
                      style={{ fontSize: "clamp(0.8rem, 1vw, 1rem)", color: "var(--ms-ink)" }}
                    >
                      {callout.verdict}
                    </p>
                    {callout.favoriteLine && (
                      <p
                        className="mt-1.5 pl-3 leading-relaxed italic"
                        style={{
                          fontSize: "clamp(0.75rem, 0.9vw, 0.85rem)",
                          color: "var(--ms-ink-dim)",
                          borderLeft: "2px solid var(--ms-violet)",
                        }}
                      >
                        &ldquo;{callout.favoriteLine}&rdquo;
                      </p>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}

            <motion.div className="flex items-start gap-2.5" variants={fadeInUp}>
              <span className="shrink-0 mt-0.5" style={{ color: "var(--ms-coral)" }}>
                <SparkleIcon size={14} />
              </span>
              <div>
                <span
                  className="font-bold uppercase tracking-wider"
                  style={{ fontSize: "clamp(0.6rem, 0.7vw, 0.65rem)", color: "var(--ms-coral)" }}
                >
                  Standout moment
                </span>
                <p
                  className="leading-relaxed mt-0.5"
                  style={{ fontSize: "clamp(0.85rem, 1.1vw, 1.05rem)", color: "var(--ms-ink)" }}
                >
                  {take.favoriteMoment}
                </p>
              </div>
            </motion.div>

            <motion.p
              className="pt-2 leading-relaxed italic"
              style={{
                borderTop: "1px solid var(--ms-edge)",
                fontSize: "clamp(0.85rem, 1.1vw, 1.05rem)",
                color: "var(--ms-ink-dim)",
              }}
              variants={fadeInUp}
            >
              {take.finalThought}
            </motion.p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
