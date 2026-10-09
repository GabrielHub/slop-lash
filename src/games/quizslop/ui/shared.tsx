"use client";

import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import { useModeView, usePlayerName, usePlayers, useRoom, type ModeView } from "@/room/context";
import { CALL_SLOP_POINTS, CALL_SLOP_TOKENS_PER_GAME } from "../game-constants";
import type { QuizslopAwardKind, QuizslopCategory, QuizslopRoundKind } from "../types";

export type QuizslopMode = ModeView<"QUIZSLOP">;
export type QuizslopTopic = NonNullable<QuizslopMode["lobby"]>["topics"][number];
export type RevealedQuestion = QuizslopMode["reveal"][number];

export function useQuizslop(): QuizslopMode {
  return useModeView("QUIZSLOP");
}

/* ─── Labels ─── */

export const CATEGORY_LABELS: Record<QuizslopCategory, string> = {
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

const ROUND_KIND_LABELS: Record<QuizslopRoundKind, string> = {
  WARM_UP: "Warm-up",
  HOME_TURF: "Home Turf",
  HOUSE_CHOICE: "House Choice",
};

export const AWARD_LABELS: Record<QuizslopAwardKind, string> = {
  CALLED_IT: "CALLED IT",
  FALSE_ALARM_DEPARTMENT: "FALSE ALARM DEPARTMENT",
  SUSPICIOUSLY_WELL_READ: "SUSPICIOUSLY WELL-READ",
};

export const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

/** Gains read green, losses red, and nothing changed stays dim. */
export function deltaColor(value: number): string {
  return value > 0 ? "var(--qs-win)" : value < 0 ? "var(--qs-fail)" : "var(--qs-ink-dim)";
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

function BoltIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M13 3 5 13.5h5L11 21l8-10.5h-5L13 3Z" />
    </svg>
  );
}

function LinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1.5-1.5" />
    </svg>
  );
}

/* ─── Small pieces ─── */

/** The host's line for this phase. Nothing renders when the server has none. */
export function VoiceLine({ className = "text-sm @2xl:text-base" }: { className?: string }) {
  const { voiceLine } = useQuizslop();
  if (!voiceLine) return null;
  return (
    <p
      role="note"
      aria-label={voiceLine.accessibleLabel}
      className={`text-center font-display italic ${className}`}
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
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em] @2xl:text-sm"
      style={palette}
    >
      <BoltIcon size={12} />
      {ROUND_KIND_LABELS[kind]}
    </span>
  );
}

export function PointValueTag({ pointValue, finale }: { pointValue: number; finale: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em] @2xl:text-sm"
      style={
        finale
          ? { color: "var(--qs-marquee)", borderColor: "var(--qs-marquee)" }
          : { color: "var(--qs-ink-dim)", borderColor: "var(--qs-edge-strong)" }
      }
    >
      {finale ? `Finale — worth ${pointValue}` : `Worth ${pointValue}`}
    </span>
  );
}

export function CategoryTag({ category }: { category: QuizslopCategory }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.18em]"
      style={{ color: "var(--qs-signal)", background: "var(--qs-signal-soft)" }}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

