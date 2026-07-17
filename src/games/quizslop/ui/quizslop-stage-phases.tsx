"use client";

import { motion } from "motion/react";
import { fadeInUp, popIn, staggerContainer, staggerContainerSlow } from "@/lib/animations";
import {
  CategoryTag,
  CheckIcon,
  ClockIcon,
  HandIcon,
  PointValueTag,
  ProgressMeter,
  QUIZSLOP_SETUP_STATE_LABELS,
  RoundKindBadge,
  TrophyIcon,
} from "./quizslop-shared-ui";
import type { QuizslopRoundKind } from "../types";
import type {
  QuizslopStageViewPayload,
  QuizslopViewCallReveal,
  QuizslopViewHouseVoteStage,
  QuizslopViewPublicTopic,
  QuizslopViewSlateEntry,
} from "./quizslop-view-contracts";

/* ─── Lobby ─── */

export function StageLobby({
  roomCode,
  lobby,
  isHost,
  starting,
  onStart,
}: {
  roomCode: string;
  lobby: NonNullable<QuizslopStageViewPayload["lobby"]>;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8"
    >
      <motion.div variants={fadeInUp} className="text-center">
        <p
          className="font-mono text-xs font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Join at /join with code
        </p>
        <p
          className="qs-marquee-text mt-2 font-display text-6xl font-black tracking-[0.15em] sm:text-8xl"
          style={{ color: "var(--qs-marquee)" }}
        >
          {roomCode}
        </p>
      </motion.div>

      <motion.ul variants={fadeInUp} className="grid w-full gap-2 sm:grid-cols-2">
        {lobby.statuses.map((status) => (
          <li
            key={status.playerId}
            className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
            style={{
              background: "var(--qs-surface)",
              borderColor: "var(--qs-edge)",
              boxShadow: "var(--qs-shadow)",
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="truncate font-display text-base font-bold"
                style={{ color: "var(--qs-ink)" }}
              >
                {status.name}
              </span>
              {!status.connected && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                  style={{ color: "var(--qs-fail)", background: "var(--qs-fail-soft)" }}
                >
                  offline
                </span>
              )}
            </span>
            {/* Redacted readiness: state only, never the topic itself. */}
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider"
              style={
                status.state === "READY"
                  ? { color: "var(--qs-win)", background: "var(--qs-win-soft)" }
                  : { color: "var(--qs-ink-dim)", background: "var(--qs-raised)" }
              }
            >
              {status.state === "READY" ? <CheckIcon size={11} /> : <ClockIcon size={11} />}
              {QUIZSLOP_SETUP_STATE_LABELS[status.state]}
            </span>
          </li>
        ))}
      </motion.ul>

      <motion.p variants={fadeInUp} className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
        Everyone secretly locks in one topic they actually know. Nobody sees it until their round.
      </motion.p>

      {isHost && (
        <motion.button
          variants={fadeInUp}
          type="button"
          disabled={!lobby.canStart || starting}
          onClick={onStart}
          className="cursor-pointer rounded-2xl px-10 py-4 font-display text-xl font-black uppercase tracking-widest transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
        >
          {starting
            ? "Starting..."
            : lobby.canStart
              ? "Start the show"
              : `Need ${lobby.minPlayers}+ ready players`}
        </motion.button>
      )}
    </motion.section>
  );
}

/* ─── House vote (finale slate) ─── */

export function StageHouseVote({
  slate,
  houseVote,
  reveal,
  winnerTopic,
}: {
  slate: QuizslopViewSlateEntry[];
  houseVote: QuizslopViewHouseVoteStage;
  reveal: boolean;
  winnerTopic: QuizslopViewPublicTopic | null;
}) {
  const counts = new Map((houseVote.voteCounts ?? []).map((entry) => [entry.topicId, entry.votes]));
  const maxVotes = Math.max(0, ...counts.values());
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8">
      <h2
        className="text-center font-display text-3xl font-black uppercase tracking-wide sm:text-4xl"
        style={{ color: "var(--qs-ink)" }}
      >
        {reveal ? "The house has spoken" : "Vote the final topic"}
      </h2>
      <motion.ul
        variants={staggerContainerSlow}
        initial="hidden"
        animate="visible"
        className="grid w-full gap-4 sm:grid-cols-3"
      >
        {slate.map((entry) => {
          const votes = counts.get(entry.topicId) ?? 0;
          const isWinner = reveal && winnerTopic !== null && entry.label === winnerTopic.label;
          const isTiedTop = reveal && votes === maxVotes && maxVotes > 0;
          return (
            <motion.li
              key={entry.topicId}
              variants={fadeInUp}
              className="flex flex-col gap-2 rounded-3xl border-2 p-5"
              style={{
                background: isWinner ? "var(--qs-marquee-soft)" : "var(--qs-surface)",
                borderColor: isWinner ? "var(--qs-marquee)" : "var(--qs-edge)",
                boxShadow: "var(--qs-shadow)",
              }}
            >
              <CategoryTag category={entry.category} />
              <p
                className="font-display text-2xl font-black leading-tight"
                style={{ color: "var(--qs-ink)" }}
              >
                {entry.label}
              </p>
              <p className="flex-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
                {entry.scope}
              </p>
              {/* Counts appear only after the vote closes. */}
              {reveal && houseVote.voteCounts !== null && (
                <p className="flex items-center gap-2">
                  <span
                    className="font-mono text-lg font-bold tabular-nums"
                    style={{ color: isWinner ? "var(--qs-marquee)" : "var(--qs-ink)" }}
                  >
                    {votes} vote{votes === 1 ? "" : "s"}
                  </span>
                  {isWinner && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
                    >
                      <TrophyIcon size={11} /> Winner
                    </span>
                  )}
                  {!isWinner && isTiedTop && (
                    <span
                      className="font-mono text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--qs-ink-dim)" }}
                    >
                      tied — lost on frozen rank
                    </span>
                  )}
                </p>
              )}
            </motion.li>
          );
        })}
      </motion.ul>
      {!reveal && (
        <ProgressMeter
          label="Votes are locking in..."
          resolved={houseVote.resolvedCount}
          total={houseVote.eligibleCount}
        />
      )}
    </section>
  );
}

