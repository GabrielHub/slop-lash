"use client";

import { useState } from "react";
import type { QuizslopDisputeReason } from "../types";
import { QUIZSLOP_DISPUTE_REASONS } from "../types";
import {
  CheckIcon,
  ClockIcon,
  CrossIcon,
  QUIZSLOP_AWARD_LABELS,
  QUIZSLOP_DISPUTE_REASON_LABELS,
  RevealGroupCard,
  TokenChips,
  TrophyIcon,
  formatSignedPoints,
} from "./quizslop-shared-ui";
import type {
  QuizslopControllerViewPayload,
  QuizslopViewBallot,
  QuizslopViewFinal,
  QuizslopViewRevealGroup,
} from "./quizslop-view-contracts";
import { SectionTitle, WaitingCard } from "./quizslop-controller-layout";
import { ControllerReveal } from "./quizslop-controller-phases";
import { getFinalStandingRank } from "../scoring";

/* ─── Low-key challenge controls embedded in the shared reveal ─── */

export function ControllerDisputeWindow({
  dispute,
  revealGroups,
  revealOrdinal,
  revealTotal,
  showAll,
  ballots,
  mePlayerId,
  busy,
  notice,
  onInitiate,
}: {
  dispute: NonNullable<QuizslopControllerViewPayload["dispute"]>;
  revealGroups: QuizslopViewRevealGroup[];
  revealOrdinal: number;
  revealTotal: number;
  showAll: boolean;
  ballots: QuizslopViewBallot[];
  mePlayerId: string | null;
  busy: boolean;
  notice: string | null;
  onInitiate: (questionId: string, reason: QuizslopDisputeReason) => void;
}) {
  const [open, setOpen] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [reason, setReason] = useState<QuizslopDisputeReason | null>(null);
  const challengeable = revealGroups.filter((group) =>
    dispute.challengeableQuestionIds.includes(group.questionId),
  );

  return (
    <section className="flex flex-col gap-4">
      <ControllerReveal
        revealGroups={revealGroups}
        revealOrdinal={showAll ? revealGroups.length - 1 : revealOrdinal}
        revealTotal={showAll ? revealGroups.length : revealTotal}
        mePlayerId={mePlayerId}
        showAll={showAll}
      />

      {ballots.length > 0 && (
        <div className="flex flex-col gap-2">
          {ballots.map((ballot) => (
            <p
              key={ballot.disputeId}
              className="rounded-xl border px-4 py-2 text-sm"
              style={{
                borderColor: "var(--qs-marquee)",
                background: "var(--qs-marquee-soft)",
                color: "var(--qs-ink)",
              }}
            >
              <span className="font-bold">{ballot.initiatorName}</span> challenged a question:{" "}
              {QUIZSLOP_DISPUTE_REASON_LABELS[ballot.reason]}
            </p>
          ))}
        </div>
      )}

      {notice && (
        <p
          role="alert"
          className="rounded-xl border px-4 py-3 text-center text-sm font-medium"
          style={{
            borderColor: "var(--qs-marquee)",
            background: "var(--qs-marquee-soft)",
            color: "var(--qs-ink)",
          }}
        >
          {notice}
        </p>
      )}

      {dispute.canInitiate && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-xl border px-4 py-2.5 text-center font-mono text-xs font-bold uppercase tracking-wider"
          style={{
            borderColor: "var(--qs-edge-strong)",
            background: "var(--qs-surface)",
            color: "var(--qs-ink-dim)",
          }}
        >
          Challenge a question
        </button>
      )}

      {dispute.canInitiate && open && (
        <div
          className="flex flex-col gap-3 rounded-2xl border p-4"
          style={{ borderColor: "var(--qs-edge)", background: "var(--qs-surface)" }}
        >
          <p className="font-display text-sm font-bold" style={{ color: "var(--qs-ink)" }}>
            Which question?
          </p>
          <ul className="flex flex-col gap-1.5">
            {challengeable.map((group) => (
              <li key={group.questionId}>
                <button
                  type="button"
                  onClick={() => setQuestionId(group.questionId)}
                  aria-pressed={questionId === group.questionId}
                  className="w-full cursor-pointer rounded-xl border px-3 py-2 text-left text-sm"
                  style={{
                    borderColor:
                      questionId === group.questionId ? "var(--qs-marquee)" : "var(--qs-edge)",
                    background:
                      questionId === group.questionId
                        ? "var(--qs-marquee-soft)"
                        : "var(--qs-raised)",
                    color: "var(--qs-ink)",
                  }}
                >
                  {group.displayPrompt ?? ""}
                </button>
              </li>
            ))}
          </ul>
          <p className="font-display text-sm font-bold" style={{ color: "var(--qs-ink)" }}>
            Why?
          </p>
          <ul className="flex flex-col gap-1.5">
            {QUIZSLOP_DISPUTE_REASONS.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => setReason(entry)}
                  aria-pressed={reason === entry}
                  className="w-full cursor-pointer rounded-xl border px-3 py-2 text-left text-sm"
                  style={{
                    borderColor: reason === entry ? "var(--qs-marquee)" : "var(--qs-edge)",
                    background: reason === entry ? "var(--qs-marquee-soft)" : "var(--qs-raised)",
                    color: "var(--qs-ink)",
                  }}
                >
                  {QUIZSLOP_DISPUTE_REASON_LABELS[entry]}
                </button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuestionId(null);
                setReason(null);
              }}
              className="cursor-pointer rounded-xl border px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider"
              style={{ borderColor: "var(--qs-edge-strong)", color: "var(--qs-ink-dim)" }}
            >
              Never mind
            </button>
            <button
              type="button"
              disabled={busy || questionId === null || reason === null}
              onClick={() =>
                questionId !== null && reason !== null && onInitiate(questionId, reason)
              }
              className="cursor-pointer rounded-xl px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
            >
              {busy ? "Filing..." : "File challenge"}
            </button>
          </div>
        </div>
      )}

      {showAll && !dispute.canInitiate ? (
        <WaitingCard text="No challenge is available from this controller." />
      ) : null}
    </section>
  );
}

