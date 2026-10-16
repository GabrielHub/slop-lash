"use client";

import { useCues } from "@/tutorial/clock";
import { soundCue } from "@/tutorial/kit";
import type { SoundCue, TutorialScene } from "@/tutorial/spec";
import type { Cues } from "@/tutorial/timeline";
import { VoiceDock } from "./friend";
import { Backdrop, HeartIris, Shot } from "./fx";
import { MeetShot } from "./shots/meet";
import { MoodShot } from "./shots/mood";
import { OutroShot } from "./shots/outro";
import { ScoreShot, TOTAL_POINT } from "./shots/score";
import { VoteShot } from "./shots/vote";
import { WriteShot } from "./shots/write";

/**
 * MatchSlop's how-to-play: a voice note from the match's best friend, vetting
 * the group before anyone texts. Her note plays docked in the corner; the
 * rules arrive as what she sends. Every beat keys off the voice (`useCues`),
 * so a new recording re-times it all. Chapters cut through a heart iris.
 */

/**
 * Each chapter's cut: the iris is fully closed a breath before its first line.
 * The outro's cut is the exception: it lands just after "Five", so the score's
 * red total gets a beat to read before the iris closes on it.
 */
function cutsOf(cues: Cues) {
  const cut = (id: string) => cues.at(id) - 0.12;
  return {
    write: cut("write"),
    vote: cut("vote"),
    react: cut("react"),
    points: cut("points"),
    outro: cues.word("outro", "five") + 0.3,
  };
}

function Scene() {
  const cues = useCues();
  const cuts = cutsOf(cues);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Backdrop />
      <Shot from={0} to={cuts.write}>
        <MeetShot />
      </Shot>
      <Shot from={cuts.write} to={cuts.vote}>
        <WriteShot />
      </Shot>
      <Shot from={cuts.vote} to={cuts.react}>
        <VoteShot />
      </Shot>
      <Shot from={cuts.react} to={cuts.points}>
        <MoodShot />
      </Shot>
      <Shot from={cuts.points} to={cuts.outro}>
        <ScoreShot />
      </Shot>
      <Shot from={cuts.outro} to={cues.duration + 1}>
        <OutroShot />
      </Shot>
      <HeartIris at={cuts.write} />
      <HeartIris at={cuts.vote} />
      <HeartIris at={cuts.react} />
      <HeartIris at={cuts.points} />
      <HeartIris at={cuts.outro} close={0.45} origin={TOTAL_POINT} to={{ x: 960, y: 480 }} />
      <VoiceDock />
    </div>
  );
}

function sounds(cues: Cues): SoundCue[] {
  const cuts = cutsOf(cues);
  return [
    soundCue(0.15, "phase-transition"),
    soundCue(cues.word("intro", "once") + 0.04, "stamp-slam"),
    soundCue(cuts.write - 0.35, "round-transition"),
    soundCue(cues.word("write", "phone") + 0.05, "submitted"),
    soundCue(cues.word("opener", "something"), "prompt-advance"),
    soundCue(cues.word("opener", "replying") - 0.1, "chat-receive"),
    soundCue(cuts.vote - 0.35, "round-transition"),
    soundCue(cues.word("vote", "vote") + 0.62, "vote-cast"),
    soundCue(cues.word("double", "double"), "vote-reveal"),
    soundCue(cuts.react - 0.35, "round-transition"),
    soundCue(cues.at("react") - 0.1, "chat-send"),
    soundCue(cues.word("react", "and"), "chat-receive"),
    soundCue(cues.word("react", "dealbreaker") + 0.02, "stamp-slam"),
    soundCue(cues.word("date", "date") + 0.03, "celebration"),
    soundCue(cues.word("unmatch", "unmatch") + 0.08, "stamp-slam"),
    soundCue(cues.word("unmatch", "unless") + 0.05, "round-start"),
    soundCue(cues.word("unmatch", "wins") + 0.62, "winner-reveal"),
    soundCue(cuts.points - 0.35, "round-transition"),
    soundCue(cues.word("points", "vote") + 0.65, "vote-reveal"),
    soundCue(cues.word("points", "sent") + 0.03, "stamp-slam"),
    soundCue(cuts.outro - 0.35, "phase-transition"),
    soundCue(cues.word("outro", "i'll") - 0.05, "game-start"),
  ];
}

export const scene: TutorialScene = { Scene, sounds };
