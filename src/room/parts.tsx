"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { CheckIcon } from "@/components/icons";
import { DUR, EASE, SPRING } from "@/lib/animations";
import { Avatar } from "./avatar";
import { usePlayers, type RoomPlayer } from "./context";

/**
 * Building blocks every game can use. They draw with the base tokens
 * (`surface`, `edge`, `ink`, `win`, ...), which each game's theme remaps, so
 * the same component takes on SlopLash, MatchSlop, or QuizSlop colors.
 */

export interface DoneTrackerProps {
  /** Who has locked in. */
  doneIds: readonly string[];
  /** "stage": big avatar tiles for the TV. "phone": a small line of who's left. Default "stage". */
  variant?: "stage" | "phone";
  /** Stage tile size: "couch" is the bigger hero row (8.5rem tiles, two-line names). */
  size?: StageTileSize;
  /** e.g. "Answers in". */
  label?: string;
  /** Shown beside the count, e.g. a timer. */
  aside?: ReactNode;
  /** Who the room is waiting on. Defaults to every player. */
  playerIds?: readonly string[];
}

/**
 * Who is in and who the room is still waiting on, for submission phases. On
 * the stage each player is a tile that pops and draws a check when they lock
 * in, and the row shimmers once when the last one does. On a phone it is one
 * quiet line: the count and the faces still to come. Mounting never animates.
 */
