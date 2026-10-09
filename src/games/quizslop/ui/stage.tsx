"use client";

import { motion } from "motion/react";
import { Timer } from "@/components/timer";
import { fadeInUp, popIn, staggerContainer, staggerContainerSlow } from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import { usePlayerName, usePlayers, useRoom } from "@/room/context";
import { CALL_SLOP_POINTS } from "../game-constants";
import {
  AWARD_LABELS,
  CategoryTag,
  CheckIcon,
  ClockIcon,
  FlowProgress,
  HandIcon,
  PlayerProgress,
  PointValueTag,
  RevealCard,
  RoundKindBadge,
  TokenChips,
  TrophyIcon,
  VoiceLine,
  deltaColor,
  useQuizslop,
} from "./shared";

/** The on-air big screen: phase content over a studio glow, scores along the bottom. */
export function Stage() {
  const { room } = useRoom().view;
  const finished = room.status === "FINISHED";
  return (
    <div className="@container relative flex flex-1 flex-col" style={{ color: "var(--qs-ink)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% -5%, var(--qs-marquee-soft) 0%, transparent 70%), radial-gradient(ellipse 45% 40% at 85% 90%, var(--qs-signal-soft) 0%, transparent 70%)",
        }}
      />
      {!finished && (
        <div className="relative px-4 pt-4 @3xl:px-8 @3xl:pt-6">
          <FlowProgress help />
        </div>
      )}
      <div className="relative flex-1 px-4 py-6 @3xl:px-8 @3xl:py-10">
        {finished ? <StageFinal /> : <StagePhase />}
      </div>
      <footer
        className="relative flex flex-col gap-3 border-t px-4 py-3 @3xl:px-6"
        style={{ borderColor: "var(--qs-edge)" }}
      >
        <Timer />
        <VoiceLine />
        {!finished && <ScoreboardStrip />}
      </footer>
    </div>
  );
}

