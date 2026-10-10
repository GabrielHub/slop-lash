"use client";

import Image from "next/image";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ACCENT, DUR, EASE, SPRING, enter, pop } from "@/lib/animations";
import { CountUp, Stamp } from "@/room/moment";
import { MATCHSLOP_DATE_LINE, MATCHSLOP_MOOD_THRESHOLD_UNMATCH } from "../types";
import { COPY, metaLine, type Ending } from "./copy";
import { HeartIcon, personaName, type Persona } from "./primitives";

/**
 * Her face, in whatever frame it sits in (the strip's circle, the Meet's card,
 * the final hero). One `layoutId`, so it flies between them. The portrait
 * crossfades in if it arrives mid-game; until then, her initial.
 */
export function PersonaFace({
  persona,
  className,
  radius,
  monogram,
  blur = 0,
  grey = false,
  hush = false,
  layoutId = "ms-portrait",
  children,
}: {
  persona: Persona;
  /** Size and position classes. */
  className: string;
  /** CSS border radius, set as style so the flight animates it. */
  radius: string;
  /** Monogram text size class. */
  monogram: string;
  /** Blur in px. */
  blur?: number;
  grey?: boolean;
  /** Fades her initial out, so a stamp laid across the card is never defaced by it. */
  hush?: boolean;
  /** Null for a face that never flies (phones, the lobby). */
  layoutId?: string | null;
  children?: React.ReactNode;
}) {
  const name = personaName(persona);
  const url = persona.portraitUrl;
  return (
    <motion.div
      layoutId={layoutId ?? undefined}
      // Flies at full strength; the frame it leaves is already fading with its scene.
      layoutCrossfade={false}
      className={`relative shrink-0 ${className}`}
      style={{ borderRadius: radius }}
      transition={SPRING.smooth}
    >
      <div
        className="absolute inset-0 overflow-hidden bg-[color-mix(in_oklab,var(--punch)_15%,var(--surface))]"
        style={{
          borderRadius: radius,
          filter: `blur(${blur}px) grayscale(${grey ? 0.85 : 0})`,
          transition: `filter ${DUR.slow}s ease-out`,
        }}
      >
        <motion.span
          className={`absolute inset-0 grid place-items-center font-display font-bold leading-none text-punch ${monogram}`}
          aria-hidden="true"
          initial={false}
          animate={{ opacity: hush ? 0 : 1 }}
          transition={{ duration: DUR.fast, ease: EASE.out }}
        >
          {persona.profile ? name.trim()[0]?.toUpperCase() : <HeartIcon size="45%" />}
        </motion.span>
        <AnimatePresence initial={false}>
          {url && (
            <motion.div
              key={url}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.slow, ease: EASE.out }}
            >
              <Image
                src={url}
                alt={name}
                fill
                unoptimized
                sizes="(min-width: 1024px) 30vw, 60vw"
                className="object-cover object-center"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {children}
    </motion.div>
  );
}

/**
 * A verdict stamp parked on her portrait. It lands without a slam (the hero
 * stamp already slammed, or it was there before this screen opened), shares
 * `ms-outcome` so it flies to and from the hero stamp, and peels off when a
 * comeback wins her back.
 */
export function DockedStamp({
  ending,
  size = "sm",
  layout = true,
  peel = false,
  className = "[grid-area:1/1]",
}: {
  ending: Ending;
  size?: "sm" | "lg";
  /** False while it is about to peel, so nothing else flies from it. */
  layout?: boolean;
  /** Leaves by peeling off (a comeback that won her back); otherwise it just goes. */
  peel?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      layoutId={layout ? "ms-outcome" : undefined}
      layoutCrossfade={false}
      className={`z-10 ${className}`}
      transition={SPRING.smooth}
      exit={
        peel
          ? { rotate: 25, y: "3rem", opacity: 0, transition: { duration: DUR.slow, ease: EASE.in } }
          : { opacity: 0, transition: { duration: 0 } }
      }
    >
      {/* Static: the slam belongs to the hero stamp, not to a stamp arriving in place. */}
      <MotionConfig reducedMotion="always">
        <Stamp size={size} tone={ending.tone} tilt={ACCENT.matchslop.stampTilt}>
          {ending.text}
        </Stamp>
      </MotionConfig>
    </motion.div>
  );
}

export type LinePulse = "date" | "unmatch" | "missed" | null;

/** What of the meter is drawn; the Meet builds it piece by piece. */
export interface MeterShown {
  track: boolean;
  fill: boolean;
  unmatchLine: boolean;
  dateLine: boolean;
}

const ALL_SHOWN: MeterShown = { track: true, fill: true, unmatchLine: true, dateLine: true };

function fillTone(mood: number) {
  if (mood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH) return { bg: "bg-fail", text: "text-fail" };
  if (mood >= MATCHSLOP_DATE_LINE) return { bg: "bg-win", text: "text-win" };
  return { bg: "bg-punch", text: "text-punch" };
}

