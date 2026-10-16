"use client";

import { Sequence, useCues, useTime } from "@/tutorial/clock";
import { STAMP_IMPACT, soundCue } from "@/tutorial/kit";
import type { SoundCue, TutorialScene } from "@/tutorial/spec";
import { SPRINGS, clamp, mix, spring, type Cues } from "@/tutorial/timeline";
import { Curtain, OnAirSign } from "./parts";
import { AnswerShot } from "./shots/answer";
import { BetsShot } from "./shots/bets";
import { FinalShot } from "./shots/final";
import { OpenShot } from "./shots/open";
import { OutroShot } from "./shots/outro";
import { PointsShot } from "./shots/points";
import { RehearsalShot } from "./shots/rehearsal";
import { TopicsShot } from "./shots/topics";
import { TwoShot } from "./shots/two";
import { practice } from "./practice";

/**
 * QuizSlop's how-to-play is a rehearsal round on a slick, slightly too
 * confident studio quiz show that is secretly about betting against your
 * friends. Marquee bulbs, the ON AIR light, spotlights and a velvet curtain
 * between chapters. Midway the room answers a real practice question on its
 * phones. Every beat is keyed on the voice.
 */

/** The chapters the curtain closes on, with their plaques. The rehearsal flows straight into its reveal. */
const CHAPTERS = [
  { id: "topics", label: "Topics" },
  { id: "answer", label: "Answer" },
  { id: "bets", label: "Bet" },
] as const;

/** The curtain is fully shut this long before its chapter's first word. */
const CURTAIN_LEAD = 0.02;

function Scene() {
  const cues = useCues();
  const at = (id: string) => cues.at(id);
  return (
    <div className="absolute inset-0 overflow-hidden" data-qs-tutorial="">
      <Backdrop />

      <Sequence from={0} to={at("topics")} post={0.2}>
        <OpenShot />
      </Sequence>
      <Sequence from={at("topics")} to={at("answer")} pre={0.2} post={0.2}>
        <TopicsShot />
      </Sequence>
      <Sequence from={at("answer")} to={at("practice")} pre={0.2} post={0.4}>
        <AnswerShot />
      </Sequence>
      <Sequence from={at("practice")} to={at("points")} pre={0.2} post={0.3}>
        <RehearsalShot />
      </Sequence>
      <Sequence from={at("points")} to={at("bets")} pre={0.2} post={0.2}>
        <PointsShot />
      </Sequence>
      <Sequence from={at("bets")} to={at("two")} pre={0.2} post={0.2}>
        <BetsShot />
      </Sequence>
      <Sequence from={at("two")} to={at("final")} pre={0.3} post={0.2}>
        <TwoShot />
      </Sequence>
      <Sequence from={at("final")} to={at("outro")} pre={0.3} post={0.5}>
        <FinalShot />
      </Sequence>
      <Sequence from={at("outro")} pre={0.3}>
        <OutroShot />
      </Sequence>

      {CHAPTERS.map((chapter) => (
        <Curtain key={chapter.id} at={cues.at(chapter.id) - CURTAIN_LEAD} label={chapter.label} />
      ))}

      <OnAirBug />
    </div>
  );
}

/** A soft studio wash over the page's confetti field: a warm key light and a darker floor. */
function Backdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 55% 48% at 50% 46%, color-mix(in srgb, var(--gold) 7%, transparent), transparent 72%), radial-gradient(ellipse 120% 70% at 50% 120%, color-mix(in srgb, var(--raised) 70%, transparent), transparent 60%)",
      }}
    />
  );
}

/**
 * The ON AIR light: it flickers on with the sting, big over the stage, then
 * settles into the top-right corner as the show's bug for the rest of the
 * tutorial, and flares again for the finale.
 */
function OnAirBug() {
  const t = useTime();
  const cues = useCues();
  const settle = spring(t - cues.word("intro", "the"), SPRINGS.gentle);
  const finale = cues.word("outro", "QuizSlop!");
  // Off, a stutter of flickers, then steady.
  const flicker = [0.12, 0.2, 0.26, 0.31, 0.44];
  let lit = 0;
  for (let index = 0; index < flicker.length; index++) if (t >= flicker[index]) lit = index % 2 === 0 ? 1 : 0.15;
  const flare = t >= finale ? Math.max(0, 1 - (t - finale) / 0.6) : 0;
  const x = mix(960, 1748, settle);
  const y = mix(176, 80, settle);
  const scale = mix(1, 0.5, settle) * (1 + flare * 0.25);
  return (
    <div
      className="pointer-events-none absolute z-[60]"
      style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${scale})`, opacity: clamp(t / 0.1) }}
    >
      <OnAirSign lit={lit} size={60} />
    </div>
  );
}

function sounds(cues: Cues): SoundCue[] {
  const word = (id: string, text: string, nth?: number) => cues.word(id, text, nth);
  const opens = word(practice.opens.line, practice.opens.word);
  const closes = cues.at(practice.closes);
  return [
    soundCue(0.12, "game-start"),
    soundCue(word("intro", "betting") + 0.32, "all-in"),
    soundCue(word("intro", "better.") + STAMP_IMPACT, "stamp-slam"),
    ...CHAPTERS.map((chapter) => soundCue(cues.at(chapter.id) - 0.45, "phase-transition")),
    soundCue(word("topics", "gets") + 0.55, "submitted"),
    soundCue(word("topics", "We") + 0.42, "vote-cast"),
    soundCue(word("topics", "for") + STAMP_IMPACT, "stamp-slam"),
    soundCue(word("answer", "tap"), "submitted"),
    soundCue(word("answer", "locks") + STAMP_IMPACT, "stamp-slam"),
    soundCue(word("practice", "rehearse.") - 0.3, "round-start"),
    soundCue(opens, "prompt-advance"),
    soundCue(closes - 3, "timer-warning"),
    soundCue(closes + STAMP_IMPACT, "stamp-slam"),
    soundCue(word("reveal", "It's"), "vote-reveal"),
    soundCue(word("reveal", "orecchiette.") + 0.3 + STAMP_IMPACT, "winner-reveal"),
    soundCue(word("points", "points."), "vote-reveal"),
    soundCue(word("points", "nothing."), "player-leave"),
    soundCue(word("bets", "fun"), "all-in"),
    soundCue(word("bets", "Call"), "submitted"),
    soundCue(word("bets", "Call") + 0.77, "all-in"),
    soundCue(word("payout", "fifty."), "vote-reveal"),
    soundCue(word("payout", "fifty.", 1), "player-leave"),
    soundCue(word("two", "so") + 0.42, "vote-cast"),
    soundCue(word("two", "moment.") + 0.34, "all-in"),
    soundCue(word("final", "votes"), "vote-cast"),
    soundCue(word("final", "double.") + 0.12 + STAMP_IMPACT, "stamp-slam"),
    soundCue(word("outro", "wins."), "winner-reveal"),
    soundCue(word("outro", "QuizSlop!"), "celebration"),
  ];
}

export const scene: TutorialScene = { Scene, sounds };
