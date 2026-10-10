"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DUR, EASE, SPRING, fade, pop } from "@/lib/animations";
import { TypeOn } from "@/room/moment";
import { LEVEL_EMOJI } from "./copy";
import { REPLY_CPS } from "./beats";
import { TypingDots, latestPersona, levelOfTurn, type ChatMessage, type Level } from "./primitives";

/** Her bubble's face; `HER_BUBBLE` adds the chat width. */
export const HER_FACE =
  "rounded-[1.75rem] rounded-bl-md border border-edge bg-surface px-6 py-4 text-ink";
/** Her bubble: left, surface. */
export const HER_BUBBLE = `max-w-[80%] ${HER_FACE}`;
/** Our bubble: right, punch. */
export const OUR_BUBBLE =
  "max-w-[64%] rounded-[1.75rem] rounded-br-md bg-punch px-6 py-4 text-accent-ink";
/** Our bubble's shape without its fill: the thread picks a live or an earlier fill. */
const OUR_SHAPE = "max-w-[64%] rounded-[1.75rem] rounded-br-md px-6 py-4";
/**
 * Earlier bubbles step back with opaque fills and readable ink (not opacity),
 * so nothing behind them shows through and the text keeps its contrast.
 */
const OUR_EARLIER = "bg-(--ms-bubble-earlier) text-ink";
const HER_EARLIER = "text-ink-dim";

/** The top of the thread fades out over this much (the mask). */
const FADE_REM = 3;

/** A face on the corner of one of our bubbles: how she took it. */
export function Tapback({ level, className = "" }: { level: Level; className?: string }) {
  return (
    <motion.span
      className={`absolute -left-3 -top-3 grid size-[2.5rem] place-items-center rounded-full border border-edge bg-surface text-xl leading-none ${className}`}
      variants={pop}
      initial="hidden"
      animate="visible"
    >
      <span aria-hidden="true">{LEVEL_EMOJI[level]}</span>
      <span className="sr-only">{level}</span>
    </motion.span>
  );
}

/** Her typing, keyed like her reply so it grows into it. Sized by its dots, never squeezed. */
export function TypingBubble({ size = "1.5rem" }: { size?: string }) {
  return (
    <div className={`${HER_FACE} w-max py-5`}>
      <TypingDots dot={size} tone="text-ink-dim" />
    </div>
  );
}

/**
 * Hides any bubble that is mostly under the top fade or cut off above it (less
 * than 30% of it in the clear), so the mask never leaves a sliver of
 * half-clipped glyphs. Reads layout offsets
 * (not transformed boxes), so a row mid-flight is judged where it will land.
 * Re-checks only when the thread or a row resizes, rows come and go, or the
 * row gap (`spacing`) changes.
 */
function useHideMasked(container: React.RefObject<HTMLDivElement | null>, spacing: string) {
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const rows = () => root.querySelectorAll<HTMLElement>(":scope > [data-ms-row]");
    const update = () => {
      const fadePx = FADE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
      for (const row of rows()) {
        const top = row.offsetTop;
        const height = row.offsetHeight || 1;
        const shown = Math.max(0, top + height - Math.max(top, fadePx)) / height;
        row.toggleAttribute("data-ms-masked", shown < 0.3);
      }
    };
    const resizes = new ResizeObserver(update);
    const watch = () => {
      resizes.observe(root);
      for (const row of rows()) resizes.observe(row);
    };
    const children = new MutationObserver(() => {
      watch();
      update();
    });
    update();
    watch();
    children.observe(root, { childList: true });
    return () => {
      resizes.disconnect();
      children.disconnect();
    };
  }, [container, spacing]);
}

export interface ThreadProps {
  messages: readonly ChatMessage[];
  /** The game's current round: its bubbles are the ones in play. */
  round: number;
  /** Our current-round bubble at the sent size (SENT and REPLY). */
  bigCurrent: boolean;
  /** Her latest reply stays big; false in SENT, where our new line has the floor. */
  herLatestBig: boolean;
  /** Her typing bubble for the current round. */
  typing: boolean;
  /** Her current-round reply types out (a fresh REPLY). */
  typeReply: boolean;
  /** No tapback on the current round yet (REPLY shows the reaction stamp instead). */
  holdCurrentTapback: boolean;
  /** Drawn on the top-left corner of our current bubble (the reaction stamp). */
  ourCorner?: ReactNode;
  /** Beside our current bubble, on its left (the author's face in SENT). */
  ourAside?: ReactNode;
  /** Under our current bubble (the points row). */
  ourBelow?: ReactNode;
  /** Under her current-round reply (the thought). */
  herBelow?: ReactNode;
  /** Gap between rows. */
  gap?: string;
  className?: string;
}