/* ─── Topic reveal marquee ─── */

export function StageTopicReveal({
  topic,
  roundKind,
  ownerName,
  pointValue,
}: {
  topic: QuizslopViewPublicTopic;
  roundKind: QuizslopRoundKind;
  ownerName: string | null;
  pointValue: number;
}) {
  const finale = roundKind === "HOUSE_CHOICE";
  return (
    <motion.section
      variants={staggerContainerSlow}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center"
    >
      <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-2">
        <RoundKindBadge kind={roundKind} />
        <CategoryTag category={topic.category} />
        <PointValueTag pointValue={pointValue} finale={finale} />
      </motion.div>

      <motion.h2
        variants={popIn}
        className="qs-marquee-text text-balance font-display text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl"
        style={{ color: "var(--qs-marquee)" }}
      >
        {topic.label}
      </motion.h2>

      <motion.p
        variants={fadeInUp}
        className="max-w-2xl text-balance text-base sm:text-lg"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        {topic.scope}
      </motion.p>

      {ownerName && (
        <motion.p
          variants={fadeInUp}
          className="inline-flex items-center gap-2 rounded-full border-2 px-5 py-2 font-display text-lg font-bold sm:text-xl"
          style={{
            borderColor: "var(--qs-signal)",
            background: "var(--qs-signal-soft)",
            color: "var(--qs-ink)",
          }}
        >
          <TrophyIcon size={18} />
          {ownerName}&apos;s Home Turf
        </motion.p>
      )}

      {finale && (
        <motion.p
          variants={fadeInUp}
          className="font-mono text-sm font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--qs-marquee)" }}
        >
          Correct answers are worth 200 points
        </motion.p>
      )}
    </motion.section>
  );
}

/* ─── Call Slop ─── */

export function StageSlopCall({
  callProgress,
}: {
  callProgress: { resolvedCount: number; eligibleCount: number };
}) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <h2
        className="font-display text-4xl font-black uppercase tracking-wide sm:text-5xl"
        style={{ color: "var(--qs-ink)" }}
      >
        Call Slop
      </h2>
      <p className="max-w-md text-sm sm:text-base" style={{ color: "var(--qs-ink-dim)" }}>
        Spend a token to predict a miss, or hold. Targets stay secret until everyone locks.
      </p>
      <ProgressMeter
        label="Calls are in..."
        resolved={callProgress.resolvedCount}
        total={callProgress.eligibleCount}
      />
    </section>
  );
}

export function StageCallReveal({ callReveal }: { callReveal: QuizslopViewCallReveal[] }) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8">
      <h2
        className="font-display text-4xl font-black uppercase tracking-wide sm:text-5xl"
        style={{ color: "var(--qs-ink)" }}
      >
        The calls
      </h2>
      {callReveal.length === 0 ? (
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
      ) : (
        <motion.ul
          variants={staggerContainerSlow}
          initial="hidden"
          animate="visible"
          className="flex w-full flex-col items-center gap-3"
        >
          {callReveal.map((call, index) => (
            <motion.li
              key={`${call.callerId}:${call.targetId}`}
              variants={popIn}
              className="qs-stamp w-full max-w-lg rounded-xl border-4 px-5 py-3 text-center"
              style={{
                borderColor: "var(--qs-punch)",
                background: "var(--qs-surface)",
                boxShadow: "var(--qs-shadow)",
                rotate: index % 2 === 0 ? "-1.2deg" : "1.4deg",
              }}
            >
              <p
                className="font-display text-xl font-black sm:text-2xl"
                style={{ color: "var(--qs-ink)" }}
              >
                {call.callerName}
                <span
                  className="mx-2 font-mono text-base font-bold uppercase"
                  style={{ color: "var(--qs-punch)" }}
                >
                  calls slop on
                </span>
                {call.targetName}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}

/* ─── Private answer (progress only — never question text) ─── */

export function StageAnswer({
  answerProgress,
}: {
  answerProgress: { lockedCount: number; assignedCount: number };
}) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <h2
        className="font-display text-4xl font-black uppercase tracking-wide sm:text-5xl"
        style={{ color: "var(--qs-ink)" }}
      >
        Heads down
      </h2>
      <p className="max-w-md text-sm sm:text-base" style={{ color: "var(--qs-ink-dim)" }}>
        Private questions are live on the phones. No talking until every answer locks.
      </p>
      <ProgressMeter
        label="Answers locked"
        resolved={answerProgress.lockedCount}
        total={answerProgress.assignedCount}
      />
    </section>
  );
}
