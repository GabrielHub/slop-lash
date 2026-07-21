"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import type {
  QuizslopAwardKind,
  QuizslopCategory,
  QuizslopDisputeReason,
  QuizslopQuestionRuling,
  QuizslopRoundKind,
  QuizslopTopicSetupState,
} from "../types";
import type {
  QuizslopViewAward,
  QuizslopViewBallot,
  QuizslopViewPublicTopic,
  QuizslopViewRevealGroup,
  QuizslopViewScoreboardEntry,
  QuizslopViewVoiceLine,
} from "./quizslop-view-contracts";

/* ─── Label maps (copy stays deterministic; no client-side jokes) ─── */

export const QUIZSLOP_CATEGORY_LABELS: Record<QuizslopCategory, string> = {
  SPORTS: "Sports",
  MUSIC: "Music",
  FILM_TV: "Film & TV",
  GAMES: "Games",
  SCIENCE_NATURE: "Science & Nature",
  HISTORY: "History",
  GEOGRAPHY: "Geography",
  FOOD_DRINK: "Food & Drink",
  BOOKS_LANGUAGE: "Books & Language",
  INTERNET_TECH: "Internet & Tech",
  ARTS_CULTURE: "Arts & Culture",
  OTHER: "Wildcard",
};

export const QUIZSLOP_ROUND_KIND_LABELS: Record<QuizslopRoundKind, string> = {
  WARM_UP: "Warm-up",
  HOME_TURF: "Home Turf",
  HOUSE_CHOICE: "House Choice",
};

export const QUIZSLOP_SETUP_STATE_LABELS: Record<QuizslopTopicSetupState, string> = {
  NEEDS_TOPIC: "Picking a topic",
  NORMALIZING: "Checking topic",
  AWAITING_CONFIRMATION: "Confirming",
  BUILDING: "Building pack",
  READY: "Ready",
  NEEDS_REVISION: "Needs a rewrite",
  NEEDS_FALLBACK: "Choosing from catalog",
};

export const QUIZSLOP_DISPUTE_REASON_LABELS: Record<QuizslopDisputeReason, string> = {
  WRONG_ANSWER_KEY: "Wrong answer key",
  MULTIPLE_DEFENSIBLE_ANSWERS: "More than one right answer",
  SOURCE_DOES_NOT_SUPPORT: "Source doesn't back it up",
};

export const QUIZSLOP_RULING_LABELS: Record<QuizslopQuestionRuling, string> = {
  UNCHALLENGED_VALID: "Stands",
  UPHELD: "Upheld",
  PLAYER_VOIDED: "Voided by vote",
  SYSTEM_VOID: "Voided by system",
};

export const QUIZSLOP_AWARD_LABELS: Record<QuizslopAwardKind, string> = {
  CALLED_IT: "CALLED IT",
  FALSE_ALARM_DEPARTMENT: "FALSE ALARM DEPARTMENT",
  SUSPICIOUSLY_WELL_READ: "SUSPICIOUSLY WELL-READ",
};

export function formatSignedPoints(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/* ─── Icons (inline, theme-colored via currentColor) ─── */

function iconProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function CrossIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2.5" />
    </svg>
  );
}

export function HandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 13.5V9a1.5 1.5 0 0 1 3 0" />
    </svg>
  );
}

export function TrophyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 13v4m-3 3h6m-6 0a3 3 0 0 1 3-3 3 3 0 0 1 3 3" />
    </svg>
  );
}

export function BoltIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M13 3 5 13.5h5L11 21l8-10.5h-5L13 3Z" />
    </svg>
  );
}

export function LinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1.5-1.5" />
    </svg>
  );
}

/* ─── Chrome pieces ─── */

