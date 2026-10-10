import { SoundLab } from "./sound-lab";

export const metadata = {
  title: "SlopFight sound",
};

/** Dev route: every SlopFight sound, loop and cue, a fight medley with the Voice, and a decode check. */
export default function DevSlopfightSoundPage() {
  return <SoundLab />;
}
