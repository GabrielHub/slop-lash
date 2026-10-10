"use client";

// STANDINGS: the scoreboard shot (PhaseScene's base shot after the wipe).
// The board shows the round's results: rows slide from the order before the
// round into the new one, the points count up, the leader's row turns gold,
// and the champions walk along the shelf under the board into rank order.
// The Voice names the leader (or calls the tie). The crowd reacts as the
// rows land.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useStage } from "../services";
import { stageSfx } from "../ui3d/sound";
import { BOARD_COUNT_AT_S, BOARD_SLIDE_AT_S, BOARD_SLIDE_S, boardRows, standingsLeader } from "./board";
import { SceneMarquee, usePhaseSeconds, useSceneData } from "./common";
import type { PhaseSceneProps } from "./phase-scene";
import { Scoreboard } from "./scoreboard";

export function StandingsScene({ input, nodes }: PhaseSceneProps) {
  const services = useStage();
  const data = useSceneData();
  const phaseSeconds = usePhaseSeconds(input);
  const round = input.round;
  const rows = useMemo(() => (data ? boardRows(data, round) : []), [data, round]);
  const leader = standingsLeader(rows);

  useEffect(() => {
    const line = services.voice.voice.standings(round, leader);
    if (line) services.voice.say(line);
  }, [services, round, leader]);

  // The crowd reacts as the new order lands, and again when the count finishes.
  const cheered = useRef({ land: false, count: false });
  useFrame(() => {
    const t = phaseSeconds();
    if (!cheered.current.land && t >= BOARD_SLIDE_AT_S + BOARD_SLIDE_S) {
      cheered.current.land = true;
      if (t < BOARD_SLIDE_AT_S + BOARD_SLIDE_S + 1) services.cheer(0.35);
    }
    if (!cheered.current.count && t >= BOARD_COUNT_AT_S + 1.9) {
      cheered.current.count = true;
      if (t < BOARD_COUNT_AT_S + 3) stageSfx(services).play("hype", { intensity: 0.3, gain: 0.4 });
    }
  });

  return (
    <>
      <SceneMarquee nodes={nodes} text="STANDINGS" sub={`After round ${round}`} />
      <Scoreboard nodes={nodes} title={`STANDINGS · ROUND ${round}`} rows={rows} time={phaseSeconds} />
    </>
  );
}
