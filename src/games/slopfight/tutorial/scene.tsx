"use client";

import { Sequence, useCues, useTime } from "@/tutorial/clock";
import type { TutorialScene } from "@/tutorial/spec";
import type { Cues } from "@/tutorial/timeline";
import { sfx, type SfxName } from "@/games/slopfight/audio";
import { Backdrop, FREDOKA, NIGHT, SceneTokens, SlashWipe, loadFonts } from "./look";
import { BrawlShot } from "./shots/brawl";
import { BuildShot } from "./shots/build";
import { CardShot } from "./shots/card";
import { FaceOffShot } from "./shots/faceoff";
import { FoundryShot } from "./shots/foundry";
import { OpenShot } from "./shots/open";
import { RingOutShot } from "./shots/ringout";
import { UpgradeShot } from "./shots/upgrade";
import { OutroShot, WinShot } from "./shots/win";

// SlopFight's how-to-play, cut as a fight-night pay-per-view promo read
// dead straight by The Voice. One Sequence per shot, hard cuts inside a
// chapter, the slash between chapters, and the LIVE bug over it all.

const WIPE = 0.8;
const CHAPTERS = [
  { id: "build", label: "Build" },
  { id: "fight", label: "Fight" },
  { id: "upgrade", label: "Upgrade" },
  { id: "win", label: "Win" },
];

/** Where each shot cuts in, from the voice. */
function cuts(cues: Cues) {
  const chapter = (id: string) => cues.at(id) - 0.12;
  return {
    build: chapter("build"),
    foundry: chapter("foundry"),
    fight: chapter("fight"),
    faceOff: cues.word("bet", "before") - 0.06,
    brawl: cues.word("bet", "during") - 0.06,
    ringOut: cues.word("finish", "or") - 0.04,
    upgrade: chapter("upgrade"),
    win: chapter("win"),
    outro: cues.word("outro", "now") - 0.06,
  };
}

/** The broadcast bug: LIVE, top right, from the first chapter on. */
function LiveBug({ from }: { from: number }) {
  const t = useTime();
  if (t < from) return null;
  const enter = Math.min(1, (t - from) / 0.3);
  const blink = Math.floor(t * 1.6) % 2 === 0 ? 1 : 0.35;
  return (
    <div
      className="pointer-events-none absolute right-[64px] top-[50px] z-[35] flex items-stretch overflow-hidden rounded-[12px] uppercase"
      style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 30, letterSpacing: "0.1em", opacity: enter, transform: `translateX(${(1 - enter) * 40}px)` }}
    >
      <span className="flex items-center gap-[10px] px-[16px] py-[4px]" style={{ background: "#E5322D", color: "#FFF4DC" }}>
        <span className="size-[14px] rounded-full" style={{ background: "#FFF4DC", opacity: blink }} />
        Live
      </span>
      <span className="px-[16px] py-[4px]" style={{ background: NIGHT, color: "#FFF4DC" }}>
        SlopFight
      </span>
    </div>
  );
}

function Scene() {
  const cues = useCues();
  const cut = cuts(cues);
  return (
    <div data-sft className="absolute inset-0 overflow-hidden">
      <SceneTokens />
      <Backdrop />
      <Sequence from={0} to={cut.build}>
        <OpenShot />
      </Sequence>
      <Sequence from={cut.build} to={cut.foundry}>
        <BuildShot />
      </Sequence>
      <Sequence from={cut.foundry} to={cut.fight}>
        <FoundryShot />
      </Sequence>
      <Sequence from={cut.fight} to={cut.faceOff}>
        <CardShot />
      </Sequence>
      <Sequence from={cut.faceOff} to={cut.brawl}>
        <FaceOffShot />
      </Sequence>
      <Sequence from={cut.brawl} to={cut.ringOut}>
        <BrawlShot />
      </Sequence>
      <Sequence from={cut.ringOut} to={cut.upgrade}>
        <RingOutShot />
      </Sequence>
      <Sequence from={cut.upgrade} to={cut.win}>
        <UpgradeShot />
      </Sequence>
      <Sequence from={cut.win} to={cut.outro}>
        <WinShot />
      </Sequence>
      <Sequence from={cut.outro} to={cues.duration}>
        <OutroShot />
      </Sequence>
      <LiveBug from={cut.build + 0.4} />
      {CHAPTERS.map((chapter) => {
        const at = cues.at(chapter.id) - 0.12;
        return (
          <Sequence key={chapter.id} from={at - WIPE / 2} to={at + WIPE / 2}>
            <SlashWipe at={0} duration={WIPE} label={chapter.label} />
          </Sequence>
        );
      })}
    </div>
  );
}