function StagePhase() {
  const { phase } = useRoom().view.room;
  switch (phase) {
    case "TOPIC":
      return <StageTopic />;
    case "CALL":
      return <StageCall />;
    case "ANSWER":
      return <StageAnswer />;
    case "REVEAL":
      return <StageReveal />;
    case "ROUND_RESULTS":
      return <StageRoundResults />;
    case "HOUSE_VOTE":
      return <StageHouseVote />;
    default:
      return null;
  }
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center">
      <h2
        className="font-display text-3xl font-black uppercase tracking-wide @2xl:text-5xl"
        style={{ color: "var(--qs-ink)" }}
      >
        {title}
      </h2>
      {hint && (
        <p
          className="mx-auto mt-2 max-w-md text-sm @2xl:text-base"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/* ─── Lobby ─── */

/** Who has picked which Home Topic; anyone who skips is dealt one at the start. */
export function StageLobby() {
  const { lobby } = useQuizslop();
  const { players } = usePlayers();
  if (!lobby) return null;
  const picks = new Map(
    lobby.topics.flatMap((topic) => (topic.claimedBy ? [[topic.claimedBy, topic]] : [])),
  );
  return (
    <section
      className="rounded-2xl border p-4 lg:p-5"
      style={{
        borderColor: "var(--qs-edge)",
        background: "var(--qs-surface)",
        color: "var(--qs-ink)",
      }}
    >
      <h2 className="font-display text-lg font-black uppercase tracking-wide">Home topics</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
        Pick a topic you actually know on your phone. Skip it and the house deals you one.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {players.map((player) => {
          const topic = picks.get(player.id);
          return (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              style={{ borderColor: "var(--qs-edge)", background: "var(--qs-raised)" }}
            >
              <span className="truncate font-display font-bold">{player.name}</span>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 truncate font-mono text-xs font-bold uppercase tracking-wider"
                style={{ color: topic ? "var(--qs-win)" : "var(--qs-ink-dim)" }}
              >
                {topic ? <CheckIcon size={11} /> : <ClockIcon size={11} />}
                {topic ? topic.label : "Picking"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─── Round phases ─── */

function StageTopic() {
  const { round } = useQuizslop();
  const name = usePlayerName();
  if (!round?.topic) return null;
  const finale = round.kind === "HOUSE_CHOICE";
  return (
    <motion.section
      variants={staggerContainerSlow}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center"
    >
      <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-2">
        <RoundKindBadge kind={round.kind} />
        <CategoryTag category={round.topic.category} />
        <PointValueTag pointValue={round.pointValue} finale={finale} />
      </motion.div>
      <motion.h2
        variants={popIn}
        className="qs-marquee-text text-balance font-display text-4xl font-black leading-[0.95] tracking-tight @2xl:text-6xl @5xl:text-8xl"
        style={{ color: "var(--qs-marquee)" }}
      >
        {round.topic.label}
      </motion.h2>
      <motion.p
        variants={fadeInUp}
        className="max-w-2xl text-balance text-base @2xl:text-lg"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        {round.topic.scope}
      </motion.p>
      {round.ownerPlayerId && (
        <motion.p
          variants={fadeInUp}
          className="inline-flex items-center gap-2 rounded-full border-2 px-5 py-2 font-display text-lg font-bold @2xl:text-xl"
          style={{ borderColor: "var(--qs-signal)", background: "var(--qs-signal-soft)" }}
        >
          <TrophyIcon size={18} />
          {name(round.ownerPlayerId)}&apos;s Home Turf
        </motion.p>
      )}
    </motion.section>
  );
}

function StageCall() {
  const { calls } = useQuizslop();
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <Heading
        title="Call Slop"
        hint="Spend a token to bet a friend misses, or hold. Targets stay secret until calls close."
      />
      <p className="font-mono text-sm font-bold" style={{ color: "var(--qs-punch)" }}>
        Miss: +{CALL_SLOP_POINTS} · Right: -{CALL_SLOP_POINTS}
      </p>
      <PlayerProgress label="Calls locked" doneIds={calls.decidedPlayerIds} />
    </section>
  );
}

function StageAnswer() {
  const { answer } = useQuizslop();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
      <Heading
        title="Answer privately"
        hint="Questions are live on your phones. Lock one answer and keep a straight face."
      />
      <PlayerProgress label="Answers locked" doneIds={answer?.lockedPlayerIds ?? []} />
      <CallStamps />
    </section>
  );
}

/** Who called Slop on whom, stamped once calls close. */
function CallStamps() {
  const { calls } = useQuizslop();
  const name = usePlayerName();
  if (calls.list.length === 0) {
    if (calls.decidedPlayerIds.length === 0) return null;
    return (
      <p
        className="inline-flex items-center gap-2 rounded-2xl border px-6 py-4 font-display text-xl font-bold"
        style={{
          borderColor: "var(--qs-edge)",
          background: "var(--qs-surface)",
          color: "var(--qs-ink-dim)",
        }}
      >
        <HandIcon size={20} /> Everybody held
      </p>
    );
  }
  return (
    <motion.ul
      variants={staggerContainerSlow}
      initial="hidden"
      animate="visible"
      className="flex w-full flex-col items-center gap-3"
      aria-label="Slop Calls"
    >
      {calls.list.map((call, index) => (
        <motion.li
          key={call.callerId}
          variants={popIn}
          className="qs-stamp w-full max-w-lg rounded-xl border-4 px-5 py-3 text-center"
          style={{
            borderColor: "var(--qs-punch)",
            background: "var(--qs-surface)",
            boxShadow: "var(--qs-shadow)",
            rotate: index % 2 === 0 ? "-1.2deg" : "1.4deg",
          }}
        >
          <p className="font-display text-xl font-black @2xl:text-2xl">
            {name(call.callerId)}
            <span
              className="mx-2 font-mono text-base font-bold uppercase"
              style={{ color: "var(--qs-punch)" }}
            >
              calls slop on
            </span>
            {name(call.targetId)}
          </p>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function StageReveal() {
  const { reveal, revealTotal } = useQuizslop();
  const { step } = useRoom().view.room;
  const hero = reveal[step] ?? reveal.at(-1);
  const earlier = reveal.filter((question) => question !== hero);
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <p
        className="text-center font-mono text-sm font-bold uppercase tracking-[0.3em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Question {Math.min(step + 1, revealTotal)} of {revealTotal}
      </p>
      {hero && <RevealCard question={hero} />}
      {earlier.length > 0 && (
        <div className="flex flex-col gap-2">
          <p
            className="font-mono text-sm font-bold uppercase tracking-[0.25em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Already revealed
          </p>
          {earlier.map((question) => (
            <RevealCard key={question.questionId} question={question} compact />
          ))}
        </div>
      )}
    </section>
  );
}

function StageRoundResults() {
  const { round, calls } = useQuizslop();
  const { room } = useRoom().view;
  const name = usePlayerName();

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="text-center">
        <p
          className="font-mono text-sm font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Round {room.round} of {room.totalRounds}
        </p>
        <h2 className="mt-1 font-display text-3xl font-black uppercase tracking-wide @2xl:text-4xl">
          Round scores
        </h2>
      </div>

      <motion.ul
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-2 @lg:grid-cols-2 @4xl:grid-cols-4"
      >
        {round?.scores.map((score) => (
          <motion.li
            key={score.playerId}
            variants={fadeInUp}
            className="flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-2"
            style={{
              background: "var(--qs-surface)",
              borderColor: "var(--qs-edge)",
              boxShadow: "var(--qs-shadow)",
            }}
          >
            <span className="truncate font-display text-base font-bold">
              {name(score.playerId)}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs font-bold tabular-nums">
              <span style={{ color: deltaColor(score.quiz) }}>{formatSigned(score.quiz)} quiz</span>
              <span style={{ color: deltaColor(score.calls) }}>
                {formatSigned(score.calls)} calls
              </span>
            </span>
          </motion.li>
        ))}
      </motion.ul>

      {calls.list.length > 0 && (
        <div className="flex flex-col gap-2">
          <p
            className="font-mono text-sm font-bold uppercase tracking-[0.25em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Slop Calls
          </p>
          <div className="grid gap-2 @lg:grid-cols-2 @4xl:grid-cols-4">
            {calls.list.map((call) => (
              <p
                key={call.callerId}
                className="min-w-0 rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--qs-edge)", background: "var(--qs-surface)" }}
              >
                <span className="block truncate">
                  <span className="font-bold">{name(call.callerId)}</span> → {name(call.targetId)}
                </span>
                <span
                  className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider"
                  style={{ color: deltaColor(call.delta) }}
                >
                  {call.outcome === "WON" ? (
                    <CheckIcon size={12} />
                  ) : call.outcome === "LOST" ? (
                    <ClockIcon size={12} />
                  ) : (
                    <HandIcon size={12} />
                  )}
                  {call.outcome === "WON"
                    ? `Called it ${formatSigned(call.delta)}`
                    : call.outcome === "LOST"
                      ? `Busted ${formatSigned(call.delta)}`
                      : "Refunded"}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StageHouseVote() {
  const { houseVote, round } = useQuizslop();
  if (!houseVote) return null;
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8">
      <Heading
        title="Vote the final topic"
        hint={
          round ? `Every finale question is worth ${round.pointValue}. Choose wisely.` : undefined
        }
      />
      <motion.ul
        variants={staggerContainerSlow}
        initial="hidden"
        animate="visible"
        className="grid w-full gap-4 @2xl:grid-cols-3"
      >
        {houseVote.slate.map((topic) => (
          <motion.li
            key={topic.id}
            variants={fadeInUp}
            className="flex flex-col gap-2 rounded-3xl border-2 p-5"
            style={{
              background: "var(--qs-surface)",
              borderColor: "var(--qs-edge)",
              boxShadow: "var(--qs-shadow)",
            }}
          >
            <CategoryTag category={topic.category} />
            <p className="font-display text-2xl font-black leading-tight">{topic.label}</p>
            <p className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
              {topic.scope}
            </p>
          </motion.li>
        ))}
      </motion.ul>
      <PlayerProgress label="Votes in" doneIds={houseVote.votedPlayerIds} />
    </section>
  );
}

/* ─── Scores ─── */

function ScoreboardStrip() {
  const { seats } = useQuizslop();
  const { players } = usePlayers();
  const seatById = new Map(seats.map((seat) => [seat.playerId as string, seat]));
  const rows = players.flatMap((player) => {
    const seat = seatById.get(player.id);
    return seat ? [{ player, seat }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-stretch justify-center gap-2" aria-label="Scoreboard">
      {rows.map(({ player, seat }) => (
        <li
          key={player.id}
          className="flex min-w-[7.5rem] flex-col gap-0.5 rounded-xl border px-3 py-2"
          style={{
            background: "var(--qs-surface)",
            borderColor: "var(--qs-edge)",
            boxShadow: "var(--qs-shadow)",
          }}
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate font-display text-sm font-bold">{player.name}</span>
            {!player.online && (
              <span
                className="shrink-0 rounded px-1 font-mono text-xs font-bold uppercase"
                style={{ color: "var(--qs-fail)", background: "var(--qs-fail-soft)" }}
              >
                offline
              </span>
            )}
          </span>
          <span className="flex items-baseline justify-between gap-2">
            <span
              className="font-mono text-base font-bold tabular-nums"
              style={{ color: "var(--qs-marquee)" }}
            >
              {seat.quizPoints + seat.callPoints}
            </span>
            <TokenChips remaining={seat.callTokens} size={20} />
          </span>
          <span className="font-mono text-xs tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
            quiz {seat.quizPoints} · calls {formatSigned(seat.callPoints)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ─── Final results (also the public recap) ─── */

function StageFinal() {
  const { final } = useQuizslop();
  const name = usePlayerName();
  if (!final) return null;
  const winners = final.standings.filter((standing) => standing.winner);
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-7">
      {winners.length > 0 && (
        <motion.div variants={popIn} initial="hidden" animate="visible" className="text-center">
          <p
            className="font-mono text-sm font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {winners.length > 1 ? "Co-winners" : "Winner"}
          </p>
          <h2
            className="qs-marquee-text mt-2 text-balance font-display text-5xl font-black tracking-tight @2xl:text-7xl"
            style={{ color: "var(--qs-marquee)" }}
          >
            {winners.map((winner) => name(winner.playerId)).join(" & ")}
          </h2>
        </motion.div>
      )}

      <ol className="w-full space-y-2" aria-label="Final standings">
        {final.standings.map((standing) => (
          <li
            key={standing.playerId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3"
            style={{
              background: standing.winner ? "var(--qs-marquee-soft)" : "var(--qs-surface)",
              borderColor: standing.winner ? "var(--qs-marquee)" : "var(--qs-edge)",
              boxShadow: "var(--qs-shadow)",
            }}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="font-mono text-sm font-bold tabular-nums"
                style={{ color: "var(--qs-ink-dim)" }}
              >
                #{standing.rank}
              </span>
              <span className="truncate font-display text-lg font-bold">
                {name(standing.playerId)}
              </span>
              {standing.winner && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider"
                  style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
                >
                  <TrophyIcon size={11} /> Winner
                </span>
              )}
            </span>
            {/* The tie-break chain, in order: total, quiz subtotal, successful calls. */}
            <span
              className="flex shrink-0 items-baseline gap-3 font-mono text-sm tabular-nums"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              <span className="text-lg font-bold" style={{ color: "var(--qs-marquee)" }}>
                {standing.total}
              </span>
              <span>quiz {standing.quizSubtotal}</span>
              <span>
                {standing.successfulCalls} correct call{standing.successfulCalls === 1 ? "" : "s"}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {final.awards.length > 0 && (
        <motion.div
          variants={staggerContainerSlow}
          initial="hidden"
          animate="visible"
          className="grid w-full gap-3 @2xl:grid-cols-3"
        >
          {final.awards.map((award) => (
            <motion.div
              key={award.kind}
              variants={fadeInUp}
              className="rounded-2xl border p-4 text-center"
              style={{
                background: "var(--qs-surface)",
                borderColor: "var(--qs-marquee)",
                boxShadow: "var(--qs-shadow)",
              }}
            >
              <p
                className="font-display text-sm font-black uppercase tracking-[0.2em]"
                style={{ color: "var(--qs-marquee)" }}
              >
                {AWARD_LABELS[award.kind]}
              </p>
              <p className="mt-1 font-display text-lg font-bold">
                {award.recipients.map(name).join(" & ")}
              </p>
              <p className="font-mono text-xs" style={{ color: "var(--qs-ink-dim)" }}>
                {award.stat}
              </p>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
