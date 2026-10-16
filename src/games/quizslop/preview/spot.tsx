"use client";

import { Sequence } from "@/tutorial/clock";
import type { PreviewSpot } from "@/tutorial/preview";
import { Show } from "./show";
import { Slate } from "./slate";
import { Backdrop, BroadcastWipe, OnAirBug, StageCurtain } from "./stage";
import { AT, DURATION, POSTER } from "./times";

/**
 * QuizSlop's host-page spot: the curtain parts on a trivia question, you bet
 * your friend Sam gets it wrong, he does, and the chip pays out to you. Then
 * the marquee, and the curtain shuts on the loop's seam.
 */
function Scene() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas">
      <Backdrop />
      <Sequence from={0} to={AT.slate} post={0.05}>
        <Show />
      </Sequence>
      <Sequence from={AT.slate} pre={0.02}>
        <Slate />
      </Sequence>
      <OnAirBug />
      <BroadcastWipe at={AT.wipe} />
      <StageCurtain />
    </div>
  );
}

export const spot: PreviewSpot = { Scene, duration: DURATION, poster: POSTER };
