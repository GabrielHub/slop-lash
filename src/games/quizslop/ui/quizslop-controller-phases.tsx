"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { buttonTap, buttonTapPrimary, fadeInUp, staggerContainer } from "@/lib/animations";
import {
  CheckIcon,
  HandIcon,
  QUIZSLOP_CHOICE_LETTERS,
  QUIZSLOP_SETUP_STATE_LABELS,
  RevealGroupCard,
  TokenChips,
  TopicCard,
} from "./quizslop-shared-ui";
import type {
  QuizslopControllerLobby,
  QuizslopControllerViewPayload,
  QuizslopViewRevealGroup,
  QuizslopViewSlateEntry,
} from "./quizslop-view-contracts";
import { SectionTitle, WaitingCard } from "./quizslop-controller-layout";

/* ─── Lobby: choose one catalog Home Topic ─── */

export function ControllerLobby({
  lobby,
  busyTopicId,
  topicTakenNotice,
  onChooseTopic,
}: {
  lobby: QuizslopControllerLobby;
  busyTopicId: string | null;
  topicTakenNotice: string | null;
  onChooseTopic: (catalogTopicId: string) => void;
}) {
  if (lobby.packStatus === "PENDING" || lobby.packStatus === "GENERATING") {
    const queued = lobby.packStatus === "PENDING";
    return (
      <motion.section
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-4"
      >
        <motion.div variants={fadeInUp}>
          <SectionTitle
            title={queued ? "Question pack queued" : "Building the question pack"}
            hint={
              queued
                ? "Fresh questions are getting ready before topic choices open."
                : "Fresh questions are being written and checked now."
            }
          />
        </motion.div>
        <motion.output
          variants={fadeInUp}
          className="block rounded-2xl border px-4 py-4 text-center text-base"
          style={{
            borderColor: "var(--qs-signal)",
            background: "var(--qs-signal-soft)",
            color: "var(--qs-ink)",
          }}
        >
          {queued
            ? "Stay here — players can keep joining while pack building starts."
            : "Your topic choices will appear automatically when the pack is ready."}
        </motion.output>
      </motion.section>
    );
  }

  if (lobby.packStatus === "FAILED") {
    return (
      <motion.section
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-4"
      >
        <motion.div variants={fadeInUp}>
          <SectionTitle
            title="Question pack unavailable"
            hint="The fresh pack failed and no reviewed catalog fallback was loaded."
          />
        </motion.div>
        <motion.p
          variants={fadeInUp}
          role="alert"
          className="rounded-2xl border px-4 py-4 text-center text-base font-medium"
          style={{
            borderColor: "var(--qs-fail)",
            background: "var(--qs-fail-soft)",
            color: "var(--qs-ink)",
          }}
        >
          This room cannot start. Ask the host to create a new QuizSlop room with Reviewed Catalog.
        </motion.p>
      </motion.section>
    );
  }

  const confirmed = lobby.myTopicState === "READY" && lobby.myTopic !== null;
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      <motion.div variants={fadeInUp}>
        <SectionTitle
          title="Your Home Topic"
          hint={
            confirmed
              ? "Locked in. It stays secret until your round hits the stage."
              : "Pick the one you actually know. Nobody else sees it yet."
          }
        />
      </motion.div>

      {lobby.packStatus === "FALLBACK" && (
        <motion.output
          variants={fadeInUp}
          className="block rounded-xl border px-4 py-3 text-center text-sm font-medium"
          style={{
            borderColor: "var(--qs-signal)",
            background: "var(--qs-signal-soft)",
            color: "var(--qs-ink)",
          }}
        >
          This room is using the complete reviewed catalog fallback.
        </motion.output>
      )}

      {topicTakenNotice && (
        <motion.p
          variants={fadeInUp}
          role="alert"
          className="rounded-xl border px-4 py-3 text-center text-sm font-medium"
          style={{
            borderColor: "var(--qs-marquee)",
            background: "var(--qs-marquee-soft)",
            color: "var(--qs-ink)",
          }}
        >
          {topicTakenNotice}
        </motion.p>
      )}

      {confirmed && lobby.myTopic && (
        <motion.div variants={fadeInUp}>
          <TopicCard topic={lobby.myTopic} selected />
        </motion.div>
      )}

      <motion.ul variants={fadeInUp} className="flex flex-col gap-3">
        {lobby.offers.map((offer) => {
          const isMine = lobby.myCatalogTopicId === offer.catalogTopicId;
          return (
            <li key={offer.catalogTopicId}>
              <motion.button
                type="button"
                disabled={busyTopicId !== null || isMine}
                onClick={() => onChooseTopic(offer.catalogTopicId)}
                className="w-full cursor-pointer text-left disabled:cursor-not-allowed"
                {...buttonTap}
              >
                <TopicCard
                  topic={offer}
                  selected={isMine}
                  disabled={busyTopicId !== null && busyTopicId !== offer.catalogTopicId}
                />
                <span
                  className="mt-1 block text-center font-mono text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--qs-signal)" }}
                >
                  {busyTopicId === offer.catalogTopicId
                    ? "Claiming..."
                    : isMine
                      ? "Your confirmed topic"
                      : confirmed
                        ? "Tap to switch"
                        : "Tap to confirm"}
                </span>
              </motion.button>
            </li>
          );
        })}
      </motion.ul>

      {!confirmed && (
        <motion.p
          variants={fadeInUp}
          className="text-center font-mono text-xs"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Status: {QUIZSLOP_SETUP_STATE_LABELS[lobby.myTopicState]}
        </motion.p>
      )}

      {confirmed && (
        <motion.div variants={fadeInUp}>
          <WaitingCard
            text={
              lobby.everyoneReady
                ? "Everyone is ready. Waiting for the host to start the show."
                : `The host can start when ${lobby.minPlayers}–${lobby.maxPlayers} connected players have locked topics.`
            }
          />
        </motion.div>
      )}
    </motion.section>
  );
}