/* ─── Dispute vote ─── */

export function ControllerDisputeVote({
  ballots,
  revealGroups,
  rulingOrdinal,
  eligible,
  myDisputeVotes,
  busyDisputeId,
  onVote,
}: {
  ballots: QuizslopViewBallot[];
  revealGroups: QuizslopViewRevealGroup[];
  rulingOrdinal: number;
  eligible: boolean;
  myDisputeVotes: { disputeId: string; choice: "UPHOLD" | "VOID" }[];
  busyDisputeId: string | null;
  onVote: (disputeId: string, choice: "UPHOLD" | "VOID") => void;
}) {
  const myVoteByDispute = new Map(myDisputeVotes.map((vote) => [vote.disputeId, vote.choice]));
  const ballot = ballots[rulingOrdinal] ?? null;
  const group = ballot
    ? revealGroups.find((entry) => entry.questionId === ballot.questionId)
    : null;
  const myVote = ballot ? (myVoteByDispute.get(ballot.disputeId) ?? null) : null;
  const busy = ballot !== null && busyDisputeId === ballot.disputeId;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        title={`Ruling ${Math.min(rulingOrdinal + 1, ballots.length)} of ${ballots.length}`}
        hint="Uphold keeps the key. Void throws the question out."
      />
      {!eligible ? (
        <WaitingCard text="You were not connected when this ruling vote opened, so you are watching this one." />
      ) : null}
      {ballot ? (
        <div
          key={ballot.disputeId}
          className="flex flex-col gap-3 rounded-2xl border p-4"
          style={{
            borderColor: "var(--qs-edge)",
            background: "var(--qs-surface)",
            boxShadow: "var(--qs-shadow)",
          }}
        >
          <p className="font-display text-base font-bold" style={{ color: "var(--qs-ink)" }}>
            {ballot.displayPrompt}
          </p>
          <p className="text-xs" style={{ color: "var(--qs-ink-dim)" }}>
            {ballot.initiatorName} says: {QUIZSLOP_DISPUTE_REASON_LABELS[ballot.reason]} ·{" "}
            {ballot.votesResolved}/{ballot.votersTotal} votes in
          </p>
          {group ? <RevealGroupCard group={group} hero showSourceLinks /> : null}
          {myVote ? (
            <p
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider"
              style={{
                borderColor: "var(--qs-win)",
                background: "var(--qs-win-soft)",
                color: "var(--qs-win)",
              }}
            >
              <CheckIcon size={12} /> You voted {myVote === "UPHOLD" ? "Uphold" : "Void"}
            </p>
          ) : eligible ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onVote(ballot.disputeId, "UPHOLD")}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 font-display text-sm font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: "var(--qs-win)", color: "var(--qs-win)" }}
              >
                <CheckIcon size={14} /> Uphold
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onVote(ballot.disputeId, "VOID")}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 font-display text-sm font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: "var(--qs-fail)", color: "var(--qs-fail)" }}
              >
                <CrossIcon size={14} /> Void
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <WaitingCard text="The next ruling is loading." />
      )}
    </section>
  );
}

/* ─── Round results (my deltas) ─── */

