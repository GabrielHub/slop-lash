"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ErrorBanner } from "@/components/error-banner";
import { buttonTap, buttonTapPrimary, fadeInUp, staggerContainer } from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { usePlayerName, usePlayers, useRoom, useRoomAction } from "@/room/context";
import { StatusCard } from "@/room/parts";
import { CALL_SLOP_POINTS } from "../game-constants";
import {
  AWARD_LABELS,
  CATEGORY_LABELS,
  CHOICE_LETTERS,
  CategoryTag,
  CheckIcon,
  FlowProgress,
  HandIcon,
  PointValueTag,
  RevealCard,
  RoundKindBadge,
  TokenChips,
  TopicCard,
  TrophyIcon,
  VoiceLine,
  deltaColor,
  useQuizslop,
} from "./shared";

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center">
      <h2 className="font-display text-2xl font-black uppercase tracking-wide">{title}</h2>
      {hint && (
        <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** The viewer's own seat: score, tokens, and id. */
function useMySeat() {
  const { view } = useRoom();
  const { seats } = useQuizslop();
  const meId = view.me?.playerId ?? null;
  return { meId, seat: seats.find((seat) => seat.playerId === meId) ?? null };
}

/** A player's phone: the move for this phase, with their score on top. */
export function Controller() {
  const { room } = useRoom().view;
  const { seat } = useMySeat();
  const finished = room.status === "FINISHED";
  return (
    <div
      className="@container mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5"
      style={{ color: "var(--qs-ink)" }}
    >
      {!finished && seat && (
        <p className="flex items-center justify-center gap-3">
          <span
            className="font-mono text-sm font-bold tabular-nums"
            style={{ color: "var(--qs-marquee)" }}
          >
            {seat.quizPoints + seat.callPoints} pts
          </span>
          <TokenChips remaining={seat.callTokens} size={20} />
        </p>
      )}
      {!finished && <FlowProgress />}
      {finished ? <ControllerFinal /> : <ControllerPhase />}
      {!finished && <VoiceLine className="mt-auto text-sm" />}
    </div>
  );
}

function ControllerPhase() {
  const { phase } = useRoom().view.room;
  switch (phase) {
    case "TOPIC":
      return <ControllerTopic />;
    case "CALL":
      return <ControllerCall />;
    case "ANSWER":
      return <ControllerAnswer />;
    case "REVEAL":
      return <ControllerReveal />;
    case "ROUND_RESULTS":
      return <ControllerRoundResults />;
    case "HOUSE_VOTE":
      return <ControllerHouseVote />;
    default:
      return null;
  }
}

/* ─── Lobby: pick a Home Topic ─── */

export function ControllerLobby() {
  const { lobby } = useQuizslop();
  const { meId } = useMySeat();
  const name = usePlayerName();
  const { act, pending, error } = useRoomAction();
  if (!lobby) return null;
  const mine = lobby.topics.find((topic) => topic.claimedBy === meId) ?? null;

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
      style={{ color: "var(--qs-ink)" }}
    >
      <motion.div variants={fadeInUp}>
        <SectionTitle
          title="Your Home Topic"
          hint={
            mine
              ? "Locked in. You get a round on it, and everyone else gets a question too."
              : "Pick one you actually know. Skip it and the house deals you one at random."
          }
        />
      </motion.div>
      {mine && (
        <motion.div variants={fadeInUp}>
          <TopicCard topic={mine} selected note="Yours" />
        </motion.div>
      )}
      <ErrorBanner error={error} className="" />
      <motion.ul variants={fadeInUp} className="grid grid-cols-2 gap-2">
        {lobby.topics.map((topic) => {
          const isMine = topic.id === mine?.id;
          const takenBy = topic.claimedBy && !isMine ? topic.claimedBy : null;
          return (
            <li key={topic.id}>
              <motion.button
                type="button"
                disabled={pending || isMine || takenBy !== null}
                onClick={() => void act(api.quizslop.play.chooseTopic, { topicId: topic.id })}
                aria-pressed={isMine}
                className="flex h-full w-full cursor-pointer flex-col items-start gap-1 rounded-xl border-2 px-3 py-2 text-left disabled:cursor-not-allowed"
                style={{
                  borderColor: isMine ? "var(--qs-signal)" : "var(--qs-edge)",
                  background: isMine ? "var(--qs-signal-soft)" : "var(--qs-surface)",
                  opacity: takenBy ? 0.5 : 1,
                }}
                {...buttonTap}
              >
                <span className="font-display text-sm font-bold leading-tight">{topic.label}</span>
                <span
                  className="font-mono text-xs font-bold uppercase tracking-wider"
                  style={{ color: isMine ? "var(--qs-signal)" : "var(--qs-ink-dim)" }}
                >
                  {isMine
                    ? "Yours"
                    : takenBy
                      ? `Taken by ${name(takenBy)}`
                      : CATEGORY_LABELS[topic.category]}
                </span>
              </motion.button>
            </li>
          );
        })}
      </motion.ul>
    </motion.section>
  );
}

/* ─── Round phases ─── */

function ControllerTopic() {
  const { round } = useQuizslop();
  const { meId } = useMySeat();
  const name = usePlayerName();
  if (!round?.topic) return null;
  return (
    <section className="flex flex-col items-center gap-3 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <RoundKindBadge kind={round.kind} />
        <CategoryTag category={round.topic.category} />
        <PointValueTag pointValue={round.pointValue} finale={round.kind === "HOUSE_CHOICE"} />
      </div>
      <h2
        className="text-balance font-display text-3xl font-black leading-tight"
        style={{ color: "var(--qs-marquee)" }}
      >
        {round.topic.label}
      </h2>
      <p className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
        {round.topic.scope}
      </p>
      {round.ownerPlayerId && (
        <p
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-sm font-bold"
          style={{ borderColor: "var(--qs-signal)", background: "var(--qs-signal-soft)" }}
        >
          <TrophyIcon size={13} />
          {round.ownerPlayerId === meId
            ? "Your Home Turf. Expect some Slop Calls."
            : `${name(round.ownerPlayerId)}'s Home Turf`}
        </p>
      )}
    </section>
  );
}

function ControllerCall() {
  const { calls, round } = useQuizslop();
  const { meId, seat } = useMySeat();
  const { players } = usePlayers();
  const name = usePlayerName();
  const { act, pending, error } = useRoomAction();
  const [targetId, setTargetId] = useState<Id<"players"> | null>(null);
  const tokens = seat?.callTokens ?? 0;

  if (calls.myCall) {
    const held = calls.myCall.targetId === null;
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle title="Call Slop" />
        <div
          className="rounded-2xl border-2 px-4 py-5 text-center"
          style={{
            borderColor: held ? "var(--qs-edge-strong)" : "var(--qs-punch)",
            background: "var(--qs-surface)",
          }}
        >
          {held ? (
            <p className="inline-flex items-center gap-2 font-display text-xl font-black">
              <HandIcon size={20} /> You held
            </p>
          ) : (
            <p className="font-display text-xl font-black">
              You called slop on{" "}
              <span style={{ color: "var(--qs-punch)" }}>{name(calls.myCall.targetId)}</span>
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: "var(--qs-ink-dim)" }}>
            Locked. Calls are revealed together.
          </p>
        </div>
      </section>
    );
  }

  const submit = (target: Id<"players"> | null) =>
    void act(api.quizslop.play.call, { targetId: target }).then(
      (ok) => ok && playSound(target ? "stamp-slam" : "submitted"),
    );

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        title="Call Slop"
        hint={
          tokens > 0
            ? `Bet a friend misses their question. Miss: +${CALL_SLOP_POINTS}. Right: -${CALL_SLOP_POINTS}.`
            : "No tokens left. Holding is your only move."
        }
      />
      <div className="flex items-center justify-center gap-2">
        <span
          className="font-mono text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Your tokens
        </span>
        <TokenChips remaining={tokens} size={22} />
      </div>
      <ErrorBanner error={error} className="" />

      {tokens > 0 && (
        <ul className="flex flex-col gap-2">
          {players
            .filter((player) => player.id !== meId)
            .map((player) => {
              const picked = targetId === player.id;
              return (
                <li key={player.id}>
                  <motion.button
                    type="button"
                    disabled={pending}
                    onClick={() => setTargetId(picked ? null : player.id)}
                    aria-pressed={picked}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border-2 px-4 py-3 disabled:cursor-not-allowed"
                    style={{
                      borderColor: picked ? "var(--qs-punch)" : "var(--qs-edge)",
                      background: picked ? "var(--qs-punch-soft)" : "var(--qs-surface)",
                    }}
                    {...buttonTap}
                  >
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="truncate font-display text-lg font-bold">{player.name}</span>
                      {round?.ownerPlayerId === player.id && (
                        <span className="text-xs" style={{ color: "var(--qs-signal)" }}>
                          On their Home Turf
                        </span>
                      )}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider"
                      style={{ color: picked ? "var(--qs-punch)" : "var(--qs-ink-dim)" }}
                    >
                      {picked && <CheckIcon size={11} />}
                      {picked ? "will miss" : "call their miss"}
                    </span>
                  </motion.button>
                </li>
              );
            })}
        </ul>
      )}

      <div className="grid gap-2">
        {tokens > 0 && (
          <motion.button
            type="button"
            disabled={pending || targetId === null}
            onClick={() => submit(targetId)}
            className="cursor-pointer rounded-2xl px-4 py-4 font-display text-lg font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--qs-punch)", color: "var(--qs-accent-ink)" }}
            {...buttonTapPrimary}
          >
            {pending ? "Stamping..." : "Stamp the call (-1 token)"}
          </motion.button>
        )}
        <motion.button
          type="button"
          disabled={pending}
          onClick={() => submit(null)}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 font-display text-lg font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: "var(--qs-edge-strong)", background: "var(--qs-surface)" }}
          {...buttonTap}
        >
          <HandIcon size={18} /> Hold
        </motion.button>
      </div>
    </section>
  );
}

