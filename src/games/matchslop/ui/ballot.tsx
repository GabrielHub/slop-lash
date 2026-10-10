"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { ACCENT, DUR, EASE, SPRING, deckCard, fade, pop, unmask } from "@/lib/animations";
import { Avatar } from "@/room/avatar";
import type { RoomPlayer } from "@/room/context";
import { CountUp, Stamp } from "@/room/moment";
import { MATCHSLOP_WINNER_BONUS } from "../config/game-config";
import { BALLOT } from "./beats";
import { COPY, letterOf } from "./copy";
import { HER_FACE } from "./thread";
import type { Answer } from "./primitives";

/** Who has voted: one face per player, lit once they vote. No label, no count. */
export function VotedRow({
  players,
  votedIds,
  flown,
}: {
  players: readonly RoomPlayer[];
  votedIds: readonly string[];
  /** Voters whose face has flown to their card (SENT). */
  flown: (playerId: string) => boolean;
}) {
  const voted = new Set(votedIds);
  return (
    <ul className="flex shrink-0 items-center gap-2" aria-label="Votes in">
      {players.map((player) => {
        const done = voted.has(player.id);
        return (
          <li key={player.id} className="relative size-[2.25rem]">
            {!flown(player.id) && (
              <motion.div
                layoutId={`ms-voter-${player.id}`}
                transition={SPRING.smooth}
                className="relative transition-opacity duration-300"
                style={{ opacity: done ? 1 : 0.5 }}
              >
                <Avatar name={player.name} modelId={player.modelId} size="2.25rem" />
                <AnimatePresence initial={false}>
                  {done && (
                    <motion.span
                      key="check"
                      className="absolute -bottom-1 -right-1 grid size-[1.1rem] place-items-center rounded-full bg-win text-accent-ink shadow-[0_0_0_0.1rem_var(--bg)]"
                      variants={pop}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="size-[70%]"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth={3.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
            <span className="sr-only">
              {player.name}
              {done ? " voted" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Card i deals 150 + i×90 ms into VOTING, as a phone deck card would slide in. */
const DEAL: Variants = {
  hidden: deckCard.hidden!,
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: { ...SPRING.snappy, delay: (BALLOT.dealBase + index * BALLOT.dealStep) / 1000 },
  }),
};

/**
 * Ballot sizes by how many lines are up (tight steps every type size down one).
 * 7–8 run at `text-xl`: the spec's overflow gate tripped at `text-2xl` (four
 * 80-character lines wrap to four rows in a quarter-width card). The letter
 * badge hangs outside the padding box, so every line starts at the same edge.
 */
function ballotSize(count: number, tight: boolean) {
  if (count <= 2) {
    return { cols: "grid-cols-2", text: tight ? "text-3xl" : "text-4xl", pad: "p-5" };
  }
  if (count <= 4) {
    return { cols: "grid-cols-2", text: tight ? "text-2xl" : "text-3xl", pad: "p-5" };
  }
  if (count <= 6) {
    return { cols: "grid-cols-3", text: tight ? "text-xl" : "text-2xl", pad: "p-4" };
  }
  return { cols: "grid-cols-4", text: "text-xl", pad: "px-4 pb-3 pt-4" };
}

export interface BallotReveal {
  /** A voter's face has flown onto their card. */
  flown: (playerId: string) => boolean;
  /** Authors and points are showing. */
  unmasked: boolean;
  /** The winner's stamp is down. */
  stamped: boolean;
}

/**
 * The lines up for the vote, A to H in `answers` order (the phones' order),
 * full text, no names. In SENT the same cards reveal: voter faces fly on,
 * authors unmask, the winner is stamped.
 */
export function BallotGrid({
  answers,
  players,
  round,
  winnerId,
  reveal,
  deal,
  tight,
}: {
  answers: readonly Answer[];
  players: readonly RoomPlayer[];
  round: number;
  winnerId: string | null;
  reveal: BallotReveal | null;
  /** Deal the cards in (a fresh VOTING); otherwise they are already down. */
  deal: boolean;
  tight: boolean;
}) {
  const size = ballotSize(answers.length, tight);
  const byId = new Map(players.map((player) => [player.id as string, player]));
  return (
    <ol
      className={`grid list-none ${size.cols} gap-5 pl-4 pt-4`}
      aria-label="Texts to send"
    >
      {answers.map((answer, index) => {
        const author = answer.playerId ? byId.get(answer.playerId) : undefined;
        const winner = answer.id === winnerId;
        const chips = reveal ? answer.voterIds.filter((id) => reveal.flown(id)) : [];
        const dim = reveal?.unmasked && answer.voterIds.length === 0;
        const crowned = winner && reveal?.stamped;
        // The winner's footer counts its votes first; the send bonus lands with the stamp.
        const bonus = winner && answer.weightedVotes > 0 ? MATCHSLOP_WINNER_BONUS : 0;
        const shownPoints = crowned ? answer.pointsEarned : answer.pointsEarned - bonus;
        return (
          <motion.li
            key={answer.id}
            layoutId={winner ? `ms-line-${round}` : undefined}
            className={`relative flex flex-col rounded-[1.5rem] border bg-surface transition-[border-color,box-shadow] duration-300 ${
              crowned ? "border-punch shadow-[0_0_0_0.2rem_var(--punch)]" : "border-edge"
            }`}
            variants={DEAL}
            custom={index}
            initial={deal ? "hidden" : false}
            animate={crowned ? { opacity: 1, x: 0, scale: 1.03 } : "visible"}
          >
            <motion.div
              className={`flex flex-1 flex-col ${size.pad}`}
              animate={{ opacity: dim ? 0.45 : 1 }}
              transition={{ duration: DUR.slow, ease: EASE.out }}
            >
              <p className={`flex-1 break-words leading-snug text-ink ${size.text}`}>{answer.text}</p>
              {round === 1 && answer.openerPromptText && (
                <p className="mt-2 truncate text-lg text-punch">↳ {answer.openerPromptText}</p>
              )}
              {reveal && (
                <div className="mt-2 flex h-[2.25rem] items-center gap-3">
                  {reveal.unmasked && author && (
                    <motion.p
                      className="min-w-0 flex-1 truncate text-xl text-ink"
                      variants={unmask}
                      initial="hidden"
                      animate="visible"
                    >
                      {author.name}
                    </motion.p>
                  )}
                  {reveal.unmasked && shownPoints > 0 && (
                    <motion.span
                      className="ml-auto font-mono text-2xl font-bold text-gold"
                      variants={fade}
                      initial="hidden"
                      animate="visible"
                    >
                      <CountUp value={shownPoints} format={(n) => `+${Math.round(n)}`} />
                    </motion.span>
                  )}
                </div>
              )}
            </motion.div>

            {/* The letter badge overhangs the corner; it flips to the author's face. */}
            <div className="absolute -left-4 -top-4 size-[2.25rem]">
              <AnimatePresence initial={false} mode="popLayout">
                {reveal?.unmasked && author ? (
                  <motion.div key="author" variants={unmask} initial="hidden" animate="visible">
                    <Avatar name={author.name} modelId={author.modelId} size="2.25rem" />
                  </motion.div>
                ) : (
                  <motion.span
                    key="letter"
                    className="grid size-[2.25rem] place-items-center rounded-full border border-edge bg-raised text-xl font-bold leading-none text-ink"
                    exit={{ opacity: 0, transition: { duration: DUR.fast } }}
                  >
                    {letterOf(index)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {chips.length > 0 && (
              <div className="absolute -top-4 right-3 flex -space-x-2">
                {chips.map((id) => {
                  const voter = byId.get(id);
                  if (!voter) return null;
                  return (
                    <motion.div
                      key={id}
                      layoutId={`ms-voter-${id}`}
                      transition={SPRING.smooth}
                      className="rounded-full shadow-[0_0_0_0.15rem_var(--surface)]"
                    >
                      <Avatar name={voter.name} modelId={voter.modelId} size="2rem" />
                    </motion.div>
                  );
                })}
              </div>
            )}

            {crowned && (
              // Inside its own card: on a crowded ballot it sits above the footer at md,
              // so it never crosses a neighbour.
              <div
                className={`pointer-events-none absolute z-10 grid place-items-center ${
                  answers.length >= 5 ? "inset-x-2 bottom-[30%]" : "inset-y-0 right-0 w-1/2"
                }`}
              >
                <Stamp
                  size={tight || answers.length >= 5 ? "md" : "lg"}
                  tone="punch"
                  tilt={ACCENT.matchslop.stampTilt}
                >
                  {answer.weightedVotes > 0 ? COPY.sentBonus : COPY.sent}
                </Stamp>
              </div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Her line the room is answering, above the ballot (round 2 on). */
export function ContextBubble({ text, tight }: { text: string; tight: boolean }) {
  return (
    <div className={`${HER_FACE} ${tight ? "text-xl" : "text-2xl"} leading-snug`}>
      {/* The clamp sits inside the padding, so a cut line never peeks below. */}
      <span className={tight ? "line-clamp-1" : "line-clamp-2"}>{text}</span>
    </div>
  );
}