export function ControllerRoundResults({
  me,
  roundDeltas,
  currentRound,
  totalRounds,
}: {
  me: QuizslopControllerViewPayload["me"];
  roundDeltas: QuizslopControllerViewPayload["roundDeltas"];
  currentRound: number;
  totalRounds: number;
}) {
  const mine =
    me.playerId !== null
      ? (roundDeltas.find((delta) => delta.playerId === me.playerId) ?? null)
      : null;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle title={`Round ${currentRound} of ${totalRounds}`} />
      <div
        className="flex flex-col items-center gap-2 rounded-2xl border p-5 text-center"
        style={{
          borderColor: "var(--qs-edge)",
          background: "var(--qs-surface)",
          boxShadow: "var(--qs-shadow)",
        }}
      >
        {mine ? (
          <p className="flex items-baseline gap-3 font-mono text-lg font-bold tabular-nums">
            <span style={{ color: mine.quizDelta > 0 ? "var(--qs-win)" : "var(--qs-ink-dim)" }}>
              {formatSignedPoints(mine.quizDelta)} quiz
            </span>
            <span
              style={{
                color:
                  mine.callDelta > 0
                    ? "var(--qs-win)"
                    : mine.callDelta < 0
                      ? "var(--qs-fail)"
                      : "var(--qs-ink-dim)",
              }}
            >
              {formatSignedPoints(mine.callDelta)} calls
            </span>
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
            No score change for you this round.
          </p>
        )}
        <p
          className="font-display text-4xl font-black tabular-nums"
          style={{ color: "var(--qs-marquee)" }}
        >
          {me.total}
        </p>
        <p className="font-mono text-xs tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
          quiz {me.quizSubtotal} · calls {formatSignedPoints(me.callSubtotal)}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span
            className="font-mono text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Tokens left
          </span>
          <TokenChips remaining={me.tokensRemaining} size={20} />
        </div>
      </div>
    </section>
  );
}

/* ─── Final results ─── */

export function ControllerFinal({
  final,
  mePlayerId,
  abandoned,
}: {
  final: QuizslopViewFinal;
  mePlayerId: string | null;
  abandoned: boolean;
}) {
  const myIndex = final.standings.findIndex((standing) => standing.playerId === mePlayerId);
  const mine = myIndex >= 0 ? final.standings[myIndex] : null;
  const myRank = getFinalStandingRank(final.standings, myIndex);
  return (
    <section className="flex flex-col gap-4">
      {abandoned ? (
        <SectionTitle title="Show abandoned" hint="No winner declared — too many players left." />
      ) : (
        <SectionTitle
          title={mine?.winner ? "You won!" : "Final scores"}
          hint={mine && !mine.winner && myRank ? `You finished #${myRank}.` : undefined}
        />
      )}
      <ol className="flex flex-col gap-2" aria-label="Final standings">
        {final.standings.map((standing, index) => {
          const isMe = standing.playerId === mePlayerId;
          return (
            <li
              key={standing.playerId}
              className="flex items-center justify-between gap-2 rounded-2xl border px-4 py-3"
              style={{
                borderColor: isMe
                  ? "var(--qs-signal)"
                  : standing.winner
                    ? "var(--qs-marquee)"
                    : "var(--qs-edge)",
                background: standing.winner ? "var(--qs-marquee-soft)" : "var(--qs-surface)",
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="font-mono text-xs font-bold tabular-nums"
                  style={{ color: "var(--qs-ink-dim)" }}
                >
                  #{getFinalStandingRank(final.standings, index)}
                </span>
                <span
                  className="truncate font-display text-base font-bold"
                  style={{ color: "var(--qs-ink)" }}
                >
                  {standing.name}
                  {isMe ? " (you)" : ""}
                </span>
                {standing.winner && !abandoned && (
                  <span aria-label="Winner" style={{ color: "var(--qs-marquee)" }}>
                    <TrophyIcon size={14} />
                  </span>
                )}
              </span>
              <span
                className="flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums"
                style={{ color: "var(--qs-ink-dim)" }}
              >
                <span className="text-base font-bold" style={{ color: "var(--qs-marquee)" }}>
                  {standing.total}
                </span>
                <span>quiz {standing.quizSubtotal}</span>
                <span>{standing.successfulCalls} calls</span>
              </span>
            </li>
          );
        })}
      </ol>
      {final.awards.length > 0 && (
        <ul className="flex flex-col gap-2">
          {final.awards.map((award) => (
            <li
              key={award.kind}
              className="rounded-2xl border px-4 py-3 text-center"
              style={{ borderColor: "var(--qs-marquee)", background: "var(--qs-surface)" }}
            >
              <p
                className="font-display text-xs font-black uppercase tracking-[0.2em]"
                style={{ color: "var(--qs-marquee)" }}
              >
                {QUIZSLOP_AWARD_LABELS[award.kind]}
              </p>
              <p className="font-display text-base font-bold" style={{ color: "var(--qs-ink)" }}>
                {award.recipients.join(" & ")}
              </p>
              <p className="font-mono text-xs" style={{ color: "var(--qs-ink-dim)" }}>
                {award.stat}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Simple wait states ─── */

export function ControllerPassiveWait({ title, text }: { title: string; text: string }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle title={title} />
      <WaitingCard text={text} />
    </section>
  );
}

export function ControllerGraceWait() {
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle title="Hold please" />
      <WaitingCard text="Waiting for players to reconnect. The show resumes automatically if at least two players are back before the countdown ends." />
      <p
        className="flex items-center justify-center gap-1.5 font-mono text-xs"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        <ClockIcon size={13} /> Reconnect window is running
      </p>
    </section>
  );
}