/** A sound on a beat, quietly or not. */
function cue(at: number, name: SfxName, intensity = 0.5) {
  return { at, play: () => sfx.play(name, { intensity }) };
}

function sounds(cues: Cues) {
  const word = (id: string, text: string, nth?: number) => cues.word(id, text, nth);
  const cut = cuts(cues);
  const list = [
    // The cold open.
    cue(1.45, "strikeThwack", 0.35),
    cue(word("intro", "tonight") + 0.08, "slam", 0.6),
    cue(word("intro", "four") + 0.08, "slam", 0.4),
    cue(word("intro", "trophy") + 0.05, "nameCardDing"),
    cue(word("intro", "slopfight") + 0.08, "slam", 0.9),
    cue(word("intro", "slopfight") + 0.2, "crowdCheer", 0.6),
    // Build.
    cue(word("build", "champion") + 0.04, "slam", 0.5),
    cue(word("build", "draw") + 0.05, "tap"),
    cue(word("ideas", "tuxedo"), "partPop"),
    cue(word("ideas", "toaster") + 0.1, "partPop"),
    cue(word("ideas", "judge"), "nameCardDing"),
    // The Foundry.
    cue(word("foundry", "send") + 0.12, "tap"),
    cue(word("foundry", "foundry") + 0.12, "sketchDissolve"),
    cue(word("foundry", "real") - 0.05, "inflate"),
    cue(word("foundry", "name"), "nameCardDing"),
    cue(word("foundry", "moves") + 0.12, "partPop"),
    // The tale of the tape: each freeze-frame lands on a hit.
    cue(word("stats", "hard") + 0.06, "grappleSlam", 0.7),
    cue(word("stats", "far") + 0.06, "strikeThwack", 0.7),
    cue(word("stats", "whatever") + 0.08, "boing"),
    cue(word("stats", "want") + 0.14, "slam", 0.5),
    // Tonight's card.
    cue(word("fight", "three") - 0.05, "partPop"),
    cue(word("fight", "short"), "crowdGasp", 0.4),
    cue(word("fight", "brings"), "landingThud", 0.5),
    // The face-off and the bet.
    cue(cut.faceOff, "letterbox"),
    cue(word("bet", "before") + 0.1, "slam", 0.7),
    cue(word("bet", "wins") + 0.04, "betPlaced"),
    // The fight.
    cue(word("bet", "fight", 1) + 0.08, "slam", 0.8),
    cue(word("bet", "fight", 1) + 0.42, "strikeThwack"),
    cue(word("bet", "fight", 1) + 0.95, "trickBonk"),
    cue(word("bet", "smash") + 0.08, "hype"),
    cue(word("bet", "button") + 0.1, "hype", 0.7),
    cue(word("bet", "amazing"), "crowdCheer", 0.7),
    cue(word("finish", "out") + 0.02, "koSting"),
    cue(word("finish", "out") + 0.02, "healthCrunch", 0.8),
    // The ring out.
    cue(word("finish", "off") - 0.02, "strikeThwack", 0.6),
    cue(word("finish", "off") + 0.04, "ringOutScream"),
    cue(word("finish", "edge") + 0.06, "landingSplash"),
    cue(word("finish", "bonus") + 0.1, "confirm"),
    // Upgrade.
    cue(word("upgrade", "add") + 0.08, "slam", 0.5),
    cue(word("upgrade", "hat"), "partPop"),
    cue(word("upgrade", "jetpack"), "partPop"),
    cue(word("upgrade", "head"), "partPop"),
    // Win.
    cue(word("win", "final") + 0.08, "slam", 0.6),
    cue(word("win", "champion") + 0.04, "winFanfare"),
    cue(word("win", "very"), "boing"),
    cue(word("win", "you", 1), "boing"),
    // The call to action and the end card.
    cue(word("outro", "now") + 0.06, "slam", 0.8),
    cue(word("outro", "drawing") + 0.04, "nameCardDing"),
    cue(cues.end("outro") + 0.5, "slam", 0.9),
    cue(cues.end("outro") + 0.6, "crowdCheer", 0.6),
  ];
  for (const chapter of CHAPTERS) list.push(cue(cues.at(chapter.id) - 0.12 - WIPE / 2 + 0.05, "wipe", 0.5));
  return list;
}

function preload() {
  loadFonts();
  sfx.preload();
}

if (typeof window !== "undefined") loadFonts();

export const scene: TutorialScene = {
  Scene,
  sounds,
  preload,
};
