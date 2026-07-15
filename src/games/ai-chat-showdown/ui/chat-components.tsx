"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { PlayerAvatar } from "@/components/player-avatar";
import { springBouncy, springGentle } from "@/lib/animations";
import type { OptimisticChatMessage } from "./use-optimistic-chat";

/* ─── Shared animation configs ─── */

export const msgSpring = { type: "spring" as const, stiffness: 500, damping: 32 };
export const gentleSpring = { type: "spring" as const, stiffness: 300, damping: 25 };

/* ─── Typing indicator ─── */

export function TypingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--cs-ink-dim)]"
            style={{ animation: `cs-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
      {label && <span className="text-[11px] text-[var(--cs-ink-dim)] font-medium">{label}</span>}
    </div>
  );
}

/* ─── System message (inline in feed) ─── */

export function SystemMsg({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <motion.div
      className="flex items-center justify-center gap-2 py-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={msgSpring}
    >
      {icon}
      <span className="text-[11px] font-medium text-[var(--cs-ink-dim)] tracking-wide">
        {children}
      </span>
    </motion.div>
  );
}

/* ─── Chat bubble ─── */

export function Bubble({
  message,
  playerName,
  modelId,
  isMe,
  allMessages,
  players,
  onRetry,
  onDismiss,
}: {
  message: OptimisticChatMessage;
  playerName: string;
  modelId: string | null;
  isMe: boolean;
  allMessages: OptimisticChatMessage[];
  players: { id: string; name: string; modelId: string | null }[];
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isPending = message.status === "pending";
  const isFailed = message.status === "failed";
  const isAi = !!modelId;

  let bubbleBg: string;
  if (isMe) bubbleBg = "bg-[var(--cs-bubble-me)]";
  else if (isAi) bubbleBg = "bg-[var(--cs-bubble-ai)]";
  else bubbleBg = "bg-[var(--cs-bubble-other)]";

  const bubbleRadius = isMe ? "rounded-2xl rounded-tr-sm" : "rounded-2xl rounded-tl-sm";

  let nameColor: string;
  if (isAi) nameColor = "text-[var(--cs-violet)]";
  else if (isMe) nameColor = "text-[var(--cs-accent)]";
  else nameColor = "text-[var(--cs-ink-dim)]";

  const replyTo = message.replyToId ? allMessages.find((m) => m.id === message.replyToId) : null;
  const replyToPlayer = replyTo ? players.find((p) => p.id === replyTo.playerId) : null;

  return (
    <motion.div
      className={`flex gap-2.5 max-w-[85%] lg:max-w-[70%] ${isMe ? "ml-auto flex-row-reverse" : ""}`}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={msgSpring}
    >
      <div className="shrink-0 mt-0.5">
        <PlayerAvatar
          name={playerName}
          modelId={modelId}
          size={28}
          className="rounded-full ring-1 ring-[var(--cs-edge)]"
        />
      </div>
      <div className={`min-w-0 flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        <span className={`text-[10px] lg:text-[11px] font-semibold mb-0.5 ${nameColor}`}>
          {playerName}
        </span>
        {replyTo && (
          <div
            className="flex items-center gap-1.5 mb-1 px-2.5 py-1 rounded-lg border-l-2 max-w-full"
            style={{
              borderColor: "var(--cs-violet)",
              background: "color-mix(in srgb, var(--cs-violet) 8%, transparent)",
            }}
          >
            <span
              className="text-[10px] font-semibold shrink-0"
              style={{ color: "var(--cs-violet)" }}
            >
              {replyToPlayer?.name ?? "Unknown"}
            </span>
            <span className="text-[10px] truncate" style={{ color: "var(--cs-ink-dim)" }}>
              {replyTo.content.length > 60 ? replyTo.content.slice(0, 57) + "..." : replyTo.content}
            </span>
          </div>
        )}
        <div
          className={`px-3.5 py-2.5 lg:px-4 lg:py-3 text-sm lg:text-[15px] leading-relaxed break-words ${bubbleBg} ${bubbleRadius} ${isPending ? "opacity-50" : ""} ${isFailed ? "ring-1 ring-fail/40" : ""}`}
          style={{ color: "var(--cs-ink)" }}
        >
          {message.content}
        </div>
        {isFailed && (
          <div className={`flex gap-2 mt-0.5 text-[10px] font-medium ${isMe ? "justify-end" : ""}`}>
            <button
              onClick={onRetry}
              className="text-[var(--cs-accent)] hover:underline cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={onDismiss}
              className="text-[var(--cs-ink-dim)] hover:text-[var(--cs-ink)] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
        {isPending && (
          <span
            className={`text-[10px] text-[var(--cs-ink-dim)] opacity-50 mt-0.5 ${isMe ? "text-right" : ""}`}
          >
            Sending...
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Game event cards (rendered as "messages" in the feed) ─── */

export function GameCard({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <motion.div
      className="mx-auto w-full max-w-sm lg:max-w-md"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={gentleSpring}
    >
      <div
        className={`rounded-2xl px-4 py-4 backdrop-blur-sm ${accent ? "bg-[var(--cs-bubble-game)] border border-[var(--cs-accent)]/20" : "bg-[var(--cs-surface)] border border-[var(--cs-edge)]"}`}
        style={accent ? { boxShadow: "var(--cs-glow)" } : { boxShadow: "var(--cs-shadow)" }}
      >
        {children}
      </div>
    </motion.div>
  );
}

/* ─── Vote option button ─── */

export function VoteOption({
  text,
  isMine,
  disabled,
  onVote,
}: {
  text: string;
  isMine: boolean;
  disabled: boolean;
  onVote: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={isMine ? undefined : onVote}
      disabled={disabled || isMine}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        isMine
          ? "border-[var(--cs-violet)]/20 bg-[var(--cs-violet-soft)] opacity-60 cursor-not-allowed"
          : "border-[var(--cs-edge)] bg-[var(--cs-surface)] hover:border-[var(--cs-accent)]/40 hover:bg-[var(--cs-accent-soft)] cursor-pointer"
      }`}
      whileHover={isMine ? {} : { scale: 1.01, y: -1 }}
      whileTap={isMine ? {} : { scale: 0.98 }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={msgSpring}
    >
      <p className="text-sm font-medium" style={{ color: "var(--cs-ink)" }}>
        {text}
      </p>
      {isMine && (
        <span className="text-[10px] text-[var(--cs-violet)] font-medium mt-0.5 block">
          Your answer
        </span>
      )}
    </motion.button>
  );
}

/* ─── Result row ─── */

export function ResultRow({
  text,
  playerName,
  modelId,
  voteCount,
  totalVotes,
  points,
  isWinner,
  delay,
}: {
  text: string;
  playerName: string;
  modelId: string | null;
  voteCount: number;
  totalVotes: number;
  points: number;
  isWinner: boolean;
  delay: number;
}) {
  const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
  return (
    <motion.div
      className={`relative overflow-hidden rounded-xl px-3.5 py-3 border ${
        isWinner
          ? "border-[var(--cs-accent)]/30 bg-[var(--cs-accent-soft)]"
          : "border-[var(--cs-edge)] bg-[var(--cs-surface)]"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...gentleSpring, delay }}
    >
      {/* Vote bar bg */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: isWinner
            ? "linear-gradient(90deg, var(--cs-accent-soft), transparent)"
            : "linear-gradient(90deg, var(--cs-raised), transparent)",
        }}
        initial={{ width: "0%" }}
        animate={{ width: `${pct}%` }}
        transition={{ ...springGentle, delay: delay + 0.2 }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--cs-ink)" }}>
            {text}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <PlayerAvatar name={playerName} modelId={modelId} size={14} className="rounded-full" />
            <span className="text-[11px] text-[var(--cs-ink-dim)] font-medium">{playerName}</span>
            {isWinner && (
              <motion.span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[var(--cs-accent)]/20 text-[var(--cs-accent)]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...springBouncy, delay: delay + 0.4 }}
              >
                Winner
              </motion.span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`font-mono font-bold text-base tabular-nums ${isWinner ? "text-[var(--cs-accent)]" : "text-[var(--cs-ink-dim)]"}`}
          >
            {points >= 0 ? "+" : ""}
            {points}
          </span>
          <p className="text-[10px] text-[var(--cs-ink-dim)] tabular-nums">
            {voteCount}v ({pct}%)
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Progress pill ─── */

export function ProgressPill({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const done = current >= total && total > 0;
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <div className="w-24 h-1 rounded-full bg-[var(--cs-edge)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: done
              ? "var(--cs-accent)"
              : "linear-gradient(90deg, var(--cs-accent), var(--cs-violet))",
          }}
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={springGentle}
        />
      </div>
      <span className="text-[10px] font-mono text-[var(--cs-ink-dim)] tabular-nums">
        {current}/{total} {label}
      </span>
    </div>
  );
}

/* ─── Chat input bar ─── */

export function ChatBar({
  mode,
  onSend,
  disabled,
  placeholder,
}: {
  mode: "chat" | "response" | "disabled";
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  const isResponse = mode === "response";
  const maxLen = isResponse ? 100 : 200;

  return (
    <div className="flex gap-2 items-end">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
        }}
        placeholder={placeholder}
        maxLength={maxLen}
        disabled={disabled || mode === "disabled"}
        className="flex-1 py-2.5 px-4 rounded-2xl text-sm transition-all focus:outline-none disabled:opacity-30"
        style={{
          background: "var(--cs-raised)",
          color: "var(--cs-ink)",
          border: `1px solid var(--cs-edge)`,
        }}
      />
      <motion.button
        type="button"
        onClick={handleSend}
        disabled={disabled || mode === "disabled" || !text.trim()}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: isResponse ? "var(--cs-accent)" : "var(--cs-accent-soft)",
          color: isResponse ? "var(--cs-bg)" : "var(--cs-accent)",
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </motion.button>
    </div>
  );
}
