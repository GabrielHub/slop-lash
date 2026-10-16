"use client";

import { Sequence } from "@/tutorial/clock";
import type { PreviewSpot } from "@/tutorial/preview";
import { NIGHT, SlashWipe, loadFonts } from "../tutorial/look";
import { BrawlShot } from "./brawl";
import { FaceOffShot } from "./faceoff";
import { HookShot } from "./hook";
import { STAGE_TOKENS } from "./parts";
import { SlateShot } from "./slate";
import { DURATION, POSTER, SEAM, SHOTS } from "./times";

// SlopFight's host-page spot, a silent fight-night promo: a marker doodles a
// shark, the doodle pops into a toy, it faces off with a toaster, knocks it
// off the roof and into the sky, and the slate slams SLOPFIGHT. The game's
// slash covers the loop seam.

// The slam lettering is the game's own Fredoka. Registering it is idempotent
// and happens once when this chunk loads, never during a render.
if (typeof window !== "undefined") loadFonts();

function Scene() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: NIGHT, ...STAGE_TOKENS }}>
      <Sequence from={SHOTS.hook.from} to={SHOTS.hook.to}>
        <HookShot />
      </Sequence>
      <Sequence from={SHOTS.faceOff.from} to={SHOTS.faceOff.to}>
        <FaceOffShot />
      </Sequence>
      <Sequence from={SHOTS.brawl.from} to={SHOTS.brawl.to}>
        <BrawlShot />
      </Sequence>
      <Sequence from={SHOTS.slate.from} to={SHOTS.slate.to}>
        <SlateShot />
      </Sequence>
      {/* The seam: the slash covers the board at the loop point, from both sides of it. */}
      <Sequence from={DURATION - SEAM / 2}>
        <SlashWipe at={0} duration={SEAM} label="SlopFight" />
      </Sequence>
      <Sequence from={-SEAM / 2} to={SEAM / 2}>
        <SlashWipe at={0} duration={SEAM} label="SlopFight" />
      </Sequence>
    </div>
  );
}

export const spot: PreviewSpot = { Scene, duration: DURATION, poster: POSTER };