function MeterLine({
  at,
  label,
  tone,
  shown,
  pulse,
}: {
  at: number;
  label: string;
  tone: "win" | "fail" | "ink";
  shown: boolean;
  pulse: boolean;
}) {
  const color = { win: "bg-win", fail: "bg-fail", ink: "bg-ink" }[tone];
  const text = { win: "text-win", fail: "text-fail", ink: "text-ink" }[tone];
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="line"
          className="pointer-events-none absolute top-[1.75rem] flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${at}%` }}
          variants={pop}
          initial="hidden"
          animate="visible"
        >
          <motion.span
            className={`block h-[2.25rem] w-[0.25rem] rounded-full ${color}`}
            animate={
              pulse ? { scaleY: [1, 1.3, 1], scaleX: [1, 1.6, 1] } : { scaleY: 1, scaleX: 1 }
            }
            transition={{ duration: 0.5, ease: EASE.out }}
          />
          <motion.span
            className={`mt-[0.125rem] whitespace-nowrap text-base font-bold leading-none ${text}`}
            animate={pulse ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, ease: EASE.out }}
          >
            {label}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Her mood as a heart meter with two labelled lines: Unmatch at 20 and Date
 * at 80. The fill and the heart marker swing on a gentle spring; the marker
 * holds the number. `landing` is drawn in the zone above the marker (the
 * delta chip lands there).
 */
export function HeartMeter({
  name,
  mood,
  from,
  shown = ALL_SHOWN,
  pulse = null,
  landing,
}: {
  name: string;
  mood: number;
  /** Where the marker's number counts from on mount. */
  from: number;
  shown?: MeterShown;
  pulse?: LinePulse;
  landing?: React.ReactNode;
}) {
  const value = shown.fill ? mood : 0;
  const tone = fillTone(value);
  return (
    <div className="relative h-[6rem] min-w-0">
      <meter className="sr-only" aria-label={`${name}'s mood`} min={0} max={100} value={value} />
      <motion.div
        className="absolute inset-x-0 top-[2.25rem] h-[1.25rem] origin-left overflow-hidden rounded-full bg-raised ring-1 ring-edge-strong"
        initial={false}
        animate={{ scaleX: shown.track ? 1 : 0, opacity: shown.track ? 1 : 0 }}
        transition={{ duration: DUR.slow, ease: EASE.emphasized }}
      >
        <span className="absolute inset-y-0 left-0 w-[20%] bg-fail/15" />
        <span className="absolute inset-y-0 right-0 w-[20%] bg-win/15" />
        <motion.span
          className={`absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors duration-500 ${tone.bg}`}
          initial={false}
          animate={{ scaleX: value / 100 }}
          transition={SPRING.gentle}
        />
      </motion.div>
      <MeterLine
        at={MATCHSLOP_MOOD_THRESHOLD_UNMATCH}
        label={COPY.unmatchLabel}
        tone="fail"
        shown={shown.unmatchLine}
        pulse={pulse === "unmatch"}
      />
      <MeterLine
        at={MATCHSLOP_DATE_LINE}
        label={COPY.dateLabel}
        tone={pulse === "missed" ? "ink" : "win"}
        shown={shown.dateLine}
        pulse={pulse === "date" || pulse === "missed"}
      />
      <AnimatePresence initial={false}>
        {shown.fill && (
          <motion.div
            key="marker"
            className="absolute top-[1.375rem] z-[1] size-[3rem] -translate-x-1/2"
            initial={{ left: "0%", opacity: 0 }}
            animate={{ left: `${value}%`, opacity: 1 }}
            transition={{ left: SPRING.gentle, opacity: { duration: DUR.fast } }}
          >
            <HeartIcon
              size="100%"
              className={`absolute inset-0 drop-shadow-md transition-colors duration-500 ${tone.text}`}
            />
            <span className="absolute inset-0 grid place-items-center pb-[0.25rem] font-mono text-base font-bold text-accent-ink">
              <CountUp value={value} from={from} duration={0.6} />
            </span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2">{landing}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The strip across the top of the date: her face, her name, and the meter.
 * `meta` shows age and place (round 1 only).
 */
export function PersonaStrip({
  persona,
  mood,
  moodFrom,
  meta,
  grey,
  docked,
  shown,
  pulse,
  landing,
  metaEnter = false,
}: {
  persona: Persona;
  mood: number;
  moodFrom: number;
  meta: boolean;
  grey: boolean;
  docked: React.ReactNode;
  shown?: MeterShown;
  pulse?: LinePulse;
  landing?: React.ReactNode;
  /** Name and meta enter (the Meet's dock); otherwise they are just there. */
  metaEnter?: boolean;
}) {
  const name = personaName(persona);
  const line = meta ? metaLine(persona.profile) : null;
  return (
    <div className="grid h-[6rem] grid-cols-[6rem_minmax(0,1fr)_minmax(0,2fr)] items-center gap-x-6">
      <PersonaFace
        persona={persona}
        className="size-[6rem]"
        radius="50%"
        monogram="text-5xl"
        grey={grey}
      >
        {/* Hangs off her face's lower-left and runs right, under the name, so a long
            ending ("No second date") never runs off the screen's edge. */}
        <div className="pointer-events-none absolute -bottom-2 left-0 z-10 grid w-max items-center justify-items-start">
          <AnimatePresence>{docked}</AnimatePresence>
        </div>
      </PersonaFace>
      <motion.div
        className="min-w-0"
        variants={enter}
        initial={metaEnter ? "hidden" : false}
        animate="visible"
      >
        <p className="truncate font-display text-4xl font-bold leading-tight text-ink">{name}</p>
        {line && <p className="truncate text-xl text-ink-dim">{line}</p>}
      </motion.div>
      <HeartMeter
        name={name}
        mood={mood}
        from={moodFrom}
        shown={shown}
        pulse={pulse}
        landing={landing}
      />
    </div>
  );
}
