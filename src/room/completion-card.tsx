"use client";

import { AnimatePresence, motion } from "motion/react";
import { DUR, EASE, SPRING, pop } from "@/lib/animations";
import { Avatar } from "./avatar";

interface CompletionCardProps {
  /** Short and loud, e.g. "Sent!". */
  title: string;
  subtitle?: string;
  /** People the room is still waiting on; each pops out of the row as they finish. */
  pending?: readonly { id: string; name: string; modelId: string | null }[];
}

/** The "you're done" moment on a phone: a check that draws itself, then who's left. */
export function CompletionCard({ title, subtitle, pending }: CompletionCardProps) {
  return (
    <motion.div
      key="all-done"
      className="flex flex-col items-center py-10 text-center"
      variants={pop}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="status"
    >
      <motion.div
        className="mb-4 flex size-18 items-center justify-center rounded-full border-2 border-win/40 bg-win-soft text-win"
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1, 1.1, 1] }}
        transition={{ duration: 0.75, times: [0, 0.55, 0.75, 1], ease: EASE.out }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-9" aria-hidden="true">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: 0.05 }}
          />
        </svg>
      </motion.div>
      <p className="font-display text-2xl font-bold text-win">{title}</p>
      {subtitle && <p className="mt-1 text-base text-ink-dim">{subtitle}</p>}
      {pending && pending.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Still writing">
          <AnimatePresence initial={false}>
            {pending.map((player) => (
              <motion.li
                key={player.id}
                layout
                variants={pop}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.4, transition: SPRING.pop }}
                title={player.name}
              >
                <Avatar name={player.name} modelId={player.modelId} size="32px" />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
