"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { originOf } from "@/lib/ambient-events";
import { usePhaseCountdown, usePhaseDrain } from "@/room/timer";
import { SPRING, collapse, enter, listParent, pop, wipe } from "@/lib/animations";
import { Avatar } from "@/room/avatar";
import { useModeView, usePlayers, useRoom } from "@/room/context";
import { CountUp, TypeOn, useMoment, useReducedAfterMount } from "@/room/moment";
import { roundMultiplier } from "../scoring";
import { CrownDrop } from "./crown-drop";
import { resultsCues } from "./cues";
import { plus, roundStandings } from "./data";
import { formatPoints } from "@/lib/format";

/**
 * ROUND_RESULTS on the TV: the standings as an odometer. Rows enter in the
 * old order with the old scores, the round's gains pop, the scores count up,
 * the rows re-sort, and the leader is crowned. The AI leader's tagline sits
 * beside them when it has one.
 */
export function StageRoundResults() {
  const { view } = useRoom();
  const { room } = view;
  const { players } = usePlayers();
  const mode = useModeView("SLOPLASH");
  const reduced = useReducedAfterMount();
  // Fixed at mount: the tagline row arrives in the same transaction as the phase.
  const [withTagline] = useState(() => mode.tagline !== null);

  const { gainOf, before, after } = roundStandings(players, mode.round);
  const leader = after[0]?.player;

  const aiLeader = leader?.type === "AI";
  const cues = useMemo(
    () =>
      resultsCues({
        hasTagline: withTagline,
        aiLeader,
        // Looked up when the beat fires, never during render.
        leaderOrigin: () => originOf(document.querySelector("[data-sl-leader]")),
      }),
    [withTagline, aiLeader],
  );
  const moment = useMoment(cues.cues);
  const at = (name: keyof typeof cues.beat) => moment >= cues.beat[name];
  const sorted = at("resort") ? after : before;
  const tall = players.length <= 6;
  const beforeIndex = new Map(before.map((entry, index) => [entry.player.id, index]));

  const standings = (
    <motion.ol
      data-ambient-calm
      className={`flex w-full flex-col gap-[0.5rem] self-center ${withTagline ? "" : "max-w-[56rem]"}`}
      variants={listParent(players.length)}
      initial="hidden"
      animate="visible"
    >
      {sorted.map(({ player, rank }, index) => {
        const gain = gainOf(player);
        const crowned = at("crown") && rank === 1;
        // A climber passes over the rows it overtakes, so the key move stays in view.
        const climbing = at("resort") && index < (beforeIndex.get(player.id) ?? index);
        return (
          <motion.li
            key={player.id}
            data-sl-leader={index === 0 ? "" : undefined}
            // Layout only once the rows have entered, so it never fights the entry stagger.
            layout={at("count")}
            variants={enter}
            transition={{ layout: reduced ? { duration: 0 } : SPRING.gentle }}
            className={`relative flex items-center gap-[1rem] rounded-2xl ${climbing ? "z-10" : "z-0"} border border-edge bg-surface px-[1.25rem] ${
              tall ? "h-[4.25rem]" : "h-[3.25rem]"
            } ${crowned ? "ring-2 ring-gold" : ""}`}
          >
            <span className="w-[2.5rem] shrink-0 font-mono text-2xl text-ink-dim tabular-nums">
              {rank}
            </span>
            <span className="relative shrink-0">
              <Avatar name={player.name} modelId={player.modelId} size="2.5rem" />
              <CrownDrop
                show={crowned}
                reduced={reduced}
                className="absolute -top-[1.1rem] -left-[0.9rem]"
                iconClassName="size-[1.75rem] -rotate-12"
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-2xl font-bold text-ink @4xl:text-3xl">
              {player.name}
            </span>
            {/* Hidden when it would only repeat the total (round 1, or a first score). */}
            {gain > 0 && gain !== player.score && (
              <motion.span
                className="shrink-0 font-mono text-2xl text-gold-ink"
                variants={pop}
                initial="hidden"
                animate={at("gains") ? "visible" : "hidden"}
              >
                {plus(gain)}
              </motion.span>
            )}
            <span className="w-[11rem] shrink-0 text-right font-mono text-3xl font-black text-ink tabular-nums @4xl:text-4xl">
              {at("count") ? (
                <CountUp
                  value={player.score}
                  from={player.score - gain}
                  duration={0.9}
                  format={formatPoints}
                />
              ) : (
                formatPoints(player.score - gain)
              )}
            </span>
          </motion.li>
        );
      })}
    </motion.ol>
  );

  return (
    <div
      className={`@container grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-y-[1rem] px-[3rem] py-[1.25rem] @max-4xl:px-4 ${
        withTagline
          ? "grid-cols-[minmax(0,50rem)_minmax(0,22rem)] justify-center gap-x-[2rem] @max-4xl:grid-cols-1"
          : "justify-items-center"
      }`}
    >
      {standings}
      {withTagline && (
        <div className="self-center">
          <AnimatePresence>
            {mode.tagline && at("bubble") && (
              <TaglineBubble
                key="tagline"
                playerId={mode.tagline.playerId}
                text={mode.tagline.text}
              />
            )}
          </AnimatePresence>
        </div>
      )}
      <motion.div
        data-ambient-calm
        className="col-span-full flex flex-col items-center gap-[0.75rem]"
        variants={wipe}
        initial="hidden"
        animate={at("footer") ? "visible" : "hidden"}
      >
        <p className="text-2xl text-ink-dim">{nextLine(room.round, room.totalRounds)}</p>
        <DrainBar />
      </motion.div>
    </div>
  );
}

