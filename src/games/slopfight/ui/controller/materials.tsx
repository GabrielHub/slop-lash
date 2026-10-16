"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { press } from "@/lib/animations";
import type { Finish } from "../../vocab";
import { MATERIAL_STARTERS } from "./logic";
import { useSfx } from "./shared";

// What a champion can be made of, on the phone: a painted swatch per finish
// (the champion card's "Made of" list) and the upgrade box's material chips.
// A chip only starts the text ("solid gold "); the player says what it makes,
// so the box stays the one way to upgrade and any part, prop or detail works.

/** A small painted chip of each finish, readable in both themes. */
const SWATCH: Readonly<Record<Finish, CSSProperties>> = {
  vinyl: { background: "radial-gradient(circle at 35% 30%, #fff6e8, #f28b30 55%, #8f4712)" },
  metal: { background: "linear-gradient(160deg, #f6f8fa 0%, #b9c1c9 38%, #4a535d 52%, #8b949d 70%, #e3e8ec 100%)" },
  gold: { background: "linear-gradient(160deg, #fff4b8 0%, #f2c14a 36%, #8a5a12 54%, #d9a334 72%, #fff0a6 100%)" },
  crystal: {
    background:
      "conic-gradient(from 20deg at 45% 40%, #f4fbff, #a9d4ff, #f3ddff, #c3f7ec, #ffffff, #b5c9ff, #f4fbff)",
  },
  stone: {
    background:
      "radial-gradient(circle at 30% 70%, #5d5a55 0 6%, transparent 7%), radial-gradient(circle at 68% 34%, #66625c 0 5%, transparent 6%), radial-gradient(circle at 35% 30%, #c8c4bb, #8a867e 60%, #5f5b55)",
  },
  wood: {
    background:
      "repeating-radial-gradient(circle at 20% 110%, #c48a52 0 5px, #9b6334 5px 7px, #b67b45 7px 11px)",
  },
  ice: { background: "linear-gradient(160deg, #ffffff 0%, #d4f4fb 35%, #8fd3e8 70%, #5fb2cf 100%)" },
  lava: {
    background:
      "radial-gradient(circle at 60% 60%, #ffe27a 0 8%, #ff7a1f 20%, transparent 34%), radial-gradient(circle at 30% 35%, #ff9a2e 0 6%, transparent 14%), radial-gradient(circle, #4a2419, #2a1410)",
  },
  slime: { background: "radial-gradient(circle at 35% 28%, #f6ffd8 0 10%, #a6e34a 40%, #5c9a1d 80%)" },
  glow: {
    background: "radial-gradient(circle, #ffffff 0 18%, #c9fff0 38%, #3fd6b0 75%)",
    boxShadow: "0 0 14px 2px color-mix(in srgb, #3fd6b0 65%, transparent)",
  },
};

export function FinishSwatch({ finish, className = "size-5" }: { finish: Finish; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ring-1 ring-edge-strong ${className}`}
      style={SWATCH[finish]}
    />
  );
}

/** A scrolling row of material chips under the upgrade box; a tap starts the text. */
export function MaterialStarters({
  onPick,
  disabled,
}: {
  onPick: (phrase: string) => void;
  disabled: boolean;
}) {
  const play = useSfx();
  return (
    <ul
      className="-mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]"
      aria-label="Make it out of something"
    >
      {MATERIAL_STARTERS.map((starter) => (
        <li key={starter.finish} className="shrink-0">
          <motion.button
            type="button"
            disabled={disabled}
            // Never take focus from the text box: on a phone that would drop the keyboard.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onPick(starter.phrase);
              play("tap", 0.3);
            }}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-edge bg-surface pl-1.5 pr-3.5 text-[15px] font-bold text-ink"
            {...press}
          >
            <FinishSwatch finish={starter.finish} className="size-7" />
            {starter.label}
          </motion.button>
        </li>
      ))}
    </ul>
  );
}
