"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fadeInUp, popIn, staggerContainer } from "@/lib/animations";
import { formatSigned } from "@/lib/format";
import type { ModeView } from "@/room/context";
import { MATCHSLOP_PHOTO_PROMPT_TEXT } from "../config/game-config";
import {
  MATCHSLOP_MOOD_THRESHOLD_UNMATCH,
  clampMatchSlopMood,
  getMoodLabel,
  type MatchSlopMoodLabel,
} from "../types";

export type MatchslopMode = ModeView<"MATCHSLOP">;
export type Persona = MatchslopMode["persona"];
export type ChatMessage = MatchslopMode["messages"][number];
export type Outcome = MatchslopMode["outcome"];
export type Signal = NonNullable<MatchslopMode["signal"]>;
export type Answer = NonNullable<MatchslopMode["round"]>["answers"][number];

export function personaName(persona: Persona): string {
  return persona.profile?.displayName ?? "Your match";
}

export const card = {
  background: "var(--ms-surface)",
  border: "1px solid var(--ms-edge)",
  boxShadow: "var(--ms-shadow)",
} as const;

export const raised = {
  background: "var(--ms-raised)",
  border: "1px solid var(--ms-edge)",
} as const;

/* ─── Icons ─── */

type IconProps = { size?: number; className?: string };

export function HeartIcon({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export function BrokenHeartIcon({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.53L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zM12.1 18.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5 18.5 5 20 6.5 20 8.5c0 2.89-3.14 5.74-7.9 10.05z" />
    </svg>
  );
}

export function SparkleIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

export function CrownIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2 19h20v2H2v-2zm1.2-5.6L2 5l4.8 4.8L12 2l5.2 7.8L22 5l-1.2 8.4H3.2z" />
    </svg>
  );
}

function StrokeIcon({ size = 20, className = "", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function LocationIcon(props: IconProps) {
  return (
    <StrokeIcon size={16} {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </StrokeIcon>
  );
}

export function PenIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </StrokeIcon>
  );
}

export function VoteIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </StrokeIcon>
  );
}

export function PhotoIcon(props: IconProps) {
  return (
    <StrokeIcon size={18} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </StrokeIcon>
  );
}

function ChatIcon(props: IconProps) {
  return (
    <StrokeIcon size={12} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </StrokeIcon>
  );
}

/* ─── Outcomes ─── */

type Ending = Exclude<Outcome, "IN_PROGRESS">;

export const ENDINGS: Record<
  Ending,
  { badge: string; verdict: string; color: string; soft: string; Icon: typeof HeartIcon }
> = {
  DATE_SEALED: {
    badge: "It's a date!",
    verdict: "Date sealed",
    color: "var(--ms-mint)",
    soft: "var(--ms-mint-soft)",
    Icon: HeartIcon,
  },
  UNMATCHED: {
    badge: "Unmatched",
    verdict: "Unmatched",
    color: "var(--ms-red)",
    soft: "var(--ms-red-soft)",
    Icon: BrokenHeartIcon,
  },
  TURN_LIMIT: {
    badge: "Time's up",
    verdict: "Time’s up",
    color: "var(--ms-coral)",
    soft: "var(--ms-coral-soft)",
    Icon: SparkleIcon,
  },
  COMEBACK: {
    badge: "Comeback",
    verdict: "Comeback",
    color: "var(--ms-coral)",
    soft: "var(--ms-coral-soft)",
    Icon: SparkleIcon,
  },
};

