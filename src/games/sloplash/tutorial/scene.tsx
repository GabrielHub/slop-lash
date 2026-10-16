"use client";

import { Sequence, useCues, useTime } from "@/tutorial/clock";
import { STAMP_IMPACT, soundCue } from "@/tutorial/kit";
import type { SoundCue, TutorialScene } from "@/tutorial/spec";
import { ease, localCues, progress, type Cues } from "@/tutorial/timeline";
import { LAUGH_LEAD, crowdBank } from "./audio";
import { shotTimes } from "./beats";
import { PixelSweep } from "./pixel";
import { ArenaShot, arenaBeats } from "./shots/arena";
import { FinaleShot, finaleBeats } from "./shots/finale";
import { RoundsShot, roundsBeats } from "./shots/rounds";
import { TitleShot, stingBeats } from "./shots/title";
import { WriteShot, writeBeats } from "./shots/write";
import { Audience, OnAir, Sign, StageLights, studioBeats } from "./studio";

/**
 * SlopLash's how-to-play, as a live taping of a comedy game show: the MC
 * warms up a studio audience while the LED wall explains the game. Five shots
 * on the voice's cues, joined by pixel sweeps and match cuts, under the
 * studio's tally light, cue sign and crowd.
 */

const SWEEP = 0.9;

function allBeats(cues: Cues) {
  const b = localCues(cues, 0);
  const sting = stingBeats(b);
  const arena = arenaBeats(b);
  const finale = finaleBeats(b);
  const studio = studioBeats(b, { lock: sting.lock, flawless: arena.flawless, sloppy: finale.sloppy });
  return { b, sting, arena, finale, studio };
}

function Scene() {
  const cues = useCues();
  const shots = shotTimes(cues);
  const { studio, sting, finale } = allBeats(cues);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Lights open={sting.lock} intro={cues.at("intro")} close={finale.sloppy} />
      <Sequence from={0} to={shots.titleTo}>
        <TitleShot />
      </Sequence>
      <Sequence from={shots.writeFrom} to={shots.writeTo} post={0.7}>
        <WriteShot from={shots.writeFrom} until={shots.writeTo} />
      </Sequence>
      <Sequence from={shots.arenaFrom} to={shots.arenaTo}>
        <ArenaShot />
      </Sequence>
      <Sequence from={shots.roundsFrom} to={shots.roundsTo} post={0.8}>
        <RoundsShot from={shots.roundsFrom} until={shots.roundsTo} />
      </Sequence>
      <Sequence from={shots.finaleFrom}>
        <FinaleShot />
      </Sequence>
      <Audience studio={studio} />
      <Sign signs={studio.signs} />
      <OnAir />
      {shots.sweeps.map((cut, index) => (
        <PixelSweep key={cut} at={cut - SWEEP / 2} duration={SWEEP} seed={index + 3} />
      ))}
    </div>
  );
}

/** The rig's beams: full for the open and the close, gone while the game is explained. */
function Lights({ open, intro, close }: { open: number; intro: number; close: number }) {
  const t = useTime();
  const amount =
    progress(t, 0, 0.6, ease.out) * (1 - progress(t, intro + 0.3, 0.8)) * (t < open ? 0.6 : 1) +
    progress(t, close - 0.1, 0.5, ease.out);
  return <StageLights amount={Math.min(1, amount)} />;
}

function sounds(cues: Cues): SoundCue[] {
  const { b, sting, arena, finale, studio } = allBeats(cues);
  const shots = shotTimes(cues);
  const write = writeBeats(b);
  const rounds = roundsBeats(b);
  const crowd = (at: number, name: Parameters<typeof crowdBank.play>[0], gain: number): SoundCue => ({
    at,
    play: () => crowdBank.play(name, { gain }),
  });
  return [
    // The open: the logo locks and the room cheers, settling under the welcome.
    // Crowd beds sit low: they swell in the gaps and stay under every word.
    soundCue(sting.lock, "game-start"),
    crowd(sting.lock - 0.15, "applause", 0.36),
    soundCue(b.word("intro", "friends"), "player-join"),
    crowd(b.end("intro"), "applause", 0.24),
    crowd(studio.laugh - LAUGH_LEAD, "laugh", 0.34),
    soundCue(b.word("robots", "win."), "stamp-slam"),
    // Write.
    soundCue(shots.writeFrom - 0.3, "phase-transition"),
    soundCue(write.deliver, "prompt-advance"),
    soundCue(write.send, "submitted"),
    soundCue(write.cap, "timer-warning"),
    soundCue(arena.make, "submitted"),
    // Vote.
    soundCue(arena.head2, "phase-transition"),
    ...arena.others.map((at) => soundCue(at, "vote-cast")),
    soundCue(arena.kitLand, "vote-cast"),
    soundCue(arena.nice + STAMP_IMPACT, "stamp-slam"),
    crowd(b.end("self") - LAUGH_LEAD, "laugh", 0.3),
    soundCue(arena.throws[0]! + 0.05, "chat-send"),
    // Score.
    soundCue(arena.lands[0]!, "vote-reveal"),
    soundCue(arena.sweep + 0.05, "winner-reveal"),
    soundCue(arena.flawless + STAMP_IMPACT, "stamp-slam"),
    crowd(studio.flawless + 0.05, "ooh", 0.24),
    soundCue(shots.roundsFrom - 0.3, "round-transition"),
    soundCue(rounds.columns[2]!, "all-in"),
    soundCue(rounds.leap, "vote-reveal"),
    // The close.
    soundCue(finale.wins, "winner-reveal"),
    // The last word lands first, then the room erupts.
    crowd(b.wordEnd("outro", "sloppy!") - 0.05, "cheer", 0.8),
  ];
}

export const scene: TutorialScene = { Scene, sounds, preload: () => crowdBank.preload() };
