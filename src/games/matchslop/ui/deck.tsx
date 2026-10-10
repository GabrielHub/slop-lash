"use client";

import Image from "next/image";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ACCENT, DUR, EASE, SPRING, STAGGER, fade, rise } from "@/lib/animations";
import { Stamp, TypeOn } from "@/room/moment";
import { COPY } from "./copy";
import { PersonaFace } from "./strip";
import { TypingDots, openerCards, personaName, type Persona } from "./primitives";

/** The hero card: 18rem, her face (or a blurred heart while she is being written). */
function HeroCard({
  persona,
  blurred,
  hush = false,
  children,
}: {
  persona: Persona;
  blurred: boolean;
  /** The stamp is on: her initial steps out of its way. */
  hush?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      className="relative"
      initial={false}
      animate={{ scale: blurred ? 0.96 : 1 }}
      transition={{ duration: DUR.slow, ease: EASE.emphasized }}
    >
      <PersonaFace
        persona={persona}
        className="size-[18rem]"
        radius="2rem"
        monogram="text-[10rem]"
        blur={blurred ? 24 : 0}
        hush={hush}
      >
        {children}
      </PersonaFace>
    </motion.div>
  );
}

/** PROFILE: a blurred card while the match is written. */
export function ProfileHero({ persona }: { persona: Persona }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <HeroCard persona={{ ...persona, profile: null, portraitUrl: null }} blurred />
      <p className="flex items-center gap-4 font-display text-5xl font-bold text-ink">
        {COPY.findingMatch}
        <TypingDots dot="0.75rem" />
      </p>
    </div>
  );
}

/**
 * The Meet: her card unblurs, "It's a match" slams across it, her name types
 * on and her place fades in. Docking happens in the scene (the card flies to
 * the strip).
 */
export function MeetHero({
  persona,
  unblurred,
  stamped,
  named,
  placed,
  fresh,
}: {
  persona: Persona;
  unblurred: boolean;
  stamped: boolean;
  named: boolean;
  placed: boolean;
  fresh: boolean;
}) {
  const profile = persona.profile;
  const name = personaName(persona);
  const title = profile?.age != null ? `${name}, ${profile.age}` : name;
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <HeroCard persona={persona} blurred={!unblurred} hush={stamped}>
        {/* Dims her photo under the stamp, so pink on pink still reads. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2rem] bg-canvas"
          initial={false}
          animate={{ opacity: stamped && persona.portraitUrl ? 0.45 : 0 }}
          transition={{ duration: DUR.fast, ease: EASE.out }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-10 flex justify-center">
          <Stamp
            size="xl"
            tone="punch"
            tilt={ACCENT.matchslop.stampTilt}
            show={stamped}
            className="text-7xl!"
          >
            {COPY.itsAMatch}
          </Stamp>
        </div>
      </HeroCard>
      <div className="mt-6 h-[4.5rem] overflow-hidden">
        {named && (
          <motion.p
            className="font-display text-7xl font-bold leading-none text-ink"
            variants={rise}
            initial={fresh ? "hidden" : false}
            animate="visible"
          >
            {fresh ? <TypeOn text={title} cps={24} caret={false} /> : title}
          </motion.p>
        )}
      </div>
      <div className="h-[2.25rem]">
        {placed && profile?.location && (
          <motion.p
            className="text-3xl text-ink-dim"
            variants={fade}
            initial={fresh ? "hidden" : false}
            animate="visible"
          >
            {profile.location}
          </motion.p>
        )}
      </div>
    </div>
  );
}

/** Cards deal in from the right, alternately tilted, and settle flat. */
const DEAL: Variants = {
  hidden: (index: number) => ({
    opacity: 0,
    x: 24,
    rotate: index % 2 === 0 ? -ACCENT.matchslop.cardTilt : ACCENT.matchslop.cardTilt,
  }),
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    rotate: 0,
    transition: { ...SPRING.snappy, delay: index * STAGGER.cards },
  }),
};

/** Round 1's prompt cards: her profile prompts and, once it exists, her photo. */
export function PromptDeck({
  persona,
  deal,
  tight,
}: {
  persona: Persona;
  /** Deal the cards in (the Meet); otherwise they are already down. */
  deal: boolean;
  tight: boolean;
}) {
  const cards = openerCards(persona);
  const four = cards.length >= 4;
  const answerSize = tight ? (four ? "text-lg" : "text-xl") : four ? "text-xl" : "text-2xl";
  return (
    <motion.ul
      layout
      className="grid gap-6"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, cards.length)}, minmax(0, 1fr))` }}
      aria-label="Her profile"
    >
      <AnimatePresence initial={false}>
        {cards.map((card, index) => (
          <motion.li
            key={card.id}
            layout
            custom={index}
            variants={DEAL}
            initial={deal ? "hidden" : false}
            animate="visible"
            className="relative min-h-[10rem] overflow-hidden rounded-2xl border border-edge bg-surface"
          >
            {card.photo ? (
              <>
                <Image
                  src={card.photo}
                  alt={card.prompt}
                  fill
                  unoptimized
                  sizes="25vw"
                  className="object-cover object-center"
                />
                <p className="absolute inset-x-0 bottom-0 bg-canvas/70 px-5 py-2 text-xl font-bold text-punch">
                  {card.prompt}
                </p>
              </>
            ) : (
              <div className="p-5">
                <p className="text-xl font-bold text-punch">{card.prompt}</p>
                <p className={`mt-2 leading-snug text-ink ${answerSize}`}>{card.answer}</p>
              </div>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