function ControllerAnswer() {
  const { answer, calls } = useQuizslop();
  const { meId } = useMySeat();
  const name = usePlayerName();
  const { act, pending, error } = useRoomAction();
  const [pick, setPick] = useState<number | null>(null);
  const mine = answer?.mine;

  if (!mine) {
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle title="Sit tight" />
        <StatusCard>
          You weren&apos;t in the room when the questions went out, so this one&apos;s not yours. No
          points gained or lost.
        </StatusCard>
      </section>
    );
  }

  const callers = calls.list
    .filter((call) => call.targetId === meId)
    .map((call) => name(call.callerId));
  const selected = mine.locked ? mine.selectedIndex : pick;
  return (
    <section className="flex flex-col gap-4">
      {callers.length > 0 && (
        <p
          className="rounded-xl border-2 px-4 py-2 text-center font-display text-sm font-bold"
          style={{ borderColor: "var(--qs-punch)", background: "var(--qs-punch-soft)" }}
        >
          {callers.join(" & ")} called slop on you. Prove them wrong.
        </p>
      )}
      <p className="text-balance font-display text-xl font-bold leading-snug">
        {mine.displayPrompt}
      </p>
      <ol className="flex flex-col gap-2">
        {mine.choices.map((choice, index) => {
          const isPicked = selected === index;
          return (
            <li key={index}>
              <motion.button
                type="button"
                disabled={pending || mine.locked}
                onClick={() => setPick(index)}
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
                  {CHOICE_LETTERS[index] ?? "?"}
                </span>
                <span className="min-w-0 flex-1 text-base font-medium">{choice}</span>
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
      <ErrorBanner error={error} className="" />
      {mine.locked ? (
        <p
          className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 font-display text-lg font-black uppercase tracking-widest"
          style={{
            borderColor: "var(--qs-win)",
            background: "var(--qs-win-soft)",
            color: "var(--qs-win)",
          }}
        >
          <CheckIcon size={18} /> Locked. Stay quiet.
        </p>
      ) : (
        <motion.button
          type="button"
          disabled={pending || pick === null}
          onClick={() =>
            pick !== null &&
            void act(api.quizslop.play.lockAnswer, { selectedIndex: pick }).then(
              (ok) => ok && playSound("submitted"),
            )
          }
          className="cursor-pointer rounded-2xl px-4 py-4 font-display text-xl font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
          {...buttonTapPrimary}
        >
          {pending ? "Locking..." : "Lock it"}
        </motion.button>
      )}
    </section>
  );
}

/** My own question once it is revealed, and how my Slop Call did. */
function ControllerReveal() {
  const { reveal, revealTotal, calls } = useQuizslop();
  const { meId } = useMySeat();
  const { step } = useRoom().view.room;
  const name = usePlayerName();
  const myQuestion = reveal.find((question) =>
    question.players.some((entry) => entry.playerId === meId),
  );
  const myCall = calls.list.find((call) => call.callerId === meId);

  return (
    <section className="flex flex-col gap-3">
      <p
        className="text-center font-mono text-xs font-bold uppercase tracking-[0.3em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Question {Math.min(step + 1, revealTotal)} of {revealTotal}
      </p>
      {myQuestion ? (
        <RevealCard question={myQuestion} personal />
      ) : (
        <StatusCard>Your question is still in the envelope. Eyes on the big screen.</StatusCard>
      )}
      {myCall && (
        <p
          className="rounded-xl border px-4 py-3 text-center text-sm"
          style={{ borderColor: "var(--qs-edge)", background: "var(--qs-surface)" }}
        >
          Your call on <span className="font-bold">{name(myCall.targetId)}</span>:{" "}
          {myCall.outcome === null ? (
            <span style={{ color: "var(--qs-ink-dim)" }}>not revealed yet</span>
          ) : (
            <span className="font-bold" style={{ color: deltaColor(myCall.delta) }}>
              {myCall.outcome === "WON"
                ? `you called it, ${formatSigned(myCall.delta)}`
                : myCall.outcome === "LOST"
                  ? `busted, ${formatSigned(myCall.delta)}`
                  : "refunded"}
            </span>
          )}
        </p>
      )}
    </section>
  );
}

function ControllerRoundResults() {
  const { round } = useQuizslop();
  const { meId, seat } = useMySeat();
  const { room } = useRoom().view;
  const mine = round?.scores.find((score) => score.playerId === meId);
  const quiz = mine?.quiz ?? 0;
  const callDelta = mine?.calls ?? 0;

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle title={`Round ${room.round} of ${room.totalRounds}`} />
      <div
        className="flex flex-col items-center gap-2 rounded-2xl border p-5 text-center"
        style={{
          borderColor: "var(--qs-edge)",
          background: "var(--qs-surface)",
          boxShadow: "var(--qs-shadow)",
        }}
      >
        <p className="flex items-baseline gap-3 font-mono text-lg font-bold tabular-nums">
          <span style={{ color: deltaColor(quiz) }}>{formatSigned(quiz)} quiz</span>
          <span style={{ color: deltaColor(callDelta) }}>{formatSigned(callDelta)} calls</span>
        </p>
        {seat && (
          <>
            <p
              className="font-display text-4xl font-black tabular-nums"
              style={{ color: "var(--qs-marquee)" }}
            >
              {seat.quizPoints + seat.callPoints}
            </p>
            <p className="font-mono text-xs tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
              quiz {seat.quizPoints} · calls {formatSigned(seat.callPoints)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function ControllerHouseVote() {
  const { houseVote, round } = useQuizslop();
  const { act, pending, error } = useRoomAction();
  if (!houseVote) return null;
  const voted = houseVote.myVoteTopicId;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        title="Final topic vote"
        hint={
          voted
            ? "Vote locked. The house decides the finale."
            : `One vote. Finale questions are worth ${round?.pointValue ?? "double"}.`
        }
      />
      <ErrorBanner error={error} className="" />
      <ul className="flex flex-col gap-3">
        {houseVote.slate.map((topic) => {
          const isMine = voted === topic.id;
          return (
            <li key={topic.id}>
              <motion.button
                type="button"
                disabled={pending || voted !== null}
                onClick={() =>
                  void act(api.quizslop.play.houseVote, { topicId: topic.id }).then(
                    (ok) => ok && playSound("vote-cast"),
                  )
                }
                className="w-full cursor-pointer text-left disabled:cursor-not-allowed"
                style={{ opacity: voted && !isMine ? 0.55 : 1 }}
                {...buttonTap}
              >
                <TopicCard
                  topic={topic}
                  selected={isMine}
                  note={isMine ? "Your vote" : undefined}
                />
              </motion.button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Where I finished, plus any awards I took home. */
function ControllerFinal() {
  const { final } = useQuizslop();
  const { meId } = useMySeat();
  if (!final) return null;
  const mine = final.standings.find((standing) => standing.playerId === meId);
  if (!mine) return <StatusCard>The show is over. Final scores are on the big screen.</StatusCard>;
  const awards = final.awards.filter((award) => award.recipients.includes(mine.playerId));

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <SectionTitle
        title={mine.winner ? "You won!" : `You placed #${mine.rank}`}
        hint={`of ${final.standings.length} players`}
      />
      <p
        className="qs-marquee-text font-display text-5xl font-black tabular-nums"
        style={{ color: "var(--qs-marquee)" }}
      >
        {mine.total}
      </p>
      <p className="font-mono text-xs tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
        quiz {mine.quizSubtotal} · {mine.successfulCalls} correct call
        {mine.successfulCalls === 1 ? "" : "s"}
      </p>
      {awards.map((award) => (
        <div
          key={award.kind}
          className="w-full rounded-2xl border px-4 py-3"
          style={{ borderColor: "var(--qs-marquee)", background: "var(--qs-surface)" }}
        >
          <p
            className="font-display text-xs font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--qs-marquee)" }}
          >
            {AWARD_LABELS[award.kind]}
          </p>
          <p className="font-mono text-xs" style={{ color: "var(--qs-ink-dim)" }}>
            {award.stat}
          </p>
        </div>
      ))}
    </section>
  );
}
