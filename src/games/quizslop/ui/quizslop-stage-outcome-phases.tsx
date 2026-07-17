"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { fadeInUp, popIn, staggerContainer, staggerContainerSlow } from "@/lib/animations";
import {
  AwardCard,
  BallotCard,
  CheckIcon,
  ClockIcon,
  HandIcon,
  RevealGroupCard,
  TrophyIcon,
  formatSignedPoints,
} from "./quizslop-shared-ui";
import type {
  QuizslopViewBallot,
  QuizslopViewFinal,
  QuizslopViewRevealGroup,
  QuizslopViewRoundDelta,
  QuizslopViewSettledCall,
} from "./quizslop-view-contracts";

/* ─── Question reveal ─── */

export function StageQuestionReveal({
  revealGroups,
  revealOrdinal,
  revealTotal,
}: {
  revealGroups: QuizslopViewRevealGroup[];
  revealOrdinal: number;
  revealTotal: number;
}) {
  const hero = revealGroups[revealOrdinal] ?? null;
  const earlier = revealGroups.slice(0, revealOrdinal);
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <p
        className="text-center font-mono text-xs font-bold uppercase tracking-[0.3em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Question {Math.min(revealOrdinal + 1, revealTotal)} of {revealTotal}
      </p>
      {hero && <RevealGroupCard key={hero.questionId} group={hero} hero showSourceLinks={false} />}
      {earlier.length > 0 && (
        <div className="flex flex-col gap-2">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Already revealed
          </p>
          {earlier.map((group) => (
            <RevealGroupCard
              key={group.questionId}
              group={group}
              hero={false}
              showSourceLinks={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Dispute window + vote ─── */

export function StageDisputeWindow({
  revealGroups,
  ballots,
}: {
  revealGroups: QuizslopViewRevealGroup[];
  ballots: QuizslopViewBallot[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="text-center">
        <h2
          className="font-display text-3xl font-black uppercase tracking-wide sm:text-4xl"
          style={{ color: "var(--qs-ink)" }}
        >
          Dispute window open
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          Think a key is wrong? Challenge it from your phone before the window closes.
        </p>
      </div>
      {ballots.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3"
        >
          {ballots.map((ballot) => (
            <motion.div key={ballot.disputeId} variants={fadeInUp}>
              <BallotCard ballot={ballot} />
            </motion.div>
          ))}
        </motion.div>
      )}
      <div className="flex flex-col gap-2">
        {revealGroups.map((group) => (
          <RevealGroupCard
            key={group.questionId}
            group={group}
            hero={false}
            showSourceLinks={false}
          />
        ))}
      </div>
    </section>
  );
}

export function StageDisputeVote({ ballots }: { ballots: QuizslopViewBallot[] }) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="text-center">
        <h2
          className="font-display text-3xl font-black uppercase tracking-wide sm:text-4xl"
          style={{ color: "var(--qs-ink)" }}
        >
          The room decides
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          Uphold or void each challenged question. A strict majority voids.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {ballots.map((ballot) => (
          <BallotCard key={ballot.disputeId} ballot={ballot} />
        ))}
      </div>
    </section>
  );
}

/* ─── Round results / continuity grace ─── */

export function StageRoundResults({
  roundDeltas,
  settledCalls,
  ballots,
  currentRound,
  totalRounds,
  graceMessage,
}: {
  roundDeltas: QuizslopViewRoundDelta[];
  settledCalls: QuizslopViewSettledCall[];
  ballots: QuizslopViewBallot[];
  currentRound: number;
  totalRounds: number;
  graceMessage?: boolean;
}) {
  const ruledBallots = ballots.filter((ballot) => ballot.ruling !== null);
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="text-center">
        <p
          className="font-mono text-xs font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Round {currentRound} of {totalRounds}
        </p>
        <h2
          className="mt-1 font-display text-3xl font-black uppercase tracking-wide sm:text-4xl"
          style={{ color: "var(--qs-ink)" }}
        >
          {graceMessage ? "Hold please" : "The damage"}
        </h2>
        {graceMessage && (
          <p
            className="mx-auto mt-3 max-w-md rounded-2xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--qs-edge)",
              background: "var(--qs-surface)",
              color: "var(--qs-ink-dim)",
            }}
          >
            Waiting for players to reconnect. The show resumes automatically if at least two players
            are back before the countdown ends.
          </p>
        )}
      </div>

      {ruledBallots.length > 0 && (
        <div className="flex flex-col gap-2">
          {ruledBallots.map((ballot) => (
            <BallotCard key={ballot.disputeId} ballot={ballot} />
          ))}
        </div>
      )}

      {roundDeltas.length > 0 && (
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-2 sm:grid-cols-2"
        >
          {roundDeltas.map((delta) => (
            <motion.li
              key={delta.playerId}
              variants={fadeInUp}
              className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
              style={{
                background: "var(--qs-surface)",
                borderColor: "var(--qs-edge)",
                boxShadow: "var(--qs-shadow)",
              }}
            >
              <span
                className="truncate font-display text-base font-bold"
                style={{ color: "var(--qs-ink)" }}
              >
                {delta.name}
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-sm font-bold tabular-nums">
                <span
                  style={{ color: delta.quizDelta > 0 ? "var(--qs-win)" : "var(--qs-ink-dim)" }}
                >
                  {formatSignedPoints(delta.quizDelta)} quiz
                </span>
                <span
                  style={{
                    color:
                      delta.callDelta > 0
                        ? "var(--qs-win)"
                        : delta.callDelta < 0
                          ? "var(--qs-fail)"
                          : "var(--qs-ink-dim)",
                  }}
                >
                  {formatSignedPoints(delta.callDelta)} calls
                </span>
              </span>
            </motion.li>
          ))}
        </motion.ul>
      )}

      {settledCalls.length > 0 && (
        <div className="flex flex-col gap-2">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Call settlements
          </p>
          {settledCalls.map((call, index) => (
            <p
              key={index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm"
              style={{ borderColor: "var(--qs-edge)", background: "var(--qs-surface)" }}
            >
              <span style={{ color: "var(--qs-ink)" }}>
                <span className="font-bold">{call.callerName}</span> called{" "}
                <span className="font-bold">{call.targetName}</span>
              </span>
              <span
                className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider"
                style={{
                  color:
                    call.outcome === "WON"
                      ? "var(--qs-win)"
                      : call.outcome === "LOST"
                        ? "var(--qs-fail)"
                        : "var(--qs-ink-dim)",
                }}
              >
                {call.outcome === "WON" ? (
                  <CheckIcon size={12} />
                ) : call.outcome === "LOST" ? (
                  <ClockIcon size={12} />
                ) : (
                  <HandIcon size={12} />
                )}
                {call.outcome === "REFUNDED"
                  ? "Refunded"
                  : `${call.outcome === "WON" ? "Won" : "Lost"} ${formatSignedPoints(call.callDelta)}`}
              </span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Final results / abandoned ─── */

export function StageFinal({
  final,
  abandoned,
  isHost,
}: {
  final: QuizslopViewFinal;
  abandoned: boolean;
  isHost: boolean;
}) {
  const winners = final.standings.filter((standing) => standing.winner);
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-7">
      {abandoned ? (
        <div className="text-center">
          <h2
            className="font-display text-4xl font-black uppercase tracking-wide"
            style={{ color: "var(--qs-ink)" }}
          >
            Show abandoned
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
            Too many players left, so no winner is declared. Scores below are where things stood.
          </p>
        </div>
      ) : (
        <motion.div variants={popIn} initial="hidden" animate="visible" className="text-center">
          <p
            className="font-mono text-xs font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {winners.length > 1 ? "Co-winners" : "Winner"}
          </p>
          <h2
            className="qs-marquee-text mt-2 font-display text-5xl font-black tracking-tight sm:text-7xl"
            style={{ color: "var(--qs-marquee)" }}
          >
            {winners.map((winner) => winner.name).join(" & ")}
          </h2>
        </motion.div>
      )}

      <ol className="w-full space-y-2" aria-label="Final standings">
        {final.standings.map((standing, index) => (
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
                #{index + 1}
              </span>
              <span
                className="truncate font-display text-lg font-bold"
                style={{ color: "var(--qs-ink)" }}
              >
                {standing.name}
              </span>
              {standing.winner && !abandoned && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
                >
                  <TrophyIcon size={11} /> Winner
                </span>
              )}
            </span>
            {/* Transparent tie facts: total, quiz subtotal, successful calls. */}
            <span
              className="flex shrink-0 items-baseline gap-3 font-mono text-xs tabular-nums"
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
          className="grid w-full gap-3 sm:grid-cols-3"
        >
          {final.awards.map((award) => (
            <motion.div key={award.kind} variants={fadeInUp}>
              <AwardCard award={award} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {isHost && (
        <Link
          href="/host"
          className="rounded-2xl px-8 py-3 font-display text-lg font-black uppercase tracking-widest"
          style={{ background: "var(--qs-signal)", color: "var(--qs-accent-ink)" }}
        >
          Play again
        </Link>
      )}
    </section>
  );
}
