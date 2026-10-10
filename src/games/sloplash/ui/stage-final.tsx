"use client";

import { useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ACCENT, DUR, EASE, SPRING, TRAVEL, deckCard, pop } from "@/lib/animations";
import { Avatar } from "@/room/avatar";
import { useModeView, usePlayers, useRoom, type RoomPlayer } from "@/room/context";
import { CountUp, Stamp, useMoment, useReducedAfterMount } from "@/room/moment";
import { computeAwards, displayAwards, type Award } from "../awards";
import { CrownDrop } from "./crown-drop";
import { finalCues, type FinalBeat } from "./cues";
import type { Ranked } from "@/games/core/player-rankings";
import { podiumOf, winnerLine, type Podium } from "./data";
import { RecapMatchups } from "./recap";
import { TaglineBubble } from "./stage-results";
import { formatPoints } from "@/lib/format";

/** The recap page also renders this on phones, where the podium never docks. */
const WIDE = "(min-width: 56rem)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export const colBeat = (rank: number) => `col${Math.min(3, rank)}` as FinalBeat;

const BLOCK: Record<number, { height: string; number: string }> = {
  1: { height: "h-[8rem]", number: "text-6xl" },
  2: { height: "h-[5.5rem]", number: "text-5xl" },
  3: { height: "h-[3.5rem]", number: "text-4xl" },
};
const AVATAR = ["6rem", "4.5rem", "4rem"];
const AVATAR_NARROW = ["4rem", "3rem", "3rem"];

const headlineSwap: Variants = {
  hidden: { y: "100%", opacity: 0 },
  visible: { y: 0, opacity: 1, transition: SPRING.gentle },
  exit: { y: "-60%", opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } },
};

/** The end of the game: the podium, the awards reel, and (in the recap) every matchup. */
export function StageFinal() {
  const { live, view } = useRoom();
  if (!live) {
    return (
      <div className="flex flex-col">
        <FinalShow />
        <RecapMatchups usage={view.usage} />
      </div>
    );
  }
  return <FinalShow />;
}

