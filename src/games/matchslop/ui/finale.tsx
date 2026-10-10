"use client";

import { useState, type Ref } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { CrownIcon } from "@/components/icons";
import { ACCENT, DUR, EASE, SPRING, TRAVEL, enter, fade, pop } from "@/lib/animations";
import { Avatar } from "@/room/avatar";
import { useRoom, type RoomPlayer } from "@/room/context";
import { Stamp, TypeOn } from "@/room/moment";
import { PARTING_CPS } from "./beats";
import { COPY, metaLine, signedPoints, type Ending } from "./copy";
import { DockedStamp, PersonaFace } from "./strip";
import { HER_BUBBLE, OUR_BUBBLE, Tapback, TypingBubble } from "./thread";
import { levelOfTurn, personaName, type MatchslopMode } from "./primitives";
import { rankBy } from "@/games/core/player-rankings";

/** Standings, best first; ties share a rank (1, 2, 2, 4) and sort by name. */
export function rankPlayers(players: readonly RoomPlayer[]) {
  return rankBy(
    players,
    (player) => player.score,
    (left, right) => left.name.localeCompare(right.name),
  );
}

/** A player's verdict from her post-mortem, matched by name (first one wins). */
export function verdictFor(mode: MatchslopMode, name: string): string | null {
  return (
    mode.postMortem?.value?.verdicts.find((entry) => entry.playerName === name)?.verdict ?? null
  );
}

/**
 * The parting text, or her typing while the post-mortem is pending. Types out
 * when the finale is fresh, or when it arrives while this is on screen.
 */
