"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  REACTION_EMOJIS,
  REACTION_EMOJI_KEYS,
  type ReactionEmoji,
} from "@/lib/reactions";
import type { GameReaction } from "@/lib/types";
import { springBouncy, springDefault } from "@/lib/animations";

interface ReactionBarProps {
  responseId: string;
  reactions: GameReaction[];
  playerId: string | null;
  code: string;
  disabled?: boolean;
  size?: "sm" | "lg";
  /** Map of playerId → player name, used for hover tooltips. */
  playerNames?: Map<string, string>;
}

interface AggregatedReaction {
  emoji: ReactionEmoji;
  count: number;
  reacted: boolean;
  /** Names of players who reacted with this emoji. */
  names: string[];
}

interface PickerProps {
  aggregated: AggregatedReaction[];
  onPick: (key: ReactionEmoji) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

type Accent = "gold" | "punch" | "teal" | "dim";

const EMOJI_ACCENT: Record<ReactionEmoji, Accent> = {
  laugh: "gold",
  fire: "punch",
  skull: "punch",
  clap: "gold",
  puke: "punch",
  sleep: "dim",
  eyes: "teal",
  hundred: "gold",
  target: "teal",
  clown: "punch",
};

function glowShadow(accent: Accent): string | undefined {
  switch (accent) {
    case "gold":
      return "0 0 14px color-mix(in srgb, var(--gold) 25%, transparent)";
    case "punch":
      return "0 0 14px color-mix(in srgb, var(--punch) 20%, transparent)";
    case "teal":
      return "0 0 14px color-mix(in srgb, var(--teal) 25%, transparent)";
    case "dim":
      return undefined;
  }
}

function activeClasses(accent: Accent): string {
  switch (accent) {
    case "gold":
      return "bg-gold/15 border-gold/50 text-ink";
    case "punch":
      return "bg-punch/12 border-punch/40 text-ink";
    case "teal":
      return "bg-teal/15 border-teal/50 text-ink";
    case "dim":
      return "bg-surface/80 border-edge-strong text-ink-dim";
  }
}

function aggregate(
  reactions: GameReaction[],
  playerId: string | null,
  playerNames?: Map<string, string>,
): AggregatedReaction[] {
  const map = new Map<string, AggregatedReaction>();
  for (const r of reactions) {
    const name = playerNames?.get(r.playerId) ?? r.playerId;
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.names.push(name);
      if (r.playerId === playerId) existing.reacted = true;
    } else {
      map.set(r.emoji, {
        emoji: r.emoji as ReactionEmoji,
        count: 1,
        reacted: r.playerId === playerId,
        names: [name],
      });
    }
  }
  return Array.from(map.values());
}

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(callback: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getIsMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, getIsMobile, () => false);
}

const SIZE_CLASSES = {
  sm: {
    chip: "h-7 px-2 gap-1.5",
    emoji: "text-[15px] leading-none",
    count: "text-[11px]",
    btn: "w-7 h-7",
  },
  lg: {
    chip: "h-9 px-3 gap-2",
    emoji: "text-lg leading-none",
    count: "text-xs",
    btn: "w-9 h-9",
  },
} as const;

/** Tooltip showing who reacted with a particular emoji. */
function NamesTooltip({ names, emoji }: { names: string[]; emoji: ReactionEmoji }) {
  return (
    <motion.div
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
      initial={{ opacity: 0, y: 4, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.92 }}
      transition={{ duration: 0.15 }}
    >
      <div
        className="px-2.5 py-1.5 rounded-lg bg-raised/95 backdrop-blur-xl border border-edge whitespace-nowrap"
        style={{
          boxShadow:
            "0 4px 16px color-mix(in srgb, var(--ink) 12%, transparent)",
        }}
      >
        <p className="text-[11px] text-ink-dim leading-snug text-center">
          <span className="mr-1">{REACTION_EMOJIS[emoji]}</span>
          {names.join(", ")}
        </p>
      </div>
      {/* Arrow */}
      <div className="flex justify-center -mt-px">
        <div className="w-2 h-2 bg-raised/95 border-r border-b border-edge rotate-45 -translate-y-1" />
      </div>
    </motion.div>
  );
}

