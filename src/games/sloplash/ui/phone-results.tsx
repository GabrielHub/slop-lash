"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { pop } from "@/lib/animations";
import { formatPoints, ordinal } from "@/lib/format";
import { useModeView, usePlayers, useRoom } from "@/room/context";
import { useMoment, useReducedAfterMount } from "@/room/moment";
import { CrownDrop } from "./crown-drop";
import { phoneResultsCues } from "./cues";
import { plus, roundStandings } from "./data";
import { PhoneScreen, WaitingScreen } from "./phone-parts";

/** ROUND_RESULTS on a phone: what I earned this round, then where that puts me. */
export function PhoneRoundResults() {
  const { view } = useRoom();
  const { room } = view;
  const { players } = usePlayers();
  const mode = useModeView("SLOPLASH");
  const reduced = useReducedAfterMount();
  const me = players.find((player) => player.id === view.me?.playerId);

  const { gainOf, before, after } = roundStandings(players, mode.round);
  const gain = me ? gainOf(me) : 0;
  const rank = after.find((entry) => entry.player.id === me?.id)?.rank ?? 0;
  const previous = before.find((entry) => entry.player.id === me?.id)?.rank ?? rank;
  const tied = after.filter((entry) => entry.rank === rank).length > 1;
  const change = room.round > 1 ? previous - rank : 0;

  const improved = change > 0;
  const leader = rank === 1;
  const cues = useMemo(() => phoneResultsCues({ improved, leader }), [improved, leader]);
  const moment = useMoment(cues.cues);
  const at = (name: keyof typeof cues.beat) => moment >= cues.beat[name];

  if (!me || !at("gain")) {
    return <WaitingScreen />;
  }

  return (
    <PhoneScreen className="items-center gap-8 pb-16 text-center">
      <motion.div
        className="flex flex-col items-center"
        variants={pop}
        initial="hidden"
        animate="visible"
      >
        <p
          className={`font-mono text-6xl font-black tabular-nums ${gain > 0 ? "text-gold-ink" : "text-ink-dim"}`}
        >
          {plus(gain)}
        </p>
        <p className="text-xl text-ink-dim">this round</p>
      </motion.div>
      {/* Always laid out (hidden until its beat), so the gain above never jumps. */}
      <motion.div
        className="flex flex-col items-center gap-2"
        variants={pop}
        initial="hidden"
        animate={at("ordinal") ? "visible" : "hidden"}
        aria-hidden={!at("ordinal")}
      >
        <div className="relative">
          <CrownDrop
            show={at("crown") && rank === 1}
            reduced={reduced}
            className="absolute -top-[2.4rem] left-1/2 -translate-x-1/2"
            iconClassName="size-[3rem]"
          />
          <p className="font-display text-[5rem] leading-none font-black text-ink">
            {ordinal(rank)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tied && (
            <span className="rounded-full bg-raised px-2 text-sm font-bold text-ink-dim">Tied</span>
          )}
          {change > 0 && <span className="text-lg font-bold text-teal">▲{change}</span>}
          {change < 0 && <span className="text-lg font-bold text-punch">▼{-change}</span>}
        </div>
        {me.score !== gain && (
          <p className="text-xl text-ink-dim">{formatPoints(me.score)} points</p>
        )}
      </motion.div>
    </PhoneScreen>
  );
}
