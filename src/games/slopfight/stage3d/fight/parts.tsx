"use client";

// Small pieces the fight scenes share: the marquee line, the base shot that
// survives the phase's entry cover, two champions standing on their marks,
// and the judges' coin flip for a fight the seed decided.

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, type Group } from "three";
import { ARENAS, type ArenaId } from "../../arenas";
import { sfx } from "../../audio";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { TOY_COLOR_VALUES } from "../../vocab";
import type { ArenaNodes } from "../arena/nodes";
import { Creature, createDriver, type CreatureDriver } from "../creature/creature";
import type { ShotRequest } from "../director/director";
import type { ShotId } from "../director/shots";
import { MarqueeSign } from "../scenes/phase-scene";
import { useArenaNodes, useStage } from "../services";
import { discGeometry } from "../ui3d/geometry";
import { UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { StageText } from "../ui3d/text";
import { sheetsOf, type FightFeed, type FightRow } from "./feed";
import { STAGE_SPECULAR_MIN_LIGHT } from "./fighters";

/** Fights whose method slam already played on this stage (RESULT slams it otherwise). */
export const methodSlammed = new Set<string>();

export function FightMarquee({ nodes, text }: { nodes: ArenaNodes | null; text: string }) {
  return <MarqueeSign nodes={nodes} text={text} />;
}

/**
 * Set the phase's base shot with live targets. The stage mounts a phase's
 * scene at its entry's covered moment, right after its own target-less cut,
 * so the shot goes in at once; a scene mounted while a transition is still
 * covering waits for its cover. Returns `supersede()`: call it before the
 * scene cuts to a later base shot of its own, so a pending fallback never
 * cuts back over it.
 */
export function useBaseShot(shot: ShotId, request: ShotRequest): () => void {
  const services = useStage();
  const ref = useRef(request);
  useEffect(() => {
    ref.current = request;
  }, [request]);
  // Once per mounted scene: a Suspense boundary hiding and re-showing the
  // scene re-runs its effects, and must not cut back to the phase's first
  // shot over a later one (RESULT's scoreboard).
  const applied = useRef<ShotId | null>(null);
  const superseded = useRef(false);
  useEffect(() => {
    if (applied.current === shot || superseded.current) return;
    const { director, events, transitions } = services;
    let done = false;
    const apply = () => {
      if (done) return;
      done = true;
      off();
      if (superseded.current) return;
      applied.current = shot;
      director.setBase(shot, ref.current, true);
    };
    const off = events.on("transition", ({ phase }) => {
      if (phase === "cover") apply();
    });
    if (!transitions.isCovering()) apply();
    const timer = window.setTimeout(apply, 2_500);
    return () => {
      done = true;
      off();
      window.clearTimeout(timer);
    };
  }, [services, shot]);
  return useCallback(() => {
    superseded.current = true;
  }, []);
}

/** Where each side stands at t = 0 (the sim's spawns), facing the other. */
export function spawnOf(arena: ArenaId, side: Side): { position: [number, number, number]; yaw: number } {
  const spawn = ARENAS[arena].geometry.spawns[side];
  return { position: [spawn[0], spawn[1], spawn[2]], yaw: side === "A" ? Math.PI / 2 : -Math.PI / 2 };
}

/** A roster mark (slot 0..3) from the set, else a spread along the front. */
export function rosterMarkOf(nodes: ArenaNodes | null, slot: number | null): [number, number, number] | null {
  if (slot === null) return null;
  const mark = nodes?.marks.roster[slot];
  if (mark) return [mark.position.x, 0, mark.position.z];
  return [-2.25 + 1.5 * slot, 0, 0.4];
}

/**
 * Two champions idling: on their spawn marks facing each other (the default),
 * or on roster marks 0 and 1 facing the camera (the fight lab's roster lead-in).
 */
export function StandingFighters({
  arena,
  sheets,
  marks = "spawn",
}: {
  arena: ArenaId;
  sheets: { A: Champion; B: Champion };
  marks?: "spawn" | "roster";
}) {
  const nodes = useArenaNodes();
  const drivers = useMemo<Record<Side, CreatureDriver>>(() => {
    const place = (side: Side) => {
      if (marks === "roster") return createDriver(rosterMarkOf(nodes, side === "A" ? 0 : 1) ?? spawnOf(arena, side).position, 0);
      const spawn = spawnOf(arena, side);
      return createDriver(spawn.position, spawn.yaw);
    };
    return { A: place("A"), B: place("B") };
  }, [arena, marks, nodes]);
  return (
    <>
      <Creature champion={sheets.A} driver={drivers.A} seed={11} specularMinLight={STAGE_SPECULAR_MIN_LIGHT} />
      <Creature champion={sheets.B} driver={drivers.B} seed={23} specularMinLight={STAGE_SPECULAR_MIN_LIGHT} />
    </>
  );
}

/**
 * The judges flip a coin: a fight with no simulation to show (the server sim
 * failed twice, so the seed decided it). A big coin in the two champions'
 * colours spins between them; in RESULT it lands on the winner's face.
 */
/** Seconds after the coin appears (in RESULT) until it lands on the winner's face. */
export const COIN_LAND_S = 1.8;

export function CoinFlip({ feed, fight, phase, live }: { feed: FightFeed; fight: FightRow; phase: "FIGHT" | "RESULT"; live: boolean }) {
  const sheets = sheetsOf(feed, fight);
  const coin = useRef<Group>(null);
  const services = useStage();
  const state = useRef({ t: 0, landed: false, ticks: 0 });
  const winner = phase === "RESULT" ? (fight.outcome?.winner ?? null) : null;
  // The verdict reads only once the coin has landed on it.
  const [said, setSaid] = useState(false);
  const colorA = sheets.A ? TOY_COLOR_VALUES[sheets.A.palette.primary].hex : UI_COLORS.tomato;
  const colorB = sheets.B ? TOY_COLOR_VALUES[sheets.B.palette.primary].hex : UI_COLORS.gold;
  useBaseShot("fight_wide", { targets: [] });
  useFrame((_, realDelta) => {
    const node = coin.current;
    if (!node) return;
    const s = state.current;
    s.t += realDelta;
    const landing = winner !== null && s.t > COIN_LAND_S;
    if (landing && !s.landed) {
      s.landed = true;
      setSaid(true);
      services.director.shake(0.35);
      services.cheer(0.8);
      if (live) sfx.play("slam", { intensity: 0.7 });
    }
    if (!landing && live && Math.floor(s.t * 6) > s.ticks) {
      s.ticks = Math.floor(s.t * 6);
      sfx.play("tap", { intensity: 0.3 });
    }
    // Spin up into the air, then (in RESULT) settle on the winner's face.
    const flight = Math.min(1, s.t / 0.5);
    const height = landing ? MathUtils.lerp(node.position.y, 1.15, 1 - Math.exp(-realDelta * 10)) : 1.3 + 0.35 * Math.sin(s.t * 2.4) * flight;
    node.position.set(0, height, 0.2);
    if (landing) {
      const face = winner === "A" ? Math.PI / 2 : -Math.PI / 2;
      node.rotation.x = MathUtils.damp(node.rotation.x, face, 8, realDelta);
      node.rotation.y = MathUtils.damp(node.rotation.y, 0, 8, realDelta);
    } else {
      node.rotation.x += realDelta * 13;
      node.rotation.y = Math.sin(s.t * 1.3) * 0.4;
    }
    node.scale.setScalar(Math.min(1, 0.2 + flight * 0.8));
  });
  const disc = discGeometry(0.42, 0.08);
  return (
    <>
      {sheets.A && sheets.B && <StandingFighters arena={fight.arena} sheets={{ A: sheets.A, B: sheets.B }} />}
      <group ref={coin}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={disc} material={uiToon(UI_COLORS.gold, { glow: 0.2, specular: 0.8 })} />
          <mesh geometry={disc} material={uiOutline(UI_COLORS.gold, 2.4)} />
        </group>
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} material={uiToon(colorA, { glow: 0.25 })}>
          <circleGeometry args={[0.32, 32]} />
        </mesh>
        <mesh position={[0, -0.045, 0]} rotation={[Math.PI / 2, 0, 0]} material={uiToon(colorB, { glow: 0.25 })}>
          <circleGeometry args={[0.32, 32]} />
        </mesh>
      </group>
      <StageText position={[0, 2.25, 0.2]} size={0.26} color={UI_COLORS.bone} outlineColor={UI_COLORS.plumEdge} outline={0.16} glow={0.25}>
        {winner && said ? `The coin says: ${winner === "A" ? (sheets.A?.name ?? "A") : (sheets.B?.name ?? "B")}` : "The judges flip a coin"}
      </StageText>
    </>
  );
}