export function DoneTracker({
  doneIds,
  variant = "stage",
  size = "regular",
  label,
  aside,
  playerIds,
}: DoneTrackerProps) {
  const { players } = usePlayers();
  const expected = playerIds ? players.filter((player) => playerIds.includes(player.id)) : players;
  const done = new Set(doneIds);
  const count = expected.filter((player) => done.has(player.id)).length;
  const allIn = expected.length > 0 && count === expected.length;
  const pending = expected.filter((player) => !done.has(player.id));
  const status = allIn
    ? "Everyone is in."
    : `Waiting on ${pending.map((player) => player.name).join(", ")}.`;

  if (variant === "phone") {
    return (
      <PhoneTracker
        label={label}
        aside={aside}
        count={count}
        total={expected.length}
        allIn={allIn}
        pending={pending}
        status={status}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {/* Centred over the tiles; an aside pushes the count to the right. */}
      <div className={`flex items-center gap-4 ${aside ? "" : "justify-center"}`}>
        {aside && <div className="min-w-0 flex-1">{aside}</div>}
        <p className={`font-display font-bold ${STAGE_SIZE[size].count}`}>
          {label && <>{label} </>}
          {allIn ? (
            <span className="text-win">All in</span>
          ) : (
            <span className="font-mono tabular-nums text-ink-dim">
              {count}/{expected.length}
            </span>
          )}
        </p>
      </div>
      <div className="relative">
        <ul className={`flex flex-wrap justify-center gap-y-4 ${STAGE_SIZE[size].row}`}>
          {expected.map((player) => (
            <StageTile key={player.id} player={player} done={done.has(player.id)} size={size} />
          ))}
        </ul>
        <AllInShimmer allIn={allIn} />
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

const TILE: Variants = {
  pending: { scale: 1, opacity: 0.42 },
  done: {
    scale: [1, 1.12, 1],
    opacity: 1,
    transition: { duration: 0.36, times: [0, 0.4, 1], ease: EASE.out },
  },
};

type StageTileSize = "regular" | "couch";

const STAGE_SIZE: Record<
  StageTileSize,
  {
    count: string;
    row: string;
    tile: string;
    avatar: string;
    badge: string;
    name: string;
    waiting: string;
  }
> = {
  regular: {
    count: "text-[max(18px,1.125rem)] leading-tight text-ink",
    row: "gap-x-5",
    tile: "w-[7rem] gap-1.5",
    avatar: "3.5rem",
    badge: "size-[1.6rem]",
    // Never under 18px, even on a 720p TV.
    name: "max-w-full truncate text-[max(18px,0.875rem)] leading-snug",
    // Waiting names sit between ink and ink-dim, so they stay readable (4.5:1
    // and up) on a light theme too.
    waiting: "text-[color-mix(in_srgb,var(--ink-dim)_60%,var(--ink))]",
  },
  couch: {
    count: "text-2xl",
    row: "gap-x-3",
    tile: "w-[8.5rem] min-w-0 gap-[0.5rem]",
    avatar: "4.5rem",
    badge: "size-[2rem]",
    name: "line-clamp-2 w-full text-center text-xl leading-tight break-words",
    waiting: "text-ink-dim",
  },
};

function StageTile({
  player,
  done,
  size,
}: {
  player: RoomPlayer;
  done: boolean;
  size: StageTileSize;
}) {
  const look = STAGE_SIZE[size];
  return (
    <li className={`flex flex-col items-center ${look.tile}`}>
      <motion.div
        className="relative"
        variants={TILE}
        initial={false}
        animate={done ? "done" : "pending"}
      >
        <Avatar name={player.name} modelId={player.modelId} size={look.avatar} />
        <motion.span
          aria-hidden="true"
          className={`absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-win text-accent-ink shadow-[0_0_0_0.15rem_var(--bg)] ${look.badge}`}
          initial={false}
          animate={done ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={SPRING.pop}
        >
          <DrawnCheck drawn={done} />
        </motion.span>
      </motion.div>
      <span
        className={`font-semibold transition-colors ${look.name} ${done ? "text-ink" : look.waiting}`}
      >
        {player.name}
        <span className="sr-only">{done ? ", in" : ", waiting"}</span>
      </span>
    </li>
  );
}

/**
 * A check that draws its stroke. With `drawn` it draws in and out as that
 * changes (never on mount); without it, it draws once on mount.
 */
export function DrawnCheck({
  drawn,
  className = "size-[68%]",
  delay = 0.1,
}: {
  drawn?: boolean;
  className?: string;
  delay?: number;
}) {
  const shown = drawn !== false;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        initial={drawn === undefined ? { pathLength: 0 } : false}
        animate={{ pathLength: shown ? 1 : 0 }}
        transition={{ duration: 0.28, delay: shown ? delay : 0, ease: EASE.out }}
      />
    </svg>
  );
}

/** One sweep of light across the row when the last player locks in (never on mount). */
function AllInShimmer({ allIn }: { allIn: boolean }) {
  const [sweep, setSweep] = useState({ allIn, count: 0 });
  // Adjusting state during render: count each time the room becomes all in.
  if (sweep.allIn !== allIn) setSweep({ allIn, count: sweep.count + (allIn ? 1 : 0) });
  if (!allIn || sweep.count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -inset-2 overflow-hidden rounded-2xl"
    >
      <motion.span
        key={sweep.count}
        className="absolute inset-y-0 left-0 w-1/2"
        style={{
          background:
            "linear-gradient(100deg, transparent 10%, color-mix(in srgb, var(--gold) 30%, transparent) 50%, transparent 90%)",
        }}
        initial={{ x: "-100%", opacity: 1 }}
        animate={{ x: "200%", opacity: [1, 1, 0] }}
        transition={{ duration: 0.9, ease: EASE.inOut, delay: 0.25 }}
      />
    </span>
  );
}

/** Pending faces shown on a phone before the rest collapse into "+N". */
const PHONE_FACES = 5;

function PhoneTracker({
  label,
  aside,
  count,
  total,
  allIn,
  pending,
  status,
}: {
  label?: string;
  aside?: ReactNode;
  count: number;
  total: number;
  allIn: boolean;
  pending: RoomPlayer[];
  status: string;
}) {
  const faces = pending.slice(0, PHONE_FACES);
  const more = pending.length - faces.length;
  return (
    <div className="flex min-h-7 items-center gap-3">
      {aside && <div className="min-w-0 flex-1">{aside}</div>}
      <div className="flex items-center gap-2">
        {label && <span className="text-xs font-semibold text-ink-dim">{label}</span>}
        <AnimatePresence initial={false} mode="popLayout">
          {allIn ? (
            <motion.span
              key="all-in"
              className="inline-flex items-center gap-1 rounded-full border border-win/40 bg-win-soft px-2.5 py-0.5 text-xs font-bold text-win"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING.snappy}
            >
              <CheckIcon size={12} />
              All in
            </motion.span>
          ) : (
            <motion.span
              key="waiting"
              className="flex items-center gap-2"
              exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            >
              <span className="font-mono text-xs tabular-nums text-ink-dim">
                {count}/{total}
              </span>
              <ul className="flex -space-x-1.5" aria-hidden="true">
                <AnimatePresence initial={false}>
                  {faces.map((player) => (
                    <motion.li
                      key={player.id}
                      className="rounded-full shadow-[0_0_0_2px_var(--bg)]"
                      exit={{ scale: 0, opacity: 0, transition: { duration: DUR.fast } }}
                    >
                      <Avatar name={player.name} modelId={player.modelId} size="1.5rem" />
                    </motion.li>
                  ))}
                </AnimatePresence>
                {more > 0 && (
                  <li className="grid size-6 place-items-center rounded-full bg-raised text-[10px] font-bold text-ink-dim shadow-[0_0_0_2px_var(--bg)]">
                    +{more}
                  </li>
                )}
              </ul>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