/** Slop Call tokens as physical chips; spent chips render hollow. */
export function TokenChips({ remaining, size = 18 }: { remaining: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="sr-only">{`${remaining} of ${CALL_SLOP_TOKENS_PER_GAME} Slop Calls left`}</span>
      {Array.from({ length: CALL_SLOP_TOKENS_PER_GAME }, (_, index) => {
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

/** Who is in and who the room is still waiting on, for submission phases. */
export function PlayerProgress({ label, doneIds }: { label: string; doneIds: readonly string[] }) {
  const { players } = usePlayers();
  const done = new Set(doneIds);
  const count = players.filter((player) => done.has(player.id)).length;
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-display text-lg font-bold @2xl:text-xl" style={{ color: "var(--qs-ink)" }}>
        {label}{" "}
        <span className="font-mono tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
          {count}/{players.length}
        </span>
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {players.map((player) => {
          const isDone = done.has(player.id);
          return (
            <li
              key={player.id}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-sm font-bold transition-colors"
              style={
                isDone
                  ? {
                      color: "var(--qs-ink)",
                      borderColor: "var(--qs-signal)",
                      background: "var(--qs-signal-soft)",
                    }
                  : { color: "var(--qs-ink-dim)", borderColor: "var(--qs-edge)" }
              }
            >
              <span style={{ color: isDone ? "var(--qs-signal)" : "var(--qs-ink-dim)" }}>
                {isDone ? <CheckIcon size={12} /> : <ClockIcon size={12} />}
              </span>
              {player.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Correctness always pairs icon and text; color only reinforces it. */
function ResultBadge({ correct, timedOut }: { correct: boolean; timedOut: boolean }) {
  const badge = timedOut
    ? {
        color: "var(--qs-fail)",
        background: "var(--qs-fail-soft)",
        Icon: ClockIcon,
        label: "Timed out",
      }
    : correct
      ? {
          color: "var(--qs-win)",
          background: "var(--qs-win-soft)",
          Icon: CheckIcon,
          label: "Correct",
        }
      : {
          color: "var(--qs-fail)",
          background: "var(--qs-fail-soft)",
          Icon: CrossIcon,
          label: "Missed",
        };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider"
      style={{ color: badge.color, background: badge.background }}
    >
      <badge.Icon size={12} /> {badge.label}
    </span>
  );
}

export function TopicCard({
  topic,
  selected,
  note,
}: {
  topic: Pick<QuizslopTopic, "label" | "scope" | "category">;
  selected?: boolean;
  note?: string;
}) {
  return (
    <span
      className="flex h-full flex-col gap-1.5 rounded-2xl border-2 p-4 text-left transition-colors"
      style={{
        borderColor: selected ? "var(--qs-signal)" : "var(--qs-edge)",
        background: selected ? "var(--qs-signal-soft)" : "var(--qs-surface)",
        boxShadow: "var(--qs-shadow)",
      }}
    >
      <span className="flex items-center justify-between gap-2">
        <CategoryTag category={topic.category} />
        {note && (
          <span
            className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--qs-signal)" }}
          >
            {selected && <CheckIcon size={11} />} {note}
          </span>
        )}
      </span>
      <span
        className="font-display text-lg font-bold leading-tight"
        style={{ color: "var(--qs-ink)" }}
      >
        {topic.label}
      </span>
      <span className="text-sm leading-snug" style={{ color: "var(--qs-ink-dim)" }}>
        {topic.scope}
      </span>
    </span>
  );
}

/* ─── Reveal card ─── */

/**
 * One revealed question with who got it right. `personal` is for the
 * viewer's own phone: it marks their row and makes sources tappable.
 */
export function RevealCard({
  question,
  compact = false,
  personal = false,
}: {
  question: RevealedQuestion;
  compact?: boolean;
  personal?: boolean;
}) {
  const { view } = useRoom();
  const { calls } = useQuizslop();
  const name = usePlayerName();
  const meId = personal ? view.me?.playerId : null;

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
        style={{ background: "var(--qs-surface)", borderColor: "var(--qs-edge)" }}
      >
        <p className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          {question.displayPrompt}
        </p>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {question.players.map((player) => (
            <span key={player.playerId} className="inline-flex items-center gap-1">
              <span className="font-display text-sm font-bold" style={{ color: "var(--qs-ink)" }}>
                {name(player.playerId)}
              </span>
              <ResultBadge correct={player.correct} timedOut={player.timedOut} />
            </span>
          ))}
        </span>
      </div>
    );
  }

  return (
    <motion.article
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-2xl border p-5 @2xl:p-6"
      style={{
        background: "var(--qs-surface)",
        borderColor: "var(--qs-edge)",
        boxShadow: "var(--qs-shadow)",
      }}
    >
      <h3
        className="mb-4 font-display text-lg font-bold @2xl:text-2xl"
        style={{ color: "var(--qs-ink)" }}
      >
        {question.displayPrompt}
      </h3>

      <ol className="mb-4 grid gap-2 @xl:grid-cols-2">
        {question.choices.map((choice, index) => {
          const isKey = question.correctIndex === index;
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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold"
                style={
                  isKey
                    ? { background: "var(--qs-win)", color: "var(--qs-accent-ink)" }
                    : { background: "var(--qs-surface)", color: "var(--qs-ink-dim)" }
                }
              >
                {CHOICE_LETTERS[index] ?? "?"}
              </span>
              <span
                className="min-w-0 flex-1 text-sm @2xl:text-base"
                style={{ color: "var(--qs-ink)" }}
              >
                {choice}
              </span>
              {isKey && (
                <span style={{ color: "var(--qs-win)" }}>
                  <CheckIcon size={14} />
                  <span className="sr-only">Correct answer</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <ul className="mb-4 flex flex-wrap gap-2">
        {question.players.map((player) => {
          const isMe = meId != null && player.playerId === meId;
          const callers = calls.list.filter(
            (call) => call.targetId === player.playerId && call.outcome !== null,
          );
          return (
            <li
              key={player.playerId}
              className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5"
              style={{
                borderColor: isMe ? "var(--qs-signal)" : "var(--qs-edge)",
                background: "var(--qs-raised)",
              }}
            >
              <span className="font-display text-sm font-bold" style={{ color: "var(--qs-ink)" }}>
                {name(player.playerId)}
                {isMe ? " (you)" : ""}
              </span>
              <span className="font-mono text-xs" style={{ color: "var(--qs-ink-dim)" }}>
                {player.selectedIndex != null
                  ? `picked ${CHOICE_LETTERS[player.selectedIndex] ?? "?"}`
                  : "no answer"}
              </span>
              <ResultBadge correct={player.correct} timedOut={player.timedOut} />
              {player.points > 0 && (
                <span
                  className="font-mono text-xs font-bold tabular-nums"
                  style={{ color: "var(--qs-win)" }}
                >
                  {formatSigned(player.points)}
                </span>
              )}
              {callers.map((call) => (
                <span
                  key={call.callerId}
                  className="font-mono text-xs font-bold uppercase tracking-wider"
                  style={{
                    color: call.outcome === "WON" ? "var(--qs-punch)" : "var(--qs-ink-dim)",
                  }}
                >
                  {name(call.callerId)}&apos;s call {call.outcome === "WON" ? "lands" : "busts"}
                </span>
              ))}
            </li>
          );
        })}
      </ul>

      <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
        {question.explanation}
      </p>

      {question.sources.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {question.sources.map((source) =>
            personal ? (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs underline underline-offset-2"
                style={{ color: "var(--qs-signal)" }}
              >
                <LinkIcon size={12} />
                {source.title}
              </a>
            ) : (
              <span
                key={source.url}
                className="inline-flex items-center gap-1 font-mono text-xs"
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

/* ─── Round flow ─── */

const BEATS = ["Topic", "Call Slop", "Answer", "Reveal"] as const;

const BEAT_BY_PHASE: Record<string, number> = {
  HOUSE_VOTE: 0,
  TOPIC: 0,
  CALL: 1,
  ANSWER: 2,
  REVEAL: 3,
  ROUND_RESULTS: 3,
};

const PHASE_HELP: Record<string, string> = {
  HOUSE_VOTE: "Choose the last topic together. Everyone gets one vote.",
  TOPIC: "Meet the topic. Everyone gets their own question on it, pitched at their level.",
  CALL: `Bet that a friend will miss: spend a token to Call Slop on them, or hold. They miss: +${CALL_SLOP_POINTS}. They nail it: -${CALL_SLOP_POINTS}.`,
  ANSWER: "Answer privately on your phone and lock one choice. Calls are public now.",
  REVEAL: "Each question gets its own reveal: the right answer, then who got it.",
  ROUND_RESULTS: "Quiz points and Slop Calls settle here. The next topic follows.",
};

/** The four beats of a round. Rules help shows in the first round, or every round without timers. */
export function FlowProgress({ help = false }: { help?: boolean }) {
  const { room } = useRoom().view;
  const active = BEAT_BY_PHASE[room.phase];
  if (active === undefined) return null;
  const helpText =
    help && (room.round === 1 || room.timersDisabled) ? PHASE_HELP[room.phase] : null;

  return (
    <nav aria-label="Round flow" className="w-full">
      <ol className="grid grid-cols-4 gap-1.5 @2xl:gap-2">
        {BEATS.map((label, index) => {
          const current = index === active;
          const complete = index < active;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className="relative flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 text-center"
              style={{
                borderColor: current ? "var(--qs-signal)" : "var(--qs-edge)",
                background: current
                  ? "var(--qs-signal-soft)"
                  : complete
                    ? "var(--qs-raised)"
                    : "var(--qs-surface)",
                color: current ? "var(--qs-ink)" : "var(--qs-ink-dim)",
                opacity: index > active ? 0.64 : 1,
              }}
            >
              {current && (
                <span
                  className="absolute inset-x-2 bottom-0 h-1 rounded-full"
                  style={{ background: "var(--qs-signal)" }}
                />
              )}
              <span
                className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-black @md:flex"
                style={{
                  background: current
                    ? "var(--qs-signal)"
                    : complete
                      ? "var(--qs-edge-strong)"
                      : "var(--qs-raised)",
                  color: current ? "var(--qs-accent-ink)" : "var(--qs-ink)",
                }}
              >
                {index + 1}
              </span>
              <span className="font-display text-xs font-black leading-tight @2xl:text-base">
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {helpText && (
        <p
          className="mt-3 rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed @2xl:text-lg"
          style={{
            borderColor: "var(--qs-marquee)",
            background: "var(--qs-marquee-soft)",
            color: "var(--qs-ink)",
          }}
        >
          <strong>Step {active + 1}:</strong> {helpText}
          {room.timersDisabled ? " The host moves on when the room is ready." : ""}
        </p>
      )}
    </nav>
  );
}