function FinalShow() {
  const { view, live } = useRoom();
  const { players } = view;
  const mode = useModeView("SLOPLASH");
  const reduced = useReducedAfterMount();
  const [withTagline] = useState(() => mode.tagline !== null);
  const podium = useMemo(() => podiumOf(players), [players]);
  const awards = useMemo(
    () => displayAwards(computeAwards(mode.rounds, players)),
    [mode.rounds, players],
  );
  const field = podium.ranked.slice(3);
  const firstRef = useRef<HTMLDivElement>(null);

  const cues = useMemo(
    () =>
      finalCues({
        ranks: [...new Set(podium.positions.map((entry) => Math.min(3, entry.rank)))],
        soleAiWinner: podium.soleAiWinner,
        hasTagline: withTagline,
        awards: awards.map((award) => award.kind),
        firstOrigin: firstRef,
      }),
    [podium, withTagline, awards],
  );
  const moment = useMoment(cues.cues);
  const at = (name: FinalBeat) => moment >= (cues.beat[name] ?? Number.POSITIVE_INFINITY);

  const hasAwards = awards.length > 0;
  const hasField = field.length > 0;
  const wide = useWide();
  const docked = hasAwards && at("page2");
  const shrink = docked && wide;
  const podiumRem = wide ? (withTagline ? 21 : 23) : 18.5;
  const dockScale = dockScaleFor(podiumRem, hasField);
  const reelDone = hasAwards && at("row");
  const reelIndex = awards.reduce((last, _, i) => (at(`award${i}`) ? i : last), -1);
  const showTagline = withTagline && at("tagline") && !at("page2");
  const showField = hasField && (hasAwards ? reelDone : at("page2"));
  const headline = at("col1") ? winnerLine(podium) : null;
  // The space under the podium is reserved from the first frame and only
  // changes height at the dock, on the podium's own spring, so the headline
  // never jumps when the tagline, the reel or the field arrives.
  const slotRem = wide ? lowerSlotRem({ withTagline, hasAwards, hasField, docked }) : null;

  return (
    <div
      className={`@container flex min-h-0 flex-1 flex-col items-center justify-center px-[3rem] py-[1rem] @max-4xl:px-4 ${
        withTagline || hasAwards ? "gap-[1rem]" : "gap-[1.5rem]"
      } ${live ? "" : "min-h-[45rem]"}`}
    >
      <div className="flex h-[4.5rem] w-full shrink-0 items-center justify-center overflow-hidden @max-4xl:h-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={headline ?? "suspense"}
            className={`text-center font-display whitespace-nowrap @max-4xl:whitespace-normal ${headlineClass(headline, podium.soleAiWinner)}`}
            variants={headlineSwap}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {headline ?? "And the funniest is…"}
          </motion.h1>
        </AnimatePresence>
      </div>

      <motion.div
        className="w-full shrink-0"
        initial={false}
        animate={{ height: `${shrink ? podiumRem * dockScale : podiumRem}rem` }}
        transition={SPRING.gentle}
      >
        <motion.div
          style={{ height: `${podiumRem}rem`, transformOrigin: "top center" }}
          initial={false}
          animate={{ scale: shrink ? dockScale : 1 }}
          transition={SPRING.gentle}
        >
          <PodiumColumns
            podium={podium}
            at={at}
            reduced={reduced}
            wide={wide}
            firstRef={firstRef}
          />
        </motion.div>
      </motion.div>

      {(withTagline || hasAwards || hasField) && (
        <motion.div
          className="relative flex w-full shrink-0 flex-col items-center gap-[0.75rem]"
          initial={false}
          animate={slotRem === null ? { height: "auto" } : { height: `${slotRem}rem` }}
          transition={SPRING.gentle}
        >
          <AnimatePresence initial={false}>
            {showTagline && mode.tagline && (
              <motion.div
                key="tagline"
                className={`flex w-full max-w-[48rem] items-start ${slotRem === null ? "" : "absolute top-0"}`}
                initial={reduced ? false : { opacity: 0, y: TRAVEL.enter }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: DUR.fast } }}
                transition={SPRING.smooth}
              >
                <TaglineBubble
                  playerId={mode.tagline.playerId}
                  text={mode.tagline.text}
                  tail="up"
                  className="w-full"
                />
              </motion.div>
            )}
          </AnimatePresence>
          {docked && !reelDone && (
            // Grows from 0 on the slot's own spring, so it never pokes out of the
            // slot (or the scene) while the podium docks.
            <motion.div
              className="relative w-full max-w-[56rem] shrink-0"
              initial={{ height: 0 }}
              animate={{ height: `${REEL_REM}rem` }}
              transition={SPRING.gentle}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {reelIndex >= 0 && (
                  <ReelCard
                    key={awards[reelIndex]!.kind}
                    award={awards[reelIndex]!}
                    reduced={reduced}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}
          {reelDone && <AwardsRow awards={awards} reduced={reduced} />}
          {showField && <FieldChips field={field} />}
        </motion.div>
      )}
    </div>
  );
}

/** Content height left by the host's "Play again" bar (36.5rem less the padding). */
const FINAL_BUDGET_REM = 34.5;
/** Headline row plus the two gaps around the podium. */
const FINAL_CHROME_REM = 4.5 + 2;
/** The reel card; then the awards row (and the field under it) in the same space. */
const REEL_REM = 9;
const FIELD_REM = 3.25;

/** How far the podium docks: as little as the page allows, between 0.6 and 0.75. */
export function dockScaleFor(podiumRem: number, hasField: boolean): number {
  const room = FINAL_BUDGET_REM - FINAL_CHROME_REM - REEL_REM - (hasField ? FIELD_REM : 0);
  return Math.max(0.6, Math.min(0.75, room / podiumRem));
}

/** The reserved space under the podium on a wide stage, in rem. */
export function lowerSlotRem(state: {
  withTagline: boolean;
  hasAwards: boolean;
  hasField: boolean;
  docked: boolean;
}): number {
  const tagline = state.withTagline ? 7 : 0;
  if (state.hasAwards) {
    return state.docked ? REEL_REM + (state.hasField ? FIELD_REM : 0) : tagline;
  }
  return Math.max(tagline, state.hasField ? FIELD_REM : 0);
}

function headlineClass(headline: string | null, machine: boolean) {
  if (headline === null) return "text-4xl text-ink-dim @4xl:text-5xl";
  const size =
    headline.length <= 26
      ? "text-5xl @4xl:text-6xl"
      : headline.length <= 36
        ? "text-4xl @4xl:text-5xl"
        : "text-3xl @4xl:text-4xl";
  return `font-black ${size} ${machine ? "text-punch" : "text-gold-ink"}`;
}

/** Second, first, third: the tall middle block is the drumroll. */
function PodiumColumns({
  podium,
  at,
  reduced,
  wide,
  firstRef,
}: {
  podium: Podium;
  at: (name: FinalBeat) => boolean;
  reduced: boolean;
  wide: boolean;
  firstRef: RefObject<HTMLDivElement | null>;
}) {
  const [first, second, third] = podium.positions;
  const columns = [
    second && { entry: second, position: 2 },
    first && { entry: first, position: 1 },
    third && { entry: third, position: 3 },
  ].filter((column): column is { entry: Ranked<RoomPlayer>; position: number } => !!column);

  return (
    <div
      className={`mx-auto grid h-full w-fit items-end gap-[2rem] ${
        columns.length === 3
          ? "grid-cols-[repeat(3,minmax(0,20rem))]"
          : columns.length === 2
            ? "grid-cols-[repeat(2,minmax(0,20rem))]"
            : "grid-cols-[minmax(0,20rem)]"
      }`}
    >
      {columns.map(({ entry, position }) => {
        const { player, rank } = entry;
        const shown = at(colBeat(rank));
        const block = BLOCK[Math.min(3, rank)]!;
        const isFirst = position === 1;
        const crown = rank === 1 && !podium.soleAiWinner && at("crown");
        return (
          <div
            key={player.id}
            ref={isFirst ? firstRef : undefined}
            className="relative flex min-w-0 flex-col items-center justify-end gap-[0.5rem]"
          >
            <motion.div
              className="relative"
              initial={false}
              animate={
                shown
                  ? { opacity: 1, y: 0, scale: 1 }
                  : isFirst && !reduced
                    ? { opacity: 0, y: -TRAVEL.stage, scale: 1 }
                    : { opacity: 0, y: 0, scale: 0.85 }
              }
              transition={isFirst ? SPRING.slam : SPRING.pop}
            >
              <Avatar
                name={player.name}
                modelId={player.modelId}
                size={(wide ? AVATAR : AVATAR_NARROW)[position - 1]!}
              />
              <CrownDrop
                show={crown}
                reduced={reduced}
                className="absolute -top-[2.4rem] left-1/2 -translate-x-1/2"
                iconClassName="size-[4rem]"
              />
            </motion.div>
            <motion.div
              className="flex w-full flex-col items-center"
              initial={false}
              animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: TRAVEL.enter }}
              transition={SPRING.smooth}
            >
              <p
                className={`line-clamp-2 w-full text-center leading-tight font-bold text-balance break-words text-ink ${
                  isFirst && player.name.length <= 14
                    ? "text-xl @4xl:text-4xl"
                    : "text-lg @4xl:text-3xl"
                }`}
              >
                {player.name}
              </p>
              <p
                className={`font-mono leading-tight ${
                  isFirst
                    ? "text-2xl text-gold-ink @4xl:text-4xl"
                    : "text-xl text-ink @4xl:text-3xl"
                }`}
              >
                {shown ? (
                  <CountUp value={player.score} from={0} duration={0.9} format={formatPoints} />
                ) : (
                  "0"
                )}
              </p>
            </motion.div>
            <motion.div
              className={`relative grid w-full place-items-center rounded-t-2xl ${block.height} ${
                rank === 1 ? "bg-gold text-accent-ink" : "border border-edge bg-raised text-ink-dim"
              }`}
              style={{ transformOrigin: "bottom center" }}
              initial={false}
              animate={
                shown
                  ? { scaleY: 1, opacity: 1 }
                  : reduced
                    ? { scaleY: 1, opacity: 0 }
                    : { scaleY: 0, opacity: 1 }
              }
              transition={reduced ? { duration: DUR.base } : SPRING.smooth}
            >
              <motion.span
                className={`font-display leading-none font-black ${block.number}`}
                initial={false}
                animate={{ opacity: isFirst && podium.soleAiWinner && at("stamp") ? 0 : 1 }}
                transition={{ duration: DUR.fast }}
              >
                {Math.min(3, rank)}
              </motion.span>
              {isFirst && podium.soleAiWinner && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <Stamp
                    tone="punch"
                    size={wide ? "xl" : "sm"}
                    tilt={ACCENT.sloplash.stampTilt}
                    show={at("stamp")}
                    className="rounded-[0.2em] bg-canvas/90"
                  >
                    SLOPPED
                  </Stamp>
                </div>
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function ReelCard({ award, reduced }: { award: Award; reduced: boolean }) {
  const { byId } = usePlayers();
  const player = byId(award.playerId);
  return (
    <motion.div
      layoutId={reduced ? undefined : `award:${award.kind}`}
      className={`absolute inset-0 flex items-center gap-[2rem] rounded-3xl bg-raised p-[1.25rem] ${
        award.kind === "mvp" ? "ring-4 ring-gold" : ""
      }`}
      variants={deckCard}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ layout: SPRING.smooth }}
    >
      <span className="shrink-0 text-7xl leading-none" aria-hidden="true">
        {award.icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <p className="font-display text-5xl leading-tight font-black whitespace-nowrap text-ink">
          {award.title}
        </p>
        <p className="text-2xl text-ink-dim">{award.description}</p>
      </div>
      {player && (
        <div className="ml-auto flex min-w-0 items-center gap-[1rem]">
          <Avatar name={player.name} modelId={player.modelId} size="4rem" />
          <span className="min-w-0 truncate text-4xl font-bold text-ink">{player.name}</span>
        </div>
      )}
    </motion.div>
  );
}

const ROW_COLS = [
  "",
  "grid-cols-[repeat(1,minmax(0,13.5rem))]",
  "grid-cols-[repeat(2,minmax(0,13.5rem))]",
  "grid-cols-[repeat(3,minmax(0,13.5rem))]",
  "grid-cols-[repeat(4,minmax(0,13.5rem))]",
  "grid-cols-[repeat(5,minmax(0,13.5rem))]",
];

export function AwardsRow({ awards, reduced }: { awards: readonly Award[]; reduced: boolean }) {
  const { byId } = usePlayers();
  return (
    <div
      className={`grid shrink-0 justify-center gap-[1rem] ${ROW_COLS[Math.min(5, awards.length)]} @max-4xl:w-full @max-4xl:grid-cols-1`}
    >
      {awards.map((award) => {
        const player = byId(award.playerId);
        return (
          <motion.div
            key={award.kind}
            layoutId={reduced ? undefined : `award:${award.kind}`}
            className={`flex min-h-[7rem] min-w-0 flex-col justify-between gap-1 rounded-2xl bg-raised p-3 ${
              award.kind === "mvp" ? "ring-2 ring-gold" : ""
            }`}
            variants={pop}
            initial="hidden"
            animate="visible"
            transition={{ layout: SPRING.smooth }}
          >
            <p className="flex items-center gap-2 leading-tight">
              <span className="text-2xl leading-none" aria-hidden="true">
                {award.icon}
              </span>
              <span className="truncate text-xl font-bold text-ink">{award.title}</span>
            </p>
            {player && (
              <p className="flex min-w-0 items-center gap-2">
                <Avatar name={player.name} modelId={player.modelId} size="2rem" />
                <span
                  className={`line-clamp-2 min-w-0 leading-tight break-words text-ink ${
                    player.name.length > 12 ? "text-lg" : "text-xl"
                  }`}
                >
                  {player.name}
                </span>
              </p>
            )}
            <p className="truncate text-lg leading-tight text-ink-dim">{award.description}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

const chipRise: Variants = {
  hidden: { opacity: 0, y: TRAVEL.stage },
  visible: { opacity: 1, y: 0, transition: SPRING.smooth },
};

/** A long name on a small chip reads better as its first word than cut mid-word. */
export function shortName(name: string): string {
  if (name.length <= 12) return name;
  const first = name.split(/\s+/u)[0] ?? name;
  return first.length >= 3 ? first : name;
}

/** Fourth place and below, as small chips. */
function FieldChips({ field }: { field: Ranked<RoomPlayer>[] }) {
  return (
    <motion.ul
      className="flex max-w-[74rem] shrink-0 flex-wrap justify-center gap-[0.75rem]"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
    >
      {field.map(({ player, rank }) => (
        <motion.li
          key={player.id}
          variants={chipRise}
          className="flex items-center gap-[0.5rem] rounded-full border border-edge bg-surface px-3 py-1"
        >
          <span className="font-mono text-xl text-ink-dim">{rank}</span>
          <Avatar name={player.name} modelId={player.modelId} size="2rem" />
          <span className="max-w-[12rem] truncate text-xl text-ink" title={player.name}>
            {shortName(player.name)}
          </span>
          <span className="font-mono text-xl text-ink tabular-nums">
            {formatPoints(player.score)}
          </span>
        </motion.li>
      ))}
    </motion.ul>
  );
}
