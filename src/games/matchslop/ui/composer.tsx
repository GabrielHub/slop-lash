"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { press } from "@/lib/animations";
import { buzz } from "@/room/moment";
import { MATCHSLOP_MAX_LINE_LENGTH } from "../config/game-config";
import { COPY } from "./copy";

/** The counter shows from this many characters. */
const COUNT_FROM = 60;
const MAX_LINES = 4;

export const PRIMARY =
  "h-14 w-full cursor-pointer rounded-2xl bg-punch font-display text-lg font-bold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50";

/** The phone's one primary action, pinned in the thumb zone. */
export function PrimaryBar({ children }: { children: ReactNode }) {
  return (
    <div data-keyboard-bar className="sticky bottom-[var(--keyboard-inset)] z-10 -mx-4 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

/**
 * A text to her: a textarea that grows to four lines, Enter sends (never a
 * newline; pasted newlines become spaces), a counter near the 80-character
 * cap, and Send pinned at the bottom. `extra` sits above the field.
 */
export function Composer({
  placeholder,
  ready = true,
  onSend,
  draft,
  onDraft,
  field: fieldShown = true,
}: {
  placeholder: string;
  /** Anything else the text needs before it can go (round 1: a picked card). */
  ready?: boolean;
  /** Resolves true once the text is in. */
  onSend: (text: string) => Promise<boolean>;
  /** Controlled draft, so it survives switching cards. */
  draft: string;
  onDraft: (text: string) => void;
  /** Hide the field (round 1, until a card is picked); Send still shows, disabled. */
  field?: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const text = draft.trim();
  const canSend = ready && text.length > 0 && !sending;

  // Grow with the text, up to four lines.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    const style = getComputedStyle(node);
    const line = parseFloat(style.lineHeight) || 28;
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const borders = node.offsetHeight - node.clientHeight;
    node.style.height = `${Math.min(node.scrollHeight, line * MAX_LINES + padding) + borders}px`;
  }, [draft, fieldShown]);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) buzz(12);
  };

  return (
    <>
      {fieldShown && (
        <div className="relative mt-3">
          <textarea
            ref={field}
            rows={1}
            value={draft}
            maxLength={MATCHSLOP_MAX_LINE_LENGTH}
            enterKeyHint="send"
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => onDraft(event.target.value.replace(/\r?\n/gu, " "))}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              event.preventDefault();
              void send();
            }}
            className="block w-full resize-none overflow-y-auto rounded-2xl border-2 border-edge bg-surface px-4 py-3 text-lg leading-snug text-ink placeholder:text-ink-dim focus:border-punch focus:outline-none"
          />
          {draft.length >= COUNT_FROM && (
            <span
              className={`absolute bottom-1 right-3 font-mono text-xs ${
                draft.length >= MATCHSLOP_MAX_LINE_LENGTH ? "text-punch" : "text-ink-dim"
              }`}
              aria-live="polite"
            >
              {draft.length}/{MATCHSLOP_MAX_LINE_LENGTH}
            </span>
          )}
        </div>
      )}
      <PrimaryBar>
        <motion.button
          type="button"
          className={PRIMARY}
          disabled={!canSend}
          onClick={() => void send()}
          {...press}
        >
          {sending ? COPY.sending : COPY.send}
        </motion.button>
      </PrimaryBar>
    </>
  );
}
