"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { CompletionCard } from "@/room/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { usePhaseCountdown } from "@/room/timer";
import { deckCard, press } from "@/lib/animations";
import { useModeView, usePlayers, useRoom, useRoomAction } from "@/room/context";
import { buzz } from "@/room/moment";
import { SLOPLASH_MAX_ANSWER } from "../game-constants";
import { roundMultiplier } from "../scoring";

import { PhoneScreen, WaitingScreen } from "./phone-parts";
import { formatPoints } from "@/lib/format";

/** Seconds left at which a typed, unsent answer goes in by itself. */
const AUTO_SEND_AT = 2;
/** The character count shows from here. */
const COUNT_FROM = 60;

/** WRITING on a phone: my prompts one at a time, then who the room is waiting on. */
export function PhoneWriting() {
  const { view, live } = useRoom();
  const mode = useModeView("SLOPLASH");
  const prompts = mode.writing?.prompts ?? [];
  const current = prompts.find((prompt) => !prompt.submitted);
  // Only a phone that was still writing on this screen buzzes when it finishes.
  const [wasWriting] = useState(() => current !== undefined);

  if (!view.me?.playerId || prompts.length === 0) {
    return <WaitingScreen subline="Players are writing" />;
  }
  if (!current) return <Done buzzNow={live && wasWriting} />;
  return <Writer />;
}

function Done({ buzzNow }: { buzzNow: boolean }) {
  const { players } = usePlayers();
  const mode = useModeView("SLOPLASH");
  const finished = new Set<string>(mode.writing?.finishedPlayerIds ?? []);
  useEffect(() => {
    if (buzzNow) buzz([10, 40, 10]);
  }, [buzzNow]);
  return (
    <PhoneScreen>
      <CompletionCard
        title="Done!"
        subtitle="Eyes on the TV"
        pending={players.filter((player) => !finished.has(player.id))}
      />
    </PhoneScreen>
  );
}

function Writer() {
  const { view, run } = useRoom();
  const { room } = view;
  const mode = useModeView("SLOPLASH");
  const { act, pending, error } = useRoomAction();
  const countdown = usePhaseCountdown();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const autoSent = useRef(new Set<string>());
  const prompts = mode.writing?.prompts ?? [];
  const current = prompts.find((prompt) => !prompt.submitted)!;
  const draft = drafts[current.id] ?? "";
  const ready = draft.trim().length > 0 && !pending;

  async function send() {
    if (!ready) return;
    if (await act(api.sloplash.play.submitResponse, { promptId: current.id, text: draft.trim() })) {
      buzz(10);
    }
  }

  // A typed answer still on screen in the last seconds goes in by itself.
  const remaining = countdown.untimed ? null : countdown.remaining;
  useEffect(() => {
    if (remaining === null || remaining > AUTO_SEND_AT) return;
    const text = draft.trim();
    if (!text || autoSent.current.has(current.id)) return;
    autoSent.current.add(current.id);
    run(api.sloplash.play.submitResponse, { promptId: current.id, text }).catch(() => {});
  }, [remaining, draft, current.id, run]);

  return (
    <PhoneScreen anchor="top" className="gap-3 pt-4">
      <div className="flex min-h-6 items-center justify-between">
        <ol className="flex items-center gap-1.5">
          {prompts.map((prompt, index) => (
            <li
              key={prompt.id}
              aria-label={`Prompt ${index + 1} of ${prompts.length}`}
              className={`size-2 rounded-full ${prompt.submitted ? "bg-teal" : "bg-edge-strong"}`}
            />
          ))}
        </ol>
        {room.round >= 2 && (
          <span className="rounded-full bg-gold-soft px-2 text-sm font-black text-gold-ink">
            ×{formatPoints(roundMultiplier(room.round))}
          </span>
        )}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={current.id}
          className="flex flex-col gap-3"
          variants={deckCard}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <p className="font-display text-2xl leading-snug font-bold text-gold-ink">
            {current.text}
          </p>
          <AnswerInput
            value={draft}
            readOnly={pending}
            onChange={(text) => setDrafts((previous) => ({ ...previous, [current.id]: text }))}
            onSubmit={() => void send()}
          />
          {draft.length >= COUNT_FROM && (
            <p
              className={`-mt-2 text-right text-sm tabular-nums ${
                draft.length >= SLOPLASH_MAX_ANSWER ? "text-fail" : "text-ink-dim"
              }`}
            >
              {draft.length}/{SLOPLASH_MAX_ANSWER}
            </p>
          )}
          <ErrorBanner error={error} className="" />
          <motion.button
            type="button"
            disabled={!ready}
            onClick={() => void send()}
            className={`h-14 w-full cursor-pointer rounded-2xl text-xl font-bold transition-colors disabled:cursor-not-allowed ${
              ready ? "bg-punch text-accent-ink" : "bg-raised text-ink-dim"
            }`}
            {...press}
          >
            Send
          </motion.button>
        </motion.div>
      </AnimatePresence>
    </PhoneScreen>
  );
}

/**
 * The answer box: grows with the text, Enter sends (never a newline), and it
 * stays focused while sending (read-only, not disabled, so the keyboard stays up).
 */
function AnswerInput({
  value,
  readOnly,
  onChange,
  onSubmit,
}: {
  value: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 4}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      readOnly={readOnly}
      maxLength={SLOPLASH_MAX_ANSWER}
      enterKeyHint="send"
      // The writer screen exists to take this answer; focus lands where the thumb is.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      autoComplete="off"
      autoCapitalize="sentences"
      placeholder="Type something funny"
      aria-label="Your answer"
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
      className="w-full resize-none rounded-2xl border-2 border-edge bg-surface p-4 text-xl text-ink placeholder:text-ink-dim focus:border-teal focus:outline-none"
    />
  );
}