/* ─── Finale house vote ─── */

export function ControllerHouseVote({
  slate,
  eligible,
  myVoteTopicId,
  busyTopicId,
  onVote,
}: {
  slate: QuizslopViewSlateEntry[];
  eligible: boolean;
  myVoteTopicId: string | null;
  busyTopicId: string | null;
  onVote: (topicId: string) => void;
}) {
  const locked = myVoteTopicId !== null;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        title="Final topic vote"
        hint={
          !eligible
            ? "You are not in this vote's roster."
            : locked
              ? "Vote locked. One topic takes the finale."
              : "One vote. The finale question is worth 200."
        }
      />
      <ul className="flex flex-col gap-3">
        {slate.map((entry) => {
          const isMine = myVoteTopicId === entry.topicId;
          return (
            <li key={entry.topicId}>
              <motion.button
                type="button"
                disabled={!eligible || locked || busyTopicId !== null}
                onClick={() => onVote(entry.topicId)}
                className="w-full cursor-pointer text-left disabled:cursor-not-allowed"
                {...buttonTap}
              >
                <TopicCard topic={entry} selected={isMine} disabled={locked && !isMine} />
                {isMine && (
                  <span
                    className="mt-1 flex items-center justify-center gap-1 font-mono text-xs font-bold uppercase tracking-wider"
                    style={{ color: "var(--qs-signal)" }}
                  >
                    <CheckIcon size={11} /> Your vote
                  </span>
                )}
              </motion.button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─── Call Slop ─── */

export function ControllerSlopCall({
  call,
  tokensRemaining,
  busy,
  onSubmit,
}: {
  call: NonNullable<QuizslopControllerViewPayload["call"]>;
  tokensRemaining: number;
  busy: boolean;
  onSubmit: (targetPlayerId: string | null) => void;
}) {
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  if (!call.eligible) {
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle title="Call Slop" />
        <WaitingCard text="You are sitting out this call window." />
      </section>
    );
  }

  if (call.resolved) {
    const target = call.targets.find((entry) => entry.playerId === call.myTargetId);
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle title="Call Slop" />
        <div
          className="rounded-2xl border-2 px-4 py-5 text-center"
          style={{
            borderColor: call.held ? "var(--qs-edge-strong)" : "var(--qs-punch)",
            background: "var(--qs-surface)",
          }}
        >
          {call.held ? (
            <p
              className="inline-flex items-center gap-2 font-display text-xl font-black"
              style={{ color: "var(--qs-ink)" }}
            >
              <HandIcon size={20} /> You held
            </p>
          ) : (
            <p className="font-display text-xl font-black" style={{ color: "var(--qs-ink)" }}>
              You called slop on{" "}
              <span style={{ color: "var(--qs-punch)" }}>{target?.name ?? "a player"}</span>
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: "var(--qs-ink-dim)" }}>
            Locked. Calls reveal all at once.
          </p>
        </div>
      </section>
    );
  }

  const canSpend = tokensRemaining > 0;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        title="Call Slop"
        hint={
          canSpend
            ? "Spend one token to predict a miss, or hold. Miss: +150. Right: -150."
            : "No tokens left — hold is your only move."
        }
      />
      <div className="flex items-center justify-center gap-2">
        <span
          className="font-mono text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Your tokens
        </span>
        <TokenChips remaining={tokensRemaining} size={22} />
      </div>

      {canSpend && (
        <ul className="flex flex-col gap-2">
          {call.targets.map((target) => {
            const isPicked = pendingTargetId === target.playerId;
            return (
              <li key={target.playerId}>
                <motion.button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingTargetId(isPicked ? null : target.playerId)}
                  aria-pressed={isPicked}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border-2 px-4 py-3 disabled:cursor-not-allowed"
                  style={{
                    borderColor: isPicked ? "var(--qs-punch)" : "var(--qs-edge)",
                    background: isPicked ? "var(--qs-punch-soft)" : "var(--qs-surface)",
                  }}
                  {...buttonTap}
                >
                  <span
                    className="font-display text-lg font-bold"
                    style={{ color: "var(--qs-ink)" }}
                  >
                    {target.name}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider"
                    style={{ color: isPicked ? "var(--qs-punch)" : "var(--qs-ink-dim)" }}
                  >
                    {isPicked && <CheckIcon size={11} />}
                    {isPicked ? "will miss" : "calls their miss"}
                  </span>
                </motion.button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-2">
        {canSpend && (
          <motion.button
            type="button"
            disabled={busy || pendingTargetId === null}
            onClick={() => pendingTargetId !== null && onSubmit(pendingTargetId)}
            className="cursor-pointer rounded-2xl px-4 py-4 font-display text-lg font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--qs-punch)", color: "var(--qs-accent-ink)" }}
            {...buttonTapPrimary}
          >
            {busy ? "Stamping..." : "Stamp the call (-1 token)"}
          </motion.button>
        )}
        <motion.button
          type="button"
          disabled={busy}
          onClick={() => onSubmit(null)}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 font-display text-lg font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            borderColor: "var(--qs-edge-strong)",
            background: "var(--qs-surface)",
            color: "var(--qs-ink)",
          }}
          {...buttonTap}
        >
          <HandIcon size={18} /> Hold
        </motion.button>
      </div>
    </section>
  );
}

/* ─── Private answer ─── */

export function ControllerAnswer({
  answer,
  busy,
  onLock,
}: {
  answer: NonNullable<QuizslopControllerViewPayload["answer"]>;
  busy: boolean;
  onLock: (selectedIndex: number) => void;
}) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  if (!answer.assigned) {
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle title="Sit tight" />
        <WaitingCard text="You're sitting this one out — you weren't in the room when questions went out. No points gained or lost." />
      </section>
    );
  }

  const selectedIndex = answer.locked ? answer.selectedIndex : pendingIndex;
  return (
    <section className="flex flex-col gap-4">
      <p
        className="text-balance font-display text-xl font-bold leading-snug sm:text-2xl"
        style={{ color: "var(--qs-ink)" }}
      >
        {answer.displayPrompt ?? ""}
      </p>

      <ol className="flex flex-col gap-2">
        {(answer.choices ?? []).map((choice, index) => {
          const isPicked = selectedIndex === index;
          return (
            <li key={index}>
              <motion.button
                type="button"
                disabled={busy || answer.locked}
                onClick={() => setPendingIndex(index)}
                aria-pressed={isPicked}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left disabled:cursor-not-allowed"
                style={{
                  borderColor: isPicked ? "var(--qs-signal)" : "var(--qs-edge)",
                  background: isPicked ? "var(--qs-signal-soft)" : "var(--qs-surface)",
                }}
                {...buttonTap}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold"
                  style={
                    isPicked
                      ? { background: "var(--qs-signal)", color: "var(--qs-accent-ink)" }
                      : { background: "var(--qs-raised)", color: "var(--qs-ink-dim)" }
                  }
                >
                  {QUIZSLOP_CHOICE_LETTERS[index] ?? "?"}
                </span>
                <span
                  className="min-w-0 flex-1 text-base font-medium"
                  style={{ color: "var(--qs-ink)" }}
                >
                  {choice}
                </span>
                {isPicked && (
                  <span aria-hidden="true" style={{ color: "var(--qs-signal)" }}>
                    <CheckIcon size={18} />
                  </span>
                )}
              </motion.button>
            </li>
          );
        })}
      </ol>

      {answer.locked ? (
        <p
          className="rounded-2xl border-2 px-4 py-4 text-center font-display text-lg font-black uppercase tracking-widest"
          style={{
            borderColor: "var(--qs-win)",
            background: "var(--qs-win-soft)",
            color: "var(--qs-win)",
          }}
        >
          <span className="inline-flex items-center gap-2">
            <CheckIcon size={18} /> Locked — stay quiet
          </span>
        </p>
      ) : (
        <motion.button
          type="button"
          disabled={busy || pendingIndex === null}
          onClick={() => pendingIndex !== null && onLock(pendingIndex)}
          className="cursor-pointer rounded-2xl px-4 py-4 font-display text-xl font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
          {...buttonTapPrimary}
        >
          {busy ? "Locking..." : "Lock it"}
        </motion.button>
      )}
    </section>
  );
}

/* ─── Reveal (controller: my result + tappable sources) ─── */

export function ControllerReveal({
  revealGroups,
  revealOrdinal,
  revealTotal,
  mePlayerId,
  showAll,
}: {
  revealGroups: QuizslopViewRevealGroup[];
  revealOrdinal: number;
  revealTotal: number;
  mePlayerId: string | null;
  showAll: boolean;
}) {
  const visible = showAll ? revealGroups : revealGroups.slice(0, revealOrdinal + 1);
  const heroId = showAll ? null : revealGroups[revealOrdinal]?.questionId;
  const myGroupFirst = showAll
    ? [...visible].sort((a, b) => {
        const aMine =
          mePlayerId !== null && a.players.some((player) => player.playerId === mePlayerId) ? 0 : 1;
        const bMine =
          mePlayerId !== null && b.players.some((player) => player.playerId === mePlayerId) ? 0 : 1;
        return aMine - bMine;
      })
    : visible;
  return (
    <section className="flex flex-col gap-3">
      {!showAll && (
        <p
          className="text-center font-mono text-xs font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Question {Math.min(revealOrdinal + 1, revealTotal)} of {revealTotal}
        </p>
      )}
      {myGroupFirst.map((group) => (
        <RevealGroupCard
          key={group.questionId}
          group={group}
          hero={showAll || group.questionId === heroId}
          highlightPlayerId={mePlayerId}
          showSourceLinks
        />
      ))}
    </section>
  );
}
