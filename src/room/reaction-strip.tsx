"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { press } from "@/lib/animations";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/reactions";
import { buzz } from "@/room/moment";

/**
 * A row of reaction buttons for a phone. Each sends once and stays lit;
 * `sent` is what the server already holds, and a failed send unlights.
 */
export function ReactionStrip({
  keys,
  sent,
  send,
}: {
  keys: readonly ReactionEmoji[];
  sent: readonly string[];
  send: (key: ReactionEmoji) => Promise<unknown>;
}) {
  const [optimistic, setOptimistic] = useState<string[]>([]);
  const lit = new Set<string>([...sent, ...optimistic]);

  function react(key: ReactionEmoji) {
    if (lit.has(key)) return;
    buzz(5);
    setOptimistic((previous) => [...previous, key]);
    send(key).catch(() => setOptimistic((previous) => previous.filter((entry) => entry !== key)));
  }

  return (
    <div className="mt-auto flex justify-between gap-2 pb-2">
      {keys.map((key) => {
        const on = lit.has(key);
        return (
          <motion.button
            key={key}
            type="button"
            aria-label={`React ${key}`}
            aria-pressed={on}
            disabled={on}
            onClick={() => react(key)}
            className={`grid size-14 cursor-pointer place-items-center rounded-full border-2 text-3xl transition-colors disabled:cursor-default ${
              on ? "border-teal bg-teal-soft ring-2 ring-teal" : "border-edge bg-surface"
            }`}
            {...press}
          >
            {REACTION_EMOJIS[key]}
          </motion.button>
        );
      })}
    </div>
  );
}
