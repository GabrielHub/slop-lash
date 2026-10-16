import { createSoundBank } from "@/lib/sounds";

/** The studio audience, fetched only when the SlopLash tutorial plays. */
export const crowdBank = createSoundBank("sloplash-tutorial", {
  /** 3.5 s: cheers, then applause, from the first frame. */
  applause: { src: "/tutorials/sloplash/crowd-applause.mp3" },
  /** 2.5 s: the laugh itself starts about 0.5 s in. */
  laugh: { src: "/tutorials/sloplash/crowd-laugh.mp3" },
  /** 1.8 s: a gasp and an "ooh". */
  ooh: { src: "/tutorials/sloplash/crowd-ooh.mp3" },
  /** 4.5 s: the big finale cheer. */
  cheer: { src: "/tutorials/sloplash/crowd-cheer.mp3" },
});

/** Seconds of lead-in before the laugh file's laugh. */
export const LAUGH_LEAD = 0.45;
