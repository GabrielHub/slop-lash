"use client";

import { motion } from "motion/react";
import { countdownTone, TONE_CLASSES, usePhaseCountdown } from "@/room/timer";
import { sceneItem } from "@/lib/animations";
import { useModeView, useRoom } from "@/room/context";
import { DoneTracker } from "@/room/parts";
import { pointsPerVote } from "../scoring";
import { formatPoints } from "@/lib/format";

/**
 * WRITING on the TV: one instruction, the round's rule, the seconds left as a
 * hero number, and who is done. Nothing else.
 */
export function StageWriting() {
  const { room } = useRoom().view;
  const mode = useModeView("SLOPLASH");
  const countdown = usePhaseCountdown();
  const boosted = room.round >= 2;

  return (
    <div className="@container flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.5rem] px-[3rem] py-[2.5rem]">
      <motion.h1
        variants={sceneItem}
        className="text-center font-display text-5xl leading-tight font-black text-balance text-ink @4xl:text-6xl"
      >
        Write on your phone
      </motion.h1>
      <motion.p
        variants={sceneItem}
        className={`text-center text-2xl @4xl:text-3xl ${boosted ? "font-bold text-gold-ink" : "text-ink-dim"}`}
      >
        Every vote = {formatPoints(pointsPerVote(room.round))} points
      </motion.p>
      {!countdown.untimed && (
        <motion.div variants={sceneItem} className="flex h-[8rem] items-center" role="timer">
          {countdown.expired ? (
            <span className="font-display text-8xl leading-none font-black text-fail">Time!</span>
          ) : (
            <span
              key={countdown.remaining <= 10 ? countdown.remaining : "steady"}
              className={`inline-block font-mono text-9xl leading-none font-black tabular-nums ${
                TONE_CLASSES[countdownTone(countdown.remaining)].text
              } ${countdown.remaining <= 10 ? "animate-tick" : ""}`}
            >
              {countdown.remaining}
            </span>
          )}
        </motion.div>
      )}
      <motion.div variants={sceneItem} className="w-full">
        <DoneTracker size="couch" doneIds={mode.writing?.finishedPlayerIds ?? []} />
      </motion.div>
    </div>
  );
}