/** Deterministic server-chosen quip. Nothing renders when the line is null. */
export function VoiceLineBanner({ voiceLine }: { voiceLine: QuizslopViewVoiceLine | null }) {
  if (!voiceLine) return null;
  return (
    <p
      role="note"
      aria-label={voiceLine.accessibleLabel}
      className="text-center font-display italic text-sm sm:text-base"
      style={{ color: "var(--qs-ink-dim)" }}
    >
      <span aria-hidden="true">“{voiceLine.text}”</span>
    </p>
  );
}

export function RoundKindBadge({ kind }: { kind: QuizslopRoundKind }) {
  const palette =
    kind === "HOUSE_CHOICE"
      ? { color: "var(--qs-marquee)", background: "var(--qs-marquee-soft)" }
      : kind === "HOME_TURF"
        ? { color: "var(--qs-signal)", background: "var(--qs-signal-soft)" }
        : { color: "var(--qs-ink-dim)", background: "var(--qs-raised)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.2em]"
      style={palette}
    >
      <BoltIcon size={12} />
      {QUIZSLOP_ROUND_KIND_LABELS[kind]}
    </span>
  );
}

export function PointValueTag({ pointValue, finale }: { pointValue: number; finale: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.2em]"
      style={
        finale
          ? { color: "var(--qs-marquee)", borderColor: "var(--qs-marquee)" }
          : { color: "var(--qs-ink-dim)", borderColor: "var(--qs-edge-strong)" }
      }
    >
      {finale ? `FINALE — WORTH ${pointValue}` : `Worth ${pointValue}`}
    </span>
  );
}

export function CategoryTag({ category }: { category: QuizslopCategory }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.18em]"
      style={{ color: "var(--qs-signal)", background: "var(--qs-signal-soft)" }}
    >
      {QUIZSLOP_CATEGORY_LABELS[category]}
    </span>
  );
}

/** Physical Call Slop token chips; spent chips render hollow. */
export function TokenChips({
  remaining,
  max = 2,
  size = 18,
}: {
  remaining: number;
  max?: number;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="sr-only">{`${remaining} of ${max} Call Slop tokens remaining`}</span>
      {Array.from({ length: max }, (_, index) => {
        const filled = index < remaining;
        return (
          <span
            key={index}
            aria-hidden="true"
            className="inline-flex items-center justify-center rounded-full border-2 font-mono font-bold"
            style={{
              width: size,
              height: size,
              fontSize: Math.max(12, size * 0.5),
              borderColor: "var(--qs-token)",
              color: filled ? "var(--qs-token-ink)" : "var(--qs-token)",
              background: filled ? "var(--qs-token)" : "transparent",
              opacity: filled ? 1 : 0.45,
              boxShadow: filled
                ? "0 1px 0 1px color-mix(in srgb, var(--qs-token) 45%, black)"
                : "none",
            }}
          >
            {filled ? "S" : ""}
          </span>
        );
      })}
    </span>
  );
}

/** Progress pips + count for submission phases. */
export function ProgressMeter({
  label,
  resolved,
  total,
}: {
  label: string;
  resolved: number;
  total: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-display text-lg sm:text-xl font-bold" style={{ color: "var(--qs-ink)" }}>
        {label}
      </p>
      <div className="flex items-center gap-2">
        <span className="sr-only">{`${resolved} of ${total} resolved`}</span>
        {Array.from({ length: Math.max(total, 0) }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="h-3 w-8 rounded-full border transition-colors"
            style={
              index < resolved
                ? { background: "var(--qs-signal)", borderColor: "var(--qs-signal)" }
                : { background: "transparent", borderColor: "var(--qs-edge-strong)" }
            }
          />
        ))}
      </div>
      <p className="font-mono text-sm tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
        {resolved}/{total} in
      </p>
    </div>
  );
}