function Parting({ mode, fresh }: { mode: MatchslopMode; fresh: boolean }) {
  const { live } = useRoom();
  const pending = mode.postMortem?.pending ?? false;
  const [pendingAtMount] = useState(pending);
  const parting = mode.postMortem?.value?.parting ?? null;
  const type = live && (fresh || pendingAtMount);
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {pending ? (
        <motion.div key="typing" variants={pop} initial="hidden" animate="visible" exit="exit">
          <TypingBubble size="1rem" />
        </motion.div>
      ) : parting ? (
        <motion.div
          key="parting"
          className={`${HER_BUBBLE} max-w-full text-2xl leading-snug`}
          variants={pop}
          initial={type ? "hidden" : false}
          animate="visible"
        >
          {type ? <TypeOn text={parting} cps={PARTING_CPS} /> : parting}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** The finale's left column: her face with the verdict, her name, her parting text. */
export function FinalHero({
  mode,
  ending,
  stamp,
  grey,
  named,
  parting,
  fresh,
}: {
  mode: MatchslopMode;
  ending: Ending;
  /** "docked": the stamp rode in from the portrait. "slam": it slams now. null: not yet. */
  stamp: "docked" | "slam" | null;
  grey: boolean;
  named: boolean;
  parting: boolean;
  fresh: boolean;
}) {
  const { persona } = mode;
  const line = metaLine(persona.profile);
  return (
    <div className="flex min-w-0 flex-col items-center gap-6 text-center">
      <PersonaFace
        persona={persona}
        className="size-[14rem]"
        radius="2rem"
        monogram="text-[8rem]"
        grey={grey}
      >
        <div className="absolute inset-x-0 -bottom-5 flex justify-center">
          {stamp === "docked" && <DockedStamp ending={ending} size="lg" className="relative" />}
          {stamp === "slam" && (
            <motion.div layoutId="ms-outcome" layoutCrossfade={false} className="relative z-10">
              <Stamp size="lg" tone={ending.tone} tilt={ACCENT.matchslop.stampTilt}>
                {ending.text}
              </Stamp>
            </motion.div>
          )}
        </div>
      </PersonaFace>
      <motion.div
        className="mt-3 w-full min-w-0"
        variants={enter}
        initial={false}
        animate={named ? "visible" : "hidden"}
      >
        <p className="truncate font-display text-5xl font-bold leading-tight text-ink">
          {personaName(persona)}
        </p>
        {line && <p className="truncate text-xl text-ink-dim">{line}</p>}
      </motion.div>
      <div className="flex w-full justify-start text-left">
        {parting && <Parting mode={mode} fresh={fresh} />}
      </div>
    </div>
  );
}

const ROW: Variants = {
  hidden: { opacity: 0, y: TRAVEL.stage },
  visible: { opacity: 1, y: 0, transition: SPRING.gentle },
};

/** The standings, one column, best first; the top row is crowned. */
export function Standings({
  mode,
  players,
  risen,
  crowned,
  verdicts,
  topRef,
  stacked = false,
}: {
  mode: MatchslopMode;
  players: readonly RoomPlayer[];
  /** Whether the row at standings index `index` has risen. */
  risen: (index: number) => boolean;
  crowned: boolean;
  /** Verdicts are fading in. */
  verdicts: boolean;
  /** The top row, where the final confetti starts. */
  topRef?: Ref<HTMLLIElement>;
  /** The recap page: each verdict sits under its name, so a phone never scrolls sideways. */
  stacked?: boolean;
}) {
  const ranked = rankPlayers(players);
  // 7–8 rows step the verdict down to text-lg and trim the padding, so eight
  // rows fit with the host's "Play again" dock below.
  const many = ranked.length >= 7;
  const pad = many ? "py-1" : "py-1.5";
  const verdictText = stacked
    ? "text-base"
    : many
      ? "text-lg max-sm:text-base"
      : "text-xl max-sm:text-base";
  return (
    <ol className="flex min-w-0 flex-col gap-[0.375rem]" aria-label="Standings">
      {ranked.map(({ player, rank }, index) => {
        const top = rank === 1;
        const verdict = verdictFor(mode, player.name);
        const verdictLine = (
          <span
            className={`line-clamp-2 min-w-0 flex-1 italic leading-snug text-ink-dim ${verdictText}`}
          >
            <AnimatePresence initial={false}>
              {verdicts && verdict && (
                <motion.span
                  key="verdict"
                  className="block"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: DUR.slow, ease: EASE.out, delay: index * 0.12 },
                  }}
                >
                  {verdict}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        );
        // The winner's name is never cut: it may take two lines.
        const name = (
          <span
            className={`shrink-0 text-2xl font-semibold leading-tight text-ink ${
              stacked
                ? "block truncate"
                : top
                  ? "line-clamp-2 w-[11rem] break-words max-sm:w-full"
                  : "w-[11rem] truncate max-sm:w-full"
            }`}
          >
            {player.name}
          </span>
        );
        return (
          <motion.li
            key={player.id}
            ref={index === 0 ? topRef : undefined}
            className={`flex items-center gap-4 border-b border-edge px-3 ${pad} ${
              top ? "rounded-xl bg-gold/15 ring-2 ring-gold" : ""
            }`}
            variants={ROW}
            initial={false}
            animate={risen(index) ? "visible" : "hidden"}
          >
            <span className="w-8 shrink-0 font-mono text-2xl font-bold text-ink-dim">{rank}</span>
            <span className="relative shrink-0">
              <Avatar name={player.name} modelId={player.modelId} size="2.75rem" />
              {top && crowned && (
                <motion.span
                  className="absolute -top-4 left-1/2 -translate-x-1/2 text-gold"
                  variants={pop}
                  initial="hidden"
                  animate="visible"
                >
                  <CrownIcon className="size-[1.6rem]" />
                </motion.span>
              )}
            </span>
            {/* A narrow stage (a phone without a seat) stacks the verdict too. */}
            <span
              className={`flex min-w-0 flex-1 ${
                stacked
                  ? "flex-col"
                  : "items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-0"
              }`}
            >
              {name}
              {verdictLine}
            </span>
            <span
              className={`shrink-0 text-right font-mono text-3xl font-bold tabular-nums ${
                top ? "text-gold-ink" : "text-ink"
              }`}
            >
              {player.score < 0 ? signedPoints(player.score) : player.score.toLocaleString()}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** The recap's extras: the whole chat and what the AI cost. */
export function RecapSections({ mode }: { mode: MatchslopMode }) {
  const { view } = useRoom();
  return (
    <motion.div
      className="mt-10 flex flex-col gap-10"
      variants={fade}
      initial="hidden"
      animate="visible"
    >
      <section>
        <h2 className="mb-4 font-display text-xl font-bold text-ink">{COPY.wholeChat}</h2>
        <div className="flex flex-col gap-3">
          {mode.messages.map((message) => {
            if (message.speaker === "PERSONA") {
              return (
                <div key={message.id} className="flex justify-start">
                  <div className={`${HER_BUBBLE} text-lg leading-snug`}>{message.text}</div>
                </div>
              );
            }
            const level = levelOfTurn(mode.messages, message.turn);
            return (
              <div key={message.id} className="flex flex-col items-end">
                {message.turn === 1 && message.openerPromptText && (
                  <p className="mb-1 text-base text-punch">↳ {message.openerPromptText}</p>
                )}
                <div className={`relative ${OUR_BUBBLE} text-lg leading-snug`}>
                  {message.text}
                  {level && <Tapback level={level} className="size-[2rem]! text-base!" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {view.usage && (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-ink">{COPY.aiUsage}</h2>
          <AiUsageBreakdown usage={view.usage} />
        </section>
      )}
    </motion.div>
  );
}
