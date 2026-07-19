"use client";

import { motion } from "motion/react";
import { fadeInUp, popIn } from "@/lib/animations";
import type {
  QuizslopExamAssignment,
  QuizslopExamPlayer,
  QuizslopExamPublicAssignment,
  QuizslopExamReceipt,
  QuizslopExamScore,
} from "./quizslop-exam-contracts";
import { quizslopExamPercent } from "./quizslop-exam-contracts";

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export function ExamKicker({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono text-[10px] font-black uppercase tracking-[0.32em] sm:text-[11px]"
      style={{ color: "var(--qs-punch)" }}
    >
      {children}
    </p>
  );
}

export function ExamHeading({
  children,
  size = "screen",
}: {
  children: React.ReactNode;
  size?: "screen" | "display";
}) {
  return (
    <h2
      className={
        size === "display"
          ? "text-balance font-display text-5xl font-black uppercase leading-[0.88] tracking-[-0.04em] sm:text-7xl lg:text-8xl"
          : "text-balance font-display text-3xl font-black uppercase leading-[0.95] tracking-[-0.025em] sm:text-5xl"
      }
      style={{ color: "var(--qs-ink)" }}
    >
      {children}
    </h2>
  );
}

export function ExamRule({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full ${className}`} style={{ background: "var(--qs-edge)" }} />;
}

export function ExamPaper({
  children,
  className = "",
  labelledBy,
}: {
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <motion.section
      aria-labelledby={labelledBy}
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className={`relative overflow-hidden border px-4 py-5 sm:px-7 sm:py-7 ${className}`}
      style={{
        borderColor: "var(--qs-edge-strong)",
        color: "var(--qs-ink)",
        background:
          "linear-gradient(90deg, transparent 0 2.9rem, color-mix(in srgb, var(--qs-punch) 16%, transparent) 2.9rem 3rem, transparent 3rem), repeating-linear-gradient(0deg, color-mix(in srgb, var(--qs-edge) 16%, transparent) 0 1px, transparent 1px 2.2rem), var(--qs-surface)",
        boxShadow: "var(--qs-shadow)",
      }}
    >
      <div
        className="pointer-events-none absolute right-3 top-2 -rotate-6 font-mono text-[9px] font-black uppercase tracking-[0.18em] opacity-50"
        aria-hidden="true"
        style={{ color: "var(--qs-punch)" }}
      >
        Form S-LOP 70
      </div>
      {children}
    </motion.section>
  );
}

export function LobbyRoster({
  players,
  canRemove,
  hostPlayerId,
  busyPlayerId,
  disabled = false,
  onRemove,
}: {
  players: QuizslopExamPlayer[];
  canRemove: boolean;
  hostPlayerId: string | null;
  busyPlayerId: string | null;
  disabled?: boolean;
  onRemove: (playerId: string) => void;
}) {
  return (
    <ol className="mt-5 divide-y" style={{ borderColor: "var(--qs-edge)" }}>
      {players.map((player) => {
        const isHostPlayer = player.playerId === hostPlayerId;
        const canRemovePlayer = canRemove && !isHostPlayer;
        return (
          <li key={player.playerId} className="flex items-center gap-3 py-3">
            <span
              className="w-6 font-mono text-xs font-black tabular-nums"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              {String(player.seatOrder + 1).padStart(2, "0")}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-display text-lg font-black"
              style={{ color: "var(--qs-ink)" }}
            >
              {player.name}
            </span>
            {isHostPlayer ? (
              <span
                className="font-mono text-[9px] font-black uppercase tracking-wider"
                style={{ color: "var(--qs-marquee)" }}
              >
                host
              </span>
            ) : null}
            <span
              className="font-mono text-[9px] font-black uppercase tracking-wider"
              style={{ color: player.connected ? "var(--qs-win)" : "var(--qs-punch)" }}
            >
              {player.connected ? "present" : "hallway"}
            </span>
            {canRemovePlayer ? (
              <button
                type="button"
                disabled={disabled || busyPlayerId !== null}
                aria-label={`Remove ${player.name} from the room`}
                onClick={() => onRemove(player.playerId)}
                className="cursor-pointer border px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: "var(--qs-punch)", color: "var(--qs-punch)" }}
              >
                {busyPlayerId === player.playerId ? "Removing..." : "Remove"}
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ExamScoreLine({ score }: { score: QuizslopExamScore }) {
  const rawPercent = quizslopExamPercent(score.rawCorrect, score.totalQuestions);
  const targetPosition = Math.min(100, Math.max(0, score.passingScorePercent));
  const scorePosition = Math.min(100, Math.max(0, rawPercent));

  return (
    <section aria-label="Current exam score" className="w-full">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <ExamKicker>Class score</ExamKicker>
          <p
            className="mt-1 font-display text-3xl font-black tabular-nums"
            style={{ color: "var(--qs-ink)" }}
          >
            {rawPercent}%
          </p>
        </div>
        <p
          className="text-right font-mono text-[10px] uppercase tracking-wider"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          {score.rawCorrect}/{score.totalQuestions} correct · Pass {score.passingScorePercent}%
          <br />
          Integrity adjustment{" "}
          {score.integrityAdjustmentSealed ? "sealed until hearing" : "pending"}
        </p>
      </div>
      <div
        className="relative h-3 overflow-visible border"
        style={{ borderColor: "var(--qs-edge-strong)", background: "var(--qs-raised)" }}
      >
        <motion.div
          className="h-full origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: scorePosition / 100 }}
          transition={{ type: "spring", stiffness: 180, damping: 24 }}
          style={{
            background:
              rawPercent >= score.passingScorePercent ? "var(--qs-win)" : "var(--qs-punch)",
          }}
        />
        <span
          className="absolute -bottom-1 -top-1 w-0.5"
          style={{ left: `${targetPosition}%`, background: "var(--qs-ink)" }}
          aria-hidden="true"
        />
      </div>
      <div
        className="relative mt-1 h-4 font-mono text-[9px] font-black uppercase tracking-widest"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        <span className="absolute -translate-x-1/2" style={{ left: `${targetPosition}%` }}>
          pass
        </span>
      </div>
    </section>
  );
}

export function AssignmentPair({
  assignment,
}: {
  assignment: QuizslopExamAssignment | QuizslopExamPublicAssignment;
}) {
  const proxyName = assignment.proxy?.name ?? "The entire committee";
  return (
    <div
      className="grid items-stretch border-y sm:grid-cols-[1fr_auto_1fr]"
      style={{ borderColor: "var(--qs-edge)" }}
    >
      <div className="px-3 py-4 text-center sm:text-left">
        <p
          className="font-mono text-[9px] font-black uppercase tracking-[0.24em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Candidate
        </p>
        <p
          className="mt-1 truncate font-display text-xl font-black"
          style={{ color: "var(--qs-ink)" }}
        >
          {assignment.candidate.name}
        </p>
      </div>
      <div
        className="flex items-center justify-center px-4 font-mono text-xs font-black uppercase"
        style={{ color: "var(--qs-punch)" }}
        aria-hidden="true"
      >
        hands to →
      </div>
      <div className="px-3 py-4 text-center sm:text-right">
        <p
          className="font-mono text-[9px] font-black uppercase tracking-[0.24em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          {assignment.proxyMode === "GROUP_VOTE" ? "Emergency committee" : "Proxy"}
        </p>
        <p
          className="mt-1 truncate font-display text-xl font-black"
          style={{ color: "var(--qs-ink)" }}
        >
          {proxyName}
        </p>
      </div>
    </div>
  );
}

export function ExamChoices({
  choices,
  selectedIndex,
  disabled,
  onSelect,
}: {
  choices: string[];
  selectedIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <fieldset disabled={disabled} className="mt-6">
      <legend className="sr-only">Select one answer</legend>
      <div className="grid gap-px" style={{ background: "var(--qs-edge)" }}>
        {choices.map((choice, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              key={`${index}:${choice}`}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onSelect(index)}
              className="group flex min-h-14 cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors disabled:cursor-not-allowed"
              style={{
                background: selected ? "var(--qs-punch-soft)" : "var(--qs-surface)",
                color: "var(--qs-ink)",
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-mono text-sm font-black transition-transform group-hover:scale-105"
                style={{
                  borderColor: selected ? "var(--qs-punch)" : "var(--qs-edge-strong)",
                  background: selected ? "var(--qs-punch)" : "transparent",
                  color: selected ? "var(--qs-accent-ink)" : "var(--qs-ink-dim)",
                }}
              >
                {CHOICE_LETTERS[index] ?? "?"}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug sm:text-base">
                {choice}
              </span>
              {selected ? (
                <span
                  className="-rotate-6 font-mono text-[9px] font-black uppercase tracking-widest"
                  style={{ color: "var(--qs-punch)" }}
                >
                  penciled
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function LockButton({
  children,
  disabled,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      whileHover={disabled || busy ? undefined : { y: -2 }}
      whileTap={disabled || busy ? undefined : { scale: 0.98 }}
      className="mt-6 w-full cursor-pointer border-2 px-5 py-4 font-display text-base font-black uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: "var(--qs-punch)",
        background: "var(--qs-punch)",
        color: "var(--qs-accent-ink)",
      }}
    >
      {busy ? "Proctor is processing..." : children}
    </motion.button>
  );
}

export function ReceiptSheet({
  receipt,
  compact = false,
}: {
  receipt: QuizslopExamReceipt;
  compact?: boolean;
}) {
  const officialLetter =
    receipt.officialIndex == null ? "—" : (CHOICE_LETTERS[receipt.officialIndex] ?? "?");
  const scratchLetter =
    receipt.scratchIndex == null ? "—" : (CHOICE_LETTERS[receipt.scratchIndex] ?? "?");
  const correctLetter = CHOICE_LETTERS[receipt.correctIndex] ?? "?";
  const proxyLabel = receipt.proxyName ?? "Committee vote";

  return (
    <ExamPaper className={compact ? "" : "min-h-[26rem]"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <ExamKicker>{receipt.topicLabel}</ExamKicker>
          <p
            className="mt-2 text-pretty font-display text-xl font-black leading-tight sm:text-2xl"
            style={{ color: "var(--qs-ink)" }}
          >
            {receipt.prompt}
          </p>
        </div>
        <motion.div
          variants={popIn}
          initial="hidden"
          animate="visible"
          className="-rotate-6 border-[3px] px-3 py-2 font-mono text-sm font-black uppercase tracking-[0.16em]"
          style={{
            borderColor: receipt.officialCorrect ? "var(--qs-win)" : "var(--qs-punch)",
            color: receipt.officialCorrect ? "var(--qs-win)" : "var(--qs-punch)",
          }}
        >
          {receipt.officialCorrect ? "Accepted" : "Explain yourself"}
        </motion.div>
      </div>

      <dl
        className="mt-6 grid grid-cols-3 gap-px border"
        style={{ borderColor: "var(--qs-edge)", background: "var(--qs-edge)" }}
      >
        <div className="bg-[var(--qs-surface)] p-3 text-center">
          <dt
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Candidate scratch
          </dt>
          <dd
            className="mt-1 font-display text-3xl font-black"
            style={{ color: receipt.scratchCorrect ? "var(--qs-win)" : "var(--qs-ink)" }}
          >
            {scratchLetter}
          </dd>
        </div>
        <div className="bg-[var(--qs-surface)] p-3 text-center">
          <dt
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Official proxy
          </dt>
          <dd
            className="mt-1 font-display text-3xl font-black"
            style={{ color: receipt.officialCorrect ? "var(--qs-win)" : "var(--qs-punch)" }}
          >
            {officialLetter}
          </dd>
        </div>
        <div className="bg-[var(--qs-surface)] p-3 text-center">
          <dt
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Answer key
          </dt>
          <dd className="mt-1 font-display text-3xl font-black" style={{ color: "var(--qs-ink)" }}>
            {correctLetter}
          </dd>
        </div>
      </dl>

      <p
        className="mt-4 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        {receipt.candidateName} drafted · {proxyLabel} filed the official answer
      </p>

      {receipt.changedCorrectToWrong ? (
        <p
          className="mt-4 border-l-4 px-3 py-2 text-sm font-bold"
          style={{
            borderColor: "var(--qs-punch)",
            background: "var(--qs-punch-soft)",
            color: "var(--qs-ink)",
          }}
        >
          The scratch work was right. The official form somehow found a rake and stepped on it.
        </p>
      ) : null}
      <p className="mt-5 text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
        {receipt.explanation}
      </p>
      {receipt.defenses.length > 0 ? (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--qs-edge)" }}>
          <p
            className="font-mono text-[9px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--qs-punch)" }}
          >
            Statements entered into the record
          </p>
          {receipt.defenses.map((defense, index) => (
            <blockquote
              key={`${defense.playerName}:${defense.kind}:${index}`}
              className="mt-3 border-l-2 pl-3 text-sm italic"
              style={{ borderColor: "var(--qs-edge-strong)", color: "var(--qs-ink)" }}
            >
              “{defense.text}”{" "}
              <span className="not-italic" style={{ color: "var(--qs-ink-dim)" }}>
                — {defense.playerName}, {defense.kind.toLowerCase()}
              </span>
            </blockquote>
          ))}
        </div>
      ) : null}
    </ExamPaper>
  );
}

export function ProctorTape({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ x: "-120%", rotate: -3 }}
      animate={{ x: 0, rotate: -2 }}
      transition={{ type: "spring", stiffness: 180, damping: 22 }}
      className="w-full overflow-hidden border-y-2 px-4 py-3 text-center font-mono text-sm font-black uppercase tracking-[0.16em]"
      style={{
        borderColor: "var(--qs-ink)",
        background: "var(--qs-punch)",
        color: "var(--qs-accent-ink)",
      }}
    >
      {name} · Proxy privileges temporarily confiscated · Please enjoy the bureaucracy
    </motion.div>
  );
}