/**
 * The chat, bottom-anchored and never scrolled: older bubbles clip under a
 * top mask, the newest exchange never does. Bubbles keep their keys across
 * phases (ours `ms-line-{turn}`, hers `ms-persona-{turn}`), so the thread
 * relayouts in place as sizes change and her typing grows into her reply.
 */
export function Thread({
  messages,
  round,
  bigCurrent,
  herLatestBig,
  typing,
  typeReply,
  holdCurrentTapback,
  ourCorner,
  ourAside,
  ourBelow,
  herBelow,
  gap = "gap-4",
  className = "",
}: ThreadProps) {
  const ref = useRef<HTMLDivElement>(null);
  useHideMasked(ref, gap);
  const latestHer = latestPersona(messages);
  const typingNow =
    typing && !messages.some((message) => message.speaker === "PERSONA" && message.turn === round);

  return (
    <div
      ref={ref}
      className={`ms-thread relative flex min-h-0 flex-col justify-end overflow-hidden pb-2 ${gap} ${className}`}
      style={{
        maskImage: `linear-gradient(to bottom, transparent, black ${FADE_REM}rem)`,
        WebkitMaskImage: `linear-gradient(to bottom, transparent, black ${FADE_REM}rem)`,
      }}
    >
      <AnimatePresence initial={false}>
        {[
          ...messages.map((message) => {
            const current = message.turn === round;
            if (message.speaker === "PLAYERS") {
              const big = current && bigCurrent;
              const level = levelOfTurn(messages, message.turn);
              const tapback = level && !(current && holdCurrentTapback);
              return (
                <motion.div
                  key={`ms-line-${message.turn}`}
                  data-ms-row=""
                  layout="position"
                  transition={SPRING.smooth}
                  className="flex shrink-0 flex-col items-end"
                  variants={fade}
                  initial="hidden"
                  animate="visible"
                >
                  {message.turn === 1 && message.openerPromptText && (
                    <p className="mb-1 max-w-[64%] truncate text-right text-lg text-punch">
                      ↳ {message.openerPromptText}
                    </p>
                  )}
                  <div className="flex max-w-full items-center justify-end gap-3">
                    {current && ourAside}
                    <motion.div
                      layoutId={`ms-line-${message.turn}`}
                      // The sent card flies in at full strength rather than crossfading.
                      layoutCrossfade={false}
                      transition={SPRING.smooth}
                      className={`relative ${OUR_SHAPE} ${
                        big ? "bg-punch text-3xl text-accent-ink" : `${OUR_EARLIER} text-2xl`
                      } leading-snug transition-colors duration-300`}
                    >
                      <span className="block break-words">{message.text}</span>
                      {tapback && <Tapback level={level} />}
                      {current && ourCorner}
                    </motion.div>
                  </div>
                  {current && ourBelow}
                </motion.div>
              );
            }
            const big = message.id === latestHer?.id && herLatestBig;
            const fresh = current && typeReply;
            return (
              <motion.div
                key={`ms-persona-${message.turn}`}
                data-ms-row=""
                layout="position"
                transition={SPRING.smooth}
                className="flex shrink-0 flex-col items-start"
                variants={pop}
                initial="hidden"
                animate="visible"
              >
                <motion.div
                  layout
                  transition={SPRING.smooth}
                  className={`${HER_BUBBLE} ${big ? "text-4xl" : `text-2xl ${HER_EARLIER}`} leading-snug transition-colors duration-300`}
                >
                  {fresh ? (
                    <TypeOn text={message.text} cps={REPLY_CPS} className="break-words" />
                  ) : (
                    <span className="block break-words">{message.text}</span>
                  )}
                </motion.div>
                {current && herBelow}
              </motion.div>
            );
          }),
          typingNow && (
            <motion.div
              key={`ms-persona-${round}`}
              data-ms-row=""
              layout="position"
              className="flex shrink-0 justify-start"
              variants={pop}
              initial="hidden"
              animate="visible"
              exit={{
                opacity: 0,
                transition: { duration: DUR.fast, ease: EASE.in },
              }}
            >
              <TypingBubble />
            </motion.div>
          ),
        ]}
      </AnimatePresence>
    </div>
  );
}