export function OutcomeBadge({ outcome, small = false }: { outcome: Outcome; small?: boolean }) {
  if (outcome === "IN_PROGRESS") return null;
  const { badge, color, soft, Icon } = ENDINGS[outcome];
  return (
    <motion.span
      className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
        small ? "text-[10px]" : "text-xs"
      }`}
      style={{ color, background: soft }}
      variants={popIn}
      initial="hidden"
      animate="visible"
    >
      <Icon size={small ? 12 : 14} />
      {badge}
    </motion.span>
  );
}

/** The divider-style verdict under the chat once the date is decided. */
export function OutcomeVerdict({ outcome }: { outcome: Outcome }) {
  if (outcome === "IN_PROGRESS") return null;
  const { verdict, color, Icon } = ENDINGS[outcome];
  const glows = outcome === "DATE_SEALED" || outcome === "COMEBACK";
  const line = (direction: "right" | "left") => (
    <div
      className="flex-1 h-px"
      style={{
        background: `linear-gradient(to ${direction}, transparent, ${color})`,
        opacity: 0.3,
      }}
    />
  );
  return (
    <motion.div
      style={{
        borderTop: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${color} 8%, var(--ms-surface)), var(--ms-surface))`,
        boxShadow: glows ? `0 -4px 24px color-mix(in srgb, ${color} 12%, transparent)` : "none",
        padding: "clamp(1rem, 1.8vw, 1.5rem) clamp(1.25rem, 2vw, 1.75rem)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3">
        {line("right")}
        <motion.div
          className="shrink-0 flex items-center gap-2.5"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", bounce: 0.35 }}
        >
          <span
            className={outcome === "DATE_SEALED" ? "animate-ms-heartbeat flex" : "flex"}
            style={{ color }}
          >
            <Icon size={18} />
          </span>
          <span
            className="font-display font-bold uppercase tracking-widest"
            style={{ fontSize: "clamp(0.6rem, 0.85vw, 0.8rem)", color }}
          >
            {verdict}
          </span>
        </motion.div>
        {line("left")}
      </div>
    </motion.div>
  );
}

/* ─── Mood ─── */

const MOOD_EMOJI: Record<MatchSlopMoodLabel, string> = {
  done: "\u{1F480}",
  skeptical: "\u{1F612}",
  amused: "\u{1F60F}",
  intrigued: "\u{1F60D}",
  obsessed: "\u{1F525}",
};

/** Cold-to-hot: blue at 0 through yellow to red at 100. */
function moodColor(mood: number): string {
  const t = mood / 100;
  const saturation = Math.round(70 + 20 * Math.abs(t - 0.5) * 2);
  return `hsl(${Math.round(220 * (1 - t))}, ${saturation}%, 55%)`;
}