/** Correctness always pairs icon + text; color is reinforcement only. */
export function ResultBadge({
  correct,
  timedOut,
  voided,
}: {
  correct: boolean;
  timedOut: boolean;
  voided?: boolean;
}) {
  const badge = voided
    ? { color: "var(--qs-ink-dim)", background: "var(--qs-raised)", Icon: CrossIcon, label: "Voided" }
    : timedOut
      ? { color: "var(--qs-fail)", background: "var(--qs-fail-soft)", Icon: ClockIcon, label: "Timed out" }
      : correct
        ? { color: "var(--qs-win)", background: "var(--qs-win-soft)", Icon: CheckIcon, label: "Correct" }
        : { color: "var(--qs-fail)", background: "var(--qs-fail-soft)", Icon: CrossIcon, label: "Missed" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider"
      style={{ color: badge.color, background: badge.background }}
    >
      <badge.Icon size={12} /> {badge.label}
    </span>
  );
}

export function RulingBadge({ ruling }: { ruling: QuizslopQuestionRuling }) {
  const voided = ruling === "PLAYER_VOIDED" || ruling === "SYSTEM_VOID";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider"
      style={
        voided
          ? { color: "var(--qs-fail)", borderColor: "var(--qs-fail)" }
          : { color: "var(--qs-win)", borderColor: "var(--qs-win)" }
      }
    >
      {voided ? <CrossIcon size={12} /> : <CheckIcon size={12} />}
      {QUIZSLOP_RULING_LABELS[ruling]}
    </span>
  );
}

/* ─── Scoreboard strip ─── */

