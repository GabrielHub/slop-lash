"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { SPRING, TRAVEL } from "@/lib/animations";
import { formatPoints, ordinal } from "@/lib/format";
import { useModeView, usePlayers, useRoom } from "@/room/context";
import { useMoment } from "@/room/moment";
import { computeAwards, displayAwards } from "../awards";
import { COLUMN_AT, phoneFinalCues } from "./cues";
import { podiumOf } from "./data";
import { PhoneScreen, WaitingScreen } from "./phone-parts";

/**
 * FINISHED on a phone: the personal payoff. My placement flips in on my
 * podium beat, a winner's phone floods gold, and my award rises when the TV
 * reels it.
 */
export function PhoneFinal() {
  const { view } = useRoom();
  const { players } = usePlayers();
  const mode = useModeView("SLOPLASH");
  const me = players.find((player) => player.id === view.me?.playerId);
  const podium = useMemo(() => podiumOf(players), [players]);
  const entry = podium.ranked.find((ranked) => ranked.player.id === me?.id);
  const rank = entry?.rank ?? 0;
  const onPodium = podium.positions.some((ranked) => ranked.player.id === me?.id);
  const beatAt = onPodium ? COLUMN_AT[Math.min(3, rank) as 1 | 2 | 3] : COLUMN_AT[1];
  const wins = rank === 1 && !podium.soleAiWinner;
  const tied = podium.ranked.filter((ranked) => ranked.rank === rank).length > 1;
  const humans = podium.ranked.filter((ranked) => ranked.player.type === "HUMAN");
  const topHuman =
    podium.soleAiWinner &&
    me?.type === "HUMAN" &&
    humans[0] !== undefined &&
    humans[0].rank === rank;
  const awards = useMemo(
    () => displayAwards(computeAwards(mode.rounds, players)),
    [mode.rounds, players],
  );
  const awardIndex = awards.findIndex((award) => award.playerId === me?.id);
  const award = awardIndex >= 0 ? awards[awardIndex] : undefined;

  const cues = useMemo(
    () => phoneFinalCues({ at: beatAt, wins, award: awardIndex }),
    [beatAt, wins, awardIndex],
  );
  const moment = useMoment(cues.cues);
  const at = (name: keyof typeof cues.beat) => moment >= cues.beat[name];

  if (!me || !at("card")) {
    return <WaitingScreen />;
  }
  const won = wins && at("win");

  return (
    // Top-anchored with every slot reserved: neither the win line, the award
    // nor the shell finished bar arriving below can move the placement.
    <PhoneScreen
      anchor="top"
      className="relative isolate items-center gap-6 pt-[12vh] pb-8 text-center"
    >
      {won && (
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gold-soft"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      {wins && (
        <motion.p
          className="font-display text-5xl leading-tight font-black text-gold-ink"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={won ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
          transition={SPRING.pop}
          aria-hidden={!won}
        >
          {tied ? "You tied for 1st!" : "You win!"}
        </motion.p>
      )}
      <div style={{ perspective: 800 }}>
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={SPRING.pop}
        >
          <p
            className={`font-display text-[7rem] leading-none font-black ${rank === 1 ? "text-gold-ink" : "text-ink"}`}
          >
            {ordinal(rank)}
          </p>
          <p className="font-mono text-2xl text-ink-dim">{formatPoints(me.score)} points</p>
          {(tied || topHuman) && (
            <div className="flex items-center gap-2">
              {tied && (
                <span className="rounded-full bg-raised px-2 text-sm font-bold text-ink-dim">
                  Tied
                </span>
              )}
              {topHuman && (
                <span className="rounded-full bg-gold-soft px-2 text-sm font-bold text-gold-ink">
                  Top human
                </span>
              )}
            </div>
          )}
        </motion.div>
      </div>
      {award && (
        <motion.div
          key={award.kind}
          className="flex w-full items-center gap-4 rounded-2xl bg-raised p-4 text-left"
          initial={{ opacity: 0, y: TRAVEL.stage * 2 }}
          animate={at("award") ? { opacity: 1, y: 0 } : { opacity: 0, y: TRAVEL.stage * 2 }}
          transition={SPRING.smooth}
          aria-hidden={!at("award")}
        >
          <span className="text-5xl leading-none" aria-hidden="true">
            {award.icon}
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-ink">{award.title}</p>
            <p className="text-base text-ink-dim">{award.description}</p>
          </div>
        </motion.div>
      )}
    </PhoneScreen>
  );
}