export function DeltaBadge({ delta }: { delta: number | null }) {
  return (
    <AnimatePresence mode="popLayout">
      {delta != null && delta !== 0 && (
        <motion.span
          key={delta}
          className="font-mono font-bold tabular-nums"
          style={{
            fontSize: "clamp(0.5rem, 0.65vw, 0.6rem)",
            color: delta > 0 ? "var(--ms-mint)" : "var(--ms-red)",
          }}
          initial={{ opacity: 0, y: delta > 0 ? 6 : -6, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
        >
          {formatSigned(delta)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function MoodMeter({ mood, delta }: { mood: number; delta: number | null }) {
  const value = clampMatchSlopMood(mood);
  const label = getMoodLabel(value);
  const color = moodColor(value);
  const danger = value <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH;

  return (
    <motion.div
      className="flex items-center gap-3"
      style={{ padding: "clamp(0.6rem, 1vw, 0.8rem) 0" }}
      animate={danger ? { x: [0, -2, 2, -1.5, 1.5, -0.5, 0.5, 0] } : { x: 0 }}
      transition={danger ? { duration: 0.5, repeat: 3, repeatDelay: 2.5 } : { duration: 0.2 }}
    >
      <div className="shrink-0 flex items-center gap-1.5">
        <motion.span
          key={label}
          style={{ fontSize: "clamp(0.85rem, 1.1vw, 1rem)" }}
          initial={{ scale: 1.4, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          {MOOD_EMOJI[label]}
        </motion.span>
        <span
          className="font-display font-bold uppercase tracking-wider"
          style={{ fontSize: "clamp(0.55rem, 0.7vw, 0.65rem)", color }}
        >
          {label}
        </span>
      </div>

      <div className="flex-1 relative">
        <div
          className="w-full rounded-full overflow-hidden relative"
          style={{
            height: "clamp(6px, 0.5vw, 8px)",
            background: "color-mix(in srgb, var(--ms-edge) 50%, transparent)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: `${MATCHSLOP_MOOD_THRESHOLD_UNMATCH}%`,
              background: "color-mix(in srgb, var(--ms-red) 12%, transparent)",
            }}
          />
          <motion.div
            className="h-full rounded-full relative z-[1]"
            initial={false}
            animate={{ width: `${Math.max(value, 2)}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 22, mass: 0.8 }}
            style={{
              background: color,
              boxShadow: `0 0 6px color-mix(in srgb, ${color} 40%, transparent)`,
            }}
          />
        </div>
        {/* The unmatch line. */}
        <div
          className="absolute top-[-2px] bottom-[-2px] w-0.5 rounded-[1px] pointer-events-none z-[2]"
          style={{
            left: `${MATCHSLOP_MOOD_THRESHOLD_UNMATCH}%`,
            background: "var(--ms-red)",
            opacity: danger ? 0.8 : 0.4,
          }}
        />
        <motion.div
          key={value}
          className="absolute inset-0 rounded-full pointer-events-none"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            boxShadow: `0 0 16px ${color}, 0 0 32px color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        />
      </div>

      <div className="shrink-0 flex items-center gap-1">
        <motion.span
          key={value}
          className="font-mono font-bold tabular-nums text-right min-w-[2ch]"
          style={{ fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)", color }}
          initial={{ scale: 1.3, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          {value}
        </motion.span>
        <DeltaBadge delta={delta} />
      </div>
    </motion.div>
  );
}

/* ─── Small status bits ─── */

export function TypingDots({ color = "var(--ms-rose)" }: { color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="w-2 h-2 rounded-full"
          style={{
            background: color,
            animation: `ms-typing-dot 1.4s ease-in-out ${index * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function ProgressCount({
  count,
  total,
  label,
}: {
  count: number;
  total: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="font-mono font-bold tabular-nums"
        style={{
          fontSize: "clamp(0.7rem, 0.8vw, 0.8rem)",
          color: count >= total ? "var(--ms-mint)" : "var(--ms-ink-dim)",
        }}
      >
        {count}/{total}
      </span>
      <span
        className="font-display uppercase tracking-wider opacity-70"
        style={{ fontSize: "clamp(0.55rem, 0.6vw, 0.6rem)", color: "var(--ms-ink-dim)" }}
      >
        {label}
      </span>
    </div>
  );
}

/** How the persona took the last message: a category, an aside, and the mood swing. */
export function SignalChips({ signal, className = "" }: { signal: Signal; className?: string }) {
  return (
    <motion.div
      className={`flex items-center gap-2 flex-wrap ${className}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.2 }}
    >
      <span
        className="font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={{
          fontSize: "clamp(0.55rem, 0.6vw, 0.65rem)",
          color: "var(--ms-coral)",
          background: "var(--ms-coral-soft)",
          border: "1px solid color-mix(in srgb, var(--ms-coral) 25%, transparent)",
        }}
      >
        {signal.category}
      </span>
      {signal.sideComment && (
        <span
          className="font-display italic"
          style={{ fontSize: "clamp(0.75rem, 0.85vw, 0.85rem)", color: "var(--ms-ink-dim)" }}
        >
          &ldquo;{signal.sideComment}&rdquo;
        </span>
      )}
      {signal.moodDelta !== 0 && (
        <span
          className="font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-md"
          style={{
            fontSize: "clamp(0.6rem, 0.65vw, 0.65rem)",
            color: signal.moodDelta > 0 ? "var(--ms-mint)" : "var(--ms-red)",
            background: signal.moodDelta > 0 ? "var(--ms-mint-soft)" : "var(--ms-red-soft)",
          }}
        >
          {formatSigned(signal.moodDelta)}
        </span>
      )}
    </motion.div>
  );
}

/* ─── Chat ─── */

function OpenerContext({ text }: { text: string }) {
  const photo = text === MATCHSLOP_PHOTO_PROMPT_TEXT;
  return (
    <div
      className="flex items-center gap-1.5 mb-2 rounded-lg min-w-0"
      style={{
        padding: "clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.5rem, 0.8vw, 0.7rem)",
        background: "color-mix(in srgb, var(--ms-violet) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--ms-violet) 15%, transparent)",
        color: "var(--ms-violet)",
        fontSize: "clamp(0.6rem, 0.65vw, 0.65rem)",
      }}
    >
      {photo ? (
        <PhotoIcon size={12} className="shrink-0 opacity-70" />
      ) : (
        <ChatIcon className="shrink-0 opacity-70" />
      )}
      <span className="font-display font-semibold opacity-80 shrink-0">Replied to:</span>
      <span className="font-display font-bold truncate">{photo ? text : `"${text}"`}</span>
    </div>
  );
}

function ChatBubble({ message, compact }: { message: ChatMessage; compact: boolean }) {
  const persona = message.speaker === "PERSONA";
  const ending =
    message.outcome && message.outcome !== "CONTINUE" ? ENDINGS[message.outcome] : null;
  return (
    <motion.div className={`flex ${persona ? "justify-start" : "justify-end"}`} variants={fadeInUp}>
      <div
        className={`max-w-[85%] min-w-0 rounded-2xl ${persona ? "rounded-bl-md" : "rounded-br-md"}`}
        style={{
          background: persona ? "var(--ms-bubble-persona)" : "var(--ms-bubble-player)",
          border: `1px solid ${persona ? "var(--ms-rose-soft)" : "var(--ms-violet-soft)"}`,
          padding: compact
            ? "0.625rem 0.875rem"
            : "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 1.8vw, 1.5rem)",
        }}
      >
        {!compact && message.openerPromptText && <OpenerContext text={message.openerPromptText} />}
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <span
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: compact ? "9px" : "clamp(0.6rem, 0.7vw, 0.7rem)",
              color: persona ? "var(--ms-rose)" : "var(--ms-violet)",
            }}
          >
            {message.authorName ?? (persona ? "Persona" : "Players")}
          </span>
          {!compact && (
            <span
              className="font-mono"
              style={{ fontSize: "clamp(0.6rem, 0.65vw, 0.65rem)", color: "var(--ms-ink-dim)" }}
            >
              Turn {message.turn}
            </span>
          )}
        </div>
        <p
          className="leading-relaxed break-words"
          style={{
            fontSize: compact ? "13px" : "clamp(0.9rem, 1.2vw, 1.3rem)",
            color: "var(--ms-ink)",
          }}
        >
          {message.text}
        </p>
        {ending && (
          <motion.div
            className="flex items-center gap-1.5 mt-2"
            style={{
              fontSize: compact ? "10px" : "clamp(0.6rem, 0.8vw, 0.75rem)",
              color: ending.color,
            }}
            variants={popIn}
            initial="hidden"
            animate="visible"
          >
            <ending.Icon size={12} />
            <span className="font-bold uppercase tracking-wider">{ending.verdict}</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function PersonaTyping({ name, compact }: { name: string; compact: boolean }) {
  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.3 }}
    >
      <div
        className="rounded-2xl rounded-bl-md"
        style={{
          background: "var(--ms-bubble-persona)",
          border: "1px solid var(--ms-rose-soft)",
          padding: compact
            ? "0.625rem 0.875rem"
            : "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 1.8vw, 1.5rem)",
        }}
      >
        <span
          className="block font-bold uppercase tracking-wider mb-1"
          style={{
            fontSize: compact ? "9px" : "clamp(0.6rem, 0.7vw, 0.7rem)",
            color: "var(--ms-rose)",
          }}
        >
          {name}
        </span>
        <div className="py-1">
          <TypingDots color="var(--ms-ink-dim)" />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The dating-app conversation, newest at the bottom. `typing` names the
 * persona while their reply is on the way.
 */
export function Chat({
  messages,
  typing = null,
  compact = false,
  className = "",
  empty,
}: {
  messages: ChatMessage[];
  typing?: string | null;
  compact?: boolean;
  className?: string;
  empty?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, typing]);

  if (messages.length === 0 && !typing) return <>{empty}</>;
  return (
    <div ref={scroller} className={`overflow-y-auto ${className}`}>
      <motion.div
        className={compact ? "space-y-2.5" : "space-y-3"}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} compact={compact} />
        ))}
        {typing && <PersonaTyping name={typing} compact={compact} />}
      </motion.div>
    </div>
  );
}
