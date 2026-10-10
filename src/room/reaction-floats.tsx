"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { EASE } from "@/lib/animations";
import { spreadOf } from "@/lib/hash";
import { reactionEmoji } from "@/lib/reactions";

const MAX_FLOATS = 6;

/**
 * Each new reaction floats up from the middle of its (relative) parent.
 * Reactions already there when this mounts never float, and at most six fly
 * at once. Place it where a float can't hint at anything secret.
 */
export function ReactionFloats({
  reactions,
}: {
  reactions: readonly { id: string; emoji: string }[];
}) {
  const [state, setState] = useState(() => ({
    seen: new Set(reactions.map((reaction) => reaction.id)),
    floats: [] as { id: string; emoji: string }[],
  }));
  const fresh = reactions.filter((reaction) => !state.seen.has(reaction.id));
  if (fresh.length > 0) {
    const seen = new Set(state.seen);
    fresh.forEach((reaction) => seen.add(reaction.id));
    const room = Math.max(0, MAX_FLOATS - state.floats.length);
    setState({
      seen,
      floats: [
        ...state.floats,
        ...fresh.slice(0, room).map((reaction) => ({ id: reaction.id, emoji: reaction.emoji })),
      ],
    });
  }
  const done = (id: string) =>
    setState((previous) => ({
      ...previous,
      floats: previous.floats.filter((float) => float.id !== id),
    }));

  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2">
      {state.floats.map((float) => (
        <motion.span
          key={float.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-4xl"
          initial={{ x: `${spreadOf(float.id) * 15}rem`, y: 0, opacity: 0 }}
          animate={{ y: "-10rem", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, ease: EASE.out, opacity: { times: [0, 0.1, 0.6, 1] } }}
          onAnimationComplete={() => done(float.id)}
        >
          {reactionEmoji(float.emoji)}
        </motion.span>
      ))}
    </div>
  );
}