function nextLine(round: number, total: number) {
  if (round >= total) return "Next: Final results";
  const next = round + 1;
  const label = next === total ? "Final round" : `Round ${next}`;
  return `Next: ${label} · ×${formatPoints(roundMultiplier(next))} points`;
}

function DrainBar() {
  const countdown = usePhaseCountdown();
  const bar = usePhaseDrain<HTMLDivElement>("bar");
  if (countdown.untimed) return null;
  return (
    <div aria-hidden="true" className="h-[0.25rem] w-[24rem] overflow-hidden rounded-full bg-edge">
      <div
        ref={bar}
        className="h-full w-full origin-left rounded-full bg-ink-dim"
        style={{ transform: `scaleX(${countdown.pct / 100})` }}
      />
    </div>
  );
}

/** Three dots while the AI is still typing. */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[0.4rem] py-[0.5rem]" aria-label="Typing">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-[0.75rem] rounded-full bg-ink-dim animate-soft-pulse"
          style={{ animationDelay: `${index * 0.25}s`, animationDuration: "1.2s" }}
        />
      ))}
    </span>
  );
}

/**
 * The AI leader's line: its face as the speaker, typing dots until the text
 * arrives, then the line typed out. It folds away if the row disappears.
 */
export function TaglineBubble({
  playerId,
  text,
  tail = "left",
  className = "",
}: {
  playerId: string;
  text: string | null;
  tail?: "left" | "up";
  className?: string;
}) {
  const { byId } = usePlayers();
  const speaker = byId(playerId);
  return (
    <motion.div
      className={`overflow-hidden ${className}`}
      variants={collapse}
      initial={false}
      exit="exit"
    >
      <motion.div
        className={`relative flex items-start gap-[1rem] rounded-3xl bg-raised p-6 ${tail === "up" ? "mt-[0.75rem]" : "ml-[0.75rem]"}`}
        variants={pop}
        initial="hidden"
        animate="visible"
      >
        <span
          aria-hidden="true"
          className={`absolute size-[1.25rem] rotate-45 bg-raised ${
            tail === "up" ? "-top-[0.5rem] left-[3rem]" : "top-[1.75rem] -left-[0.5rem]"
          }`}
        />
        {speaker && (
          <Avatar
            name={speaker.name}
            modelId={speaker.modelId}
            size="2.5rem"
            className="relative"
          />
        )}
        <div className="relative min-w-0 flex-1 text-2xl leading-snug text-ink">
          {text === null ? <TypingDots /> : <TypeOn text={text} cps={35} caret={false} />}
        </div>
      </motion.div>
    </motion.div>
  );
}