function ReactionChip({
  r,
  sizeClasses,
  canInteract,
  isPending,
  hasNames,
  isMobile,
  onToggle,
}: {
  r: AggregatedReaction;
  sizeClasses: (typeof SIZE_CLASSES)[keyof typeof SIZE_CLASSES];
  canInteract: boolean;
  isPending: boolean;
  hasNames: boolean;
  isMobile: boolean;
  onToggle: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const accent = EMOJI_ACCENT[r.emoji];

  useEffect(() => {
    return () => clearTimeout(tooltipTimeout.current);
  }, []);

  const handleClick = useCallback(() => {
    if (canInteract) {
      onToggle();
    }
    // On mobile, show names tooltip on tap (for both interactive and disabled)
    if (isMobile && hasNames) {
      setShowTooltip(true);
      clearTimeout(tooltipTimeout.current);
      tooltipTimeout.current = setTimeout(() => setShowTooltip(false), 2000);
    }
  }, [canInteract, isMobile, hasNames, onToggle]);

  return (
    <motion.div
      className="relative"
      onMouseEnter={!isMobile && hasNames ? () => setShowTooltip(true) : undefined}
      onMouseLeave={!isMobile ? () => setShowTooltip(false) : undefined}
    >
      <AnimatePresence>
        {showTooltip && r.names.length > 0 && (
          <NamesTooltip names={r.names} emoji={r.emoji} />
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center ${sizeClasses.chip} rounded-lg border transition-all cursor-pointer ${
          r.reacted
            ? activeClasses(accent)
            : "bg-surface/40 border-edge backdrop-blur-sm text-ink-dim hover:border-edge-strong"
        } ${isPending ? "opacity-50" : ""}`}
        style={
          r.reacted ? { boxShadow: glowShadow(accent) } : undefined
        }
        initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.5, rotate: 12 }}
        transition={springBouncy}
        whileTap={{ scale: 0.82 }}
      >
        <span className={sizeClasses.emoji}>
          {REACTION_EMOJIS[r.emoji]}
        </span>
        <motion.span
          key={r.count}
          className={`${sizeClasses.count} font-mono tabular-nums ${r.reacted ? "text-ink" : "text-ink-dim"}`}
          initial={{ scale: 1.4 }}
          animate={{ scale: 1 }}
          transition={springBouncy}
        >
          {r.count}
        </motion.span>
      </motion.button>
    </motion.div>
  );
}

export function ReactionBar({
  responseId,
  reactions,
  playerId,
  code,
  disabled = false,
  size = "sm",
  playerNames,
}: ReactionBarProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const anchorRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Optimistic local reactions so clicks feel instant
  const [optimistic, setOptimistic] = useState<GameReaction[]>(reactions);
  useEffect(() => {
    setOptimistic(reactions);
  }, [reactions]);

  const aggregated = aggregate(optimistic, playerId, playerNames);
  const sizeClasses = SIZE_CLASSES[size];
  const canInteract = !disabled && !!playerId;
  const hasNames = !!playerNames && playerNames.size > 0;

  const toggle = useCallback(
    async (emoji: string) => {
      if (disabled || !playerId || pendingRef.current.has(emoji)) return;
      setPending((prev) => new Set(prev).add(emoji));

      // Optimistic update
      setOptimistic((prev) => {
        const idx = prev.findIndex(
          (r) => r.emoji === emoji && r.playerId === playerId,
        );
        if (idx >= 0) {
          return prev.filter((_, i) => i !== idx);
        }
        return [
          ...prev,
          { id: `optimistic-${emoji}`, responseId, playerId, emoji },
        ];
      });

      try {
        await fetch(`/api/games/${code}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, responseId, emoji }),
        });
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(emoji);
          return next;
        });
      }
    },
    [disabled, playerId, code, responseId],
  );

  const handlePick = useCallback(
    (key: ReactionEmoji) => {
      toggle(key);
      setOpen(false);
    },
    [toggle],
  );

  const closePicker = useCallback(() => setOpen(false), []);

  const Picker = isMobile ? MobileSheet : DesktopPopover;

  return (
    <>
      {/* Reaction chips + add button — inline row at the bottom */}
      {(aggregated.length > 0 || canInteract) && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3">
          <AnimatePresence>
            {aggregated.map((r) => (
              <ReactionChip
                key={r.emoji}
                r={r}
                sizeClasses={sizeClasses}
                canInteract={canInteract}
                isPending={pending.has(r.emoji)}
                hasNames={hasNames}
                isMobile={isMobile}
                onToggle={() => toggle(r.emoji)}
              />
            ))}
          </AnimatePresence>

          {canInteract && (
            <div className="relative" ref={anchorRef}>
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
                className={`${sizeClasses.btn} rounded-lg border border-dashed border-edge text-ink-dim/40 hover:text-ink-dim hover:border-edge-strong flex items-center justify-center transition-colors cursor-pointer`}
                animate={{ rotate: open ? 45 : 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.8 }}
                transition={springDefault}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </motion.button>

              <AnimatePresence>
                {open && (
                  <Picker
                    aggregated={aggregated}
                    onPick={handlePick}
                    onClose={closePicker}
                    anchorRef={anchorRef}
                  />
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DesktopPopover({ aggregated, onPick, onClose, anchorRef }: PickerProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;

    function update() {
      const rect = el!.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.left });
    }

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        className="fixed z-50 p-2 rounded-xl bg-raised/90 backdrop-blur-xl border border-edge"
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          transform: "translateY(-100%)",
          boxShadow:
            "0 8px 32px color-mix(in srgb, var(--ink) 12%, transparent), 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent)",
        }}
        initial={{ opacity: 0, scale: 0.85, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 8 }}
        transition={springBouncy}
      >
        <div className="grid grid-cols-5 gap-1">
          {REACTION_EMOJI_KEYS.map((key, i) => {
            const accent = EMOJI_ACCENT[key];
            const reacted = aggregated.some(
              (r) => r.emoji === key && r.reacted,
            );
            return (
              <motion.button
                key={key}
                type="button"
                onClick={() => onPick(key)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg text-xl cursor-pointer ${
                  reacted
                    ? `${activeClasses(accent)} border`
                    : "border border-transparent hover:bg-surface/80"
                }`}
                style={
                  reacted ? { boxShadow: glowShadow(accent) } : undefined
                }
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...springBouncy, delay: i * 0.025 }}
                whileHover={{ scale: 1.25, y: -3 }}
                whileTap={{ scale: 0.75 }}
              >
                {REACTION_EMOJIS[key]}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </>,
    document.body,
  );
}

function MobileSheet({ aggregated, onPick, onClose }: PickerProps) {
  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-40 backdrop-blur-[2px]"
        style={{
          background:
            "color-mix(in srgb, var(--ink) 22%, transparent)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed inset-x-0 bottom-0 z-50"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 400, damping: 34 }}
      >
        <div
          className="bg-raised/95 backdrop-blur-xl rounded-t-2xl border border-b-0 border-edge overflow-hidden pb-[env(safe-area-inset-bottom,12px)]"
          style={{
            boxShadow:
              "0 -4px 24px color-mix(in srgb, var(--ink) 10%, transparent)",
          }}
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-8 h-1 rounded-full bg-edge-strong/60" />
          </div>

          <p className="text-center text-[10px] font-display font-bold uppercase tracking-[0.2em] text-ink-dim/40 mb-2">
            React
          </p>

          <div className="grid grid-cols-5 gap-2 px-4 pb-4">
            {REACTION_EMOJI_KEYS.map((key, i) => {
              const accent = EMOJI_ACCENT[key];
              const reacted = aggregated.some(
                (r) => r.emoji === key && r.reacted,
              );
              return (
                <motion.button
                  key={key}
                  type="button"
                  onClick={() => onPick(key)}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-2xl cursor-pointer ${
                    reacted
                      ? `${activeClasses(accent)} border`
                      : "bg-surface/40 border border-edge/40 active:bg-surface/80"
                  }`}
                  style={
                    reacted ? { boxShadow: glowShadow(accent) } : undefined
                  }
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springBouncy, delay: i * 0.035 }}
                  whileTap={{ scale: 0.8 }}
                >
                  {REACTION_EMOJIS[key]}
                  <span className="text-[8px] font-mono text-ink-dim/30 mt-0.5 leading-none">
                    {key}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
