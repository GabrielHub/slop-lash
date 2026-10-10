"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRoom, useServerNow } from "@/room/context";
import type { Champion } from "../../sheet";
import { ChampionCard, PLATE } from "./champion-card";
import { forgeProgress, holdProgress } from "./forging-progress";
import { Kicker, Screen, ambientBuzz, useSfx, type FighterView } from "./shared";
import { ChampionSilhouette } from "./silhouette";

// The Foundry wait and its payoff. The streamed parts go to the stage only;
// the owner's view carries just their count and a soft target (`forgeParts`),
// so the bar follows the real forge (forging-progress.ts) under a lively loop
// of lines, then the card lands when the sheet is READY.

const LINES = [
  "Inflating the torso",
  "Sprouting legs, maybe",
  "Counting the legs again",
  "Picking a name it will hate",
  "Balancing the stats. No cheating.",
  "Teaching it one dirty move",
  "Writing its trash talk",
  "Gluing the eyes on last",
];
const LINE_MS = 2_200;

function FoundryBlob({ old }: { old: Champion | null }) {
  return (
    <div className="relative mx-auto grid size-44 place-items-center">
      <motion.div
        aria-hidden="true"
        className="absolute inset-4 rounded-[45%] bg-punch/25"
        animate={{ scale: [1, 1.12, 0.94, 1.06, 1], rotate: [0, 6, -4, 3, 0], borderRadius: ["45%", "38%", "50%", "42%", "45%"] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute inset-12 rounded-full bg-punch/60"
        animate={{ scale: [0.9, 1.15, 0.9] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      {old && (
        <motion.div
          className="relative"
          animate={{ y: [0, -6, 0], rotate: [0, -3, 3, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChampionSilhouette champion={old} className="size-24 opacity-70" />
        </motion.div>
      )}
    </div>
  );
}

/** "The Foundry is building your champion": a lively wait. */
export function ForgingScreen({ fighter, upgrade = false }: { fighter: FighterView; upgrade?: boolean }) {
  const now = useServerNow();
  const startedAt = fighter.forge?.startedAt ?? now;
  const parts = fighter.forgeParts;
  // The bar never slides back within one forge (a fallback restreams its parts).
  const [held, setHeld] = useState<{ forge: number | null; value: number }>({ forge: null, value: 0 });
  const next = holdProgress(held, fighter.forge?.startedAt ?? null, forgeProgress(now - startedAt, parts));
  if (next.forge !== held.forge || next.value !== held.value) setHeld(next);
  const percent = Math.round(next.value * 100);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLine((index) => (index + 1) % LINES.length), LINE_MS);
    return () => window.clearInterval(timer);
  }, []);
  const old = upgrade ? fighter.champion : null;
  return (
    <Screen center>
      <div className="flex flex-col items-center gap-2 text-center">
        <Kicker>{upgrade ? "Upgrade in the Foundry" : "The Foundry"}</Kicker>
        <h2 className="font-display text-3xl font-bold text-ink">
          {upgrade ? "Bolting it on" : "Building your champion"}
        </h2>
        <p className="text-base text-ink-dim">Watch it grow on the TV</p>
      </div>
      <FoundryBlob old={old} />
      <div className="flex flex-col items-center gap-3">
        <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-raised">
          <motion.div
            className="h-full rounded-full bg-punch"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        {parts && parts.streamed > 0 && (
          <p className="text-sm font-semibold tabular-nums text-ink-dim">
            {parts.streamed === 1 ? "1 part" : `${parts.streamed} parts`} of about {parts.target}
          </p>
        )}
        <div className="relative h-7 w-full overflow-hidden text-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={line}
              className="absolute inset-x-0 text-lg font-semibold text-ink"
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {LINES[line]}…
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </Screen>
  );
}

/** The payoff buzz and ding, once, when this phone sees its champion land. */
function useLandedCue(key: string) {
  const { live } = useRoom();
  const play = useSfx();
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!live || fired.current === key) return;
    fired.current = key;
    play("confirm");
    ambientBuzz([20, 60, 30]);
  }, [key, live, play]);
}

/** The forged champion's card, with a word on what happens next. */
export function ReadyScreen({
  champion,
  previous,
  kept = false,
  footer,
  landed = true,
}: {
  champion: Champion;
  previous?: Champion | null;
  kept?: boolean;
  footer?: string;
  /** Plays the payoff cue (the champion just arrived on this screen). */
  landed?: boolean;
}) {
  return (
    <Screen>
      {landed && <LandedCue id={`${champion.name}:${previous?.name ?? ""}`} />}
      <div className="flex flex-col items-center gap-1 text-center">
        <Kicker tone={kept ? "dim" : "teal"}>{kept ? "Keeping it as is" : previous ? "Upgraded" : "Forged"}</Kicker>
        <h2 className="font-display text-2xl font-bold text-ink">
          {kept ? `${champion.name} stays the same` : previous ? `${previous.name} got an upgrade` : "Your champion is ready"}
        </h2>
      </div>
      {previous && !kept && (
        <div className="flex items-center justify-center gap-3" aria-label={`${previous.name} became ${champion.name}`}>
          <span className="grid size-20 place-items-center rounded-2xl opacity-70" style={{ background: PLATE }}>
            <ChampionSilhouette champion={previous} className="size-16 grayscale-[40%]" />
          </span>
          <svg viewBox="0 0 24 24" className="size-8 text-punch" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
          <span className="grid size-24 place-items-center rounded-2xl" style={{ background: PLATE }}>
            <ChampionSilhouette champion={champion} className="size-20" />
          </span>
        </div>
      )}
      <ChampionCard champion={champion} />
      {footer && <p className="text-center text-base text-ink-dim">{footer}</p>}
    </Screen>
  );
}

function LandedCue({ id }: { id: string }) {
  useLandedCue(id);
  return null;
}