export function ScoreboardStrip({
  scoreboard,
  highlightPlayerId,
}: {
  scoreboard: QuizslopViewScoreboardEntry[];
  highlightPlayerId?: string | null;
}) {
  if (scoreboard.length === 0) return null;
  const ordered = [...scoreboard].sort((a, b) => a.seatOrder - b.seatOrder);
  return (
    <ul className="flex flex-wrap items-stretch justify-center gap-2" aria-label="Scoreboard">
      {ordered.map((entry) => {
        const isMe = highlightPlayerId != null && entry.playerId === highlightPlayerId;
        return (
          <li
            key={entry.playerId}
            className="flex min-w-[7.5rem] flex-col gap-0.5 rounded-xl border px-3 py-2"
            style={{
              background: "var(--qs-surface)",
              borderColor: isMe ? "var(--qs-signal)" : "var(--qs-edge)",
              boxShadow: "var(--qs-shadow)",
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="truncate font-display text-sm font-bold"
                style={{ color: "var(--qs-ink)" }}
              >
                {entry.name}
              </span>
              {!entry.connected && (
                <span
                  className="shrink-0 rounded px-1 font-mono text-xs sm:text-sm font-bold uppercase"
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
                {entry.total}
              </span>
              <TokenChips remaining={entry.tokensRemaining} size={20} />
            </span>
            <span
              className="font-mono text-xs sm:text-sm tabular-nums"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              quiz {entry.quizSubtotal} · calls {formatSignedPoints(entry.callSubtotal)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Reveal group receipt (shared by stage hero/summary + controller) ─── */

export const QUIZSLOP_CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

/** Deterministic voided copy; restrained glitch accent lives on the border. */
export function SystemVoidCard({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`qs-glitch-edge rounded-2xl border-2 border-dashed text-center ${compact ? "px-4 py-3" : "px-6 py-8"}`}
      style={{ borderColor: "var(--qs-fail)", background: "var(--qs-fail-soft)" }}
    >
      <p
        className={`font-display font-black uppercase tracking-[0.25em] ${compact ? "text-base" : "text-2xl sm:text-3xl"}`}
        style={{ color: "var(--qs-fail)" }}
      >
        Question voided
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
        The quizmaster broke this one. Nobody scores, nobody drops, related calls are refunded.
      </p>
    </div>
  );
}

export function RevealGroupCard({
  group,
  hero,
  highlightPlayerId,
  showSourceLinks,
}: {
  group: QuizslopViewRevealGroup;
  /** Hero groups show the full receipt; non-hero groups show a compact line. */
  hero: boolean;
  highlightPlayerId?: string | null;
  showSourceLinks?: boolean;
}) {
  if (group.systemVoid) {
    return <SystemVoidCard compact={!hero} />;
  }

  if (!hero) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
        style={{ background: "var(--qs-surface)", borderColor: "var(--qs-edge)" }}
      >
        <p className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          {group.displayPrompt ?? ""}
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {group.ruling && group.ruling !== "UNCHALLENGED_VALID" && (
            <RulingBadge ruling={group.ruling} />
          )}
          {group.players.map((player) => (
            <span key={player.playerId} className="inline-flex items-center gap-1">
              <span
                className="font-display text-xs sm:text-sm font-bold"
                style={{ color: "var(--qs-ink)" }}
              >
                {player.name}
              </span>
              <ResultBadge
                correct={player.correct}
                timedOut={player.timedOut}
                voided={group.ruling === "PLAYER_VOIDED"}
              />
            </span>
          ))}
        </span>
      </div>
    );
  }

  const voidedByVote = group.ruling === "PLAYER_VOIDED";
  return (
    <motion.article
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        background: "var(--qs-surface)",
        borderColor: "var(--qs-edge)",
        boxShadow: "var(--qs-shadow)",
      }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h3
          className="min-w-0 flex-1 font-display text-lg font-bold sm:text-2xl"
          style={{ color: "var(--qs-ink)" }}
        >
          {group.displayPrompt ?? ""}
        </h3>
        {group.ruling && group.ruling !== "UNCHALLENGED_VALID" && (
          <RulingBadge ruling={group.ruling} />
        )}
      </div>

      {group.choices && (
        <ol className="mb-4 grid gap-2 sm:grid-cols-2">
          {group.choices.map((choice, index) => {
            const isKey = group.correctIndex === index;
            return (
              <li
                key={index}
                className="flex items-center gap-2 rounded-xl border px-3 py-2"
                style={
                  isKey
                    ? { borderColor: "var(--qs-win)", background: "var(--qs-win-soft)" }
                    : { borderColor: "var(--qs-edge)", background: "var(--qs-raised)" }
                }
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs sm:text-sm font-bold"
                  style={
                    isKey
                      ? { background: "var(--qs-win)", color: "var(--qs-accent-ink)" }
                      : { background: "var(--qs-surface)", color: "var(--qs-ink-dim)" }
                  }
                >
                  {QUIZSLOP_CHOICE_LETTERS[index] ?? "?"}
                </span>
                <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--qs-ink)" }}>
                  {choice}
                </span>
                {isKey && (
                  <span
                    className="flex shrink-0 items-center gap-1 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider"
                    style={{ color: "var(--qs-win)" }}
                  >
                    <CheckIcon size={12} /> Correct answer
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <ul className="mb-4 flex flex-wrap gap-2">
        {group.players.map((player) => {
          const isMe = highlightPlayerId != null && player.playerId === highlightPlayerId;
          return (
            <li
              key={player.playerId}
              className="flex items-center gap-2 rounded-xl border px-3 py-1.5"
              style={{
                borderColor: isMe ? "var(--qs-signal)" : "var(--qs-edge)",
                background: "var(--qs-raised)",
              }}
            >
              <span className="font-display text-sm font-bold" style={{ color: "var(--qs-ink)" }}>
                {player.name}
                {isMe ? " (you)" : ""}
              </span>
              <span className="font-mono text-xs sm:text-sm" style={{ color: "var(--qs-ink-dim)" }}>
                {player.selectedIndex != null
                  ? `picked ${QUIZSLOP_CHOICE_LETTERS[player.selectedIndex] ?? "?"}`
                  : "no answer"}
              </span>
              <ResultBadge
                correct={player.correct}
                timedOut={player.timedOut}
                voided={voidedByVote}
              />
              {!voidedByVote && player.provisionalQuizDelta > 0 && (
                <span
                  className="font-mono text-xs sm:text-sm font-bold tabular-nums"
                  style={{ color: "var(--qs-win)" }}
                >
                  +{player.provisionalQuizDelta}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {group.explanation && (
        <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
          {group.explanation}
        </p>
      )}

      {group.sources.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {group.sources.map((source, index) =>
            showSourceLinks && source.url ? (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs sm:text-sm underline underline-offset-2"
                style={{ color: "var(--qs-signal)" }}
              >
                <LinkIcon size={12} />
                {source.title}
              </a>
            ) : (
              <span
                key={index}
                className="inline-flex items-center gap-1 font-mono text-xs sm:text-sm"
                style={{ color: "var(--qs-ink-dim)" }}
              >
                <LinkIcon size={12} />
                {source.title}
              </span>
            ),
          )}
        </p>
      )}
    </motion.article>
  );
}

/* ─── Ballots and awards ─── */

export function BallotCard({
  ballot,
  children,
}: {
  ballot: QuizslopViewBallot;
  children?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: "var(--qs-surface)",
        borderColor: ballot.ruling ? "var(--qs-edge)" : "var(--qs-marquee)",
        boxShadow: "var(--qs-shadow)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--qs-marquee)", background: "var(--qs-marquee-soft)" }}
        >
          <BoltIcon size={11} /> Challenge
        </span>
        {ballot.ruling ? (
          <RulingBadge ruling={ballot.ruling} />
        ) : ballot.votersTotal > 0 ? (
          <span
            className="font-mono text-xs sm:text-sm tabular-nums"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {ballot.votesResolved}/{ballot.votersTotal} votes in
          </span>
        ) : (
          <span
            className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider"
            style={{ color: "var(--qs-marquee)" }}
          >
            Heading to a vote
          </span>
        )}
      </div>
      <p className="font-display text-sm font-bold sm:text-base" style={{ color: "var(--qs-ink)" }}>
        {ballot.displayPrompt}
      </p>
      <p className="mt-1 text-xs sm:text-sm" style={{ color: "var(--qs-ink-dim)" }}>
        {ballot.initiatorName} says: {QUIZSLOP_DISPUTE_REASON_LABELS[ballot.reason]}
      </p>
      {children}
    </div>
  );
}

export function AwardCard({ award }: { award: QuizslopViewAward }) {
  return (
    <div
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
        {QUIZSLOP_AWARD_LABELS[award.kind]}
      </p>
      <p className="mt-1 font-display text-lg font-bold" style={{ color: "var(--qs-ink)" }}>
        {award.recipients.join(" & ")}
      </p>
      <p className="font-mono text-xs sm:text-sm" style={{ color: "var(--qs-ink-dim)" }}>
        {award.stat}
      </p>
    </div>
  );
}

/* ─── Topic marquee card (stage oversized / controller compact) ─── */

export function TopicCard({
  topic,
  selected,
  disabled,
}: {
  topic: QuizslopViewPublicTopic;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className="flex h-full flex-col gap-1.5 rounded-2xl border-2 p-4 text-left transition-colors"
      style={{
        borderColor: selected ? "var(--qs-signal)" : "var(--qs-edge)",
        background: selected ? "var(--qs-signal-soft)" : "var(--qs-surface)",
        opacity: disabled ? 0.55 : 1,
        boxShadow: "var(--qs-shadow)",
      }}
    >
      <span className="flex items-center justify-between gap-2">
        <CategoryTag category={topic.category} />
        {selected && (
          <span
            className="inline-flex items-center gap-1 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider"
            style={{ color: "var(--qs-signal)" }}
          >
            <CheckIcon size={11} /> Picked
          </span>
        )}
      </span>
      <span
        className="font-display text-lg font-bold leading-tight"
        style={{ color: "var(--qs-ink)" }}
      >
        {topic.label}
      </span>
      <span className="text-xs sm:text-sm leading-snug" style={{ color: "var(--qs-ink-dim)" }}>
        {topic.scope}
      </span>
    </span>
  );
}
