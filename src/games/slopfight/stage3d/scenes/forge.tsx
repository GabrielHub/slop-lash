"use client";

// One pedestal of the Foundry: everything from the forge starting to the
// champion standing there with its name card.
//
// - FORGING, no parts yet: the pre-growth beat. The pedestal powers up (a
//   glowing ring and a beam of light), a lump of toy clay forms, wobbles and
//   pulses brighter, sparks and puffs fly; for a drawing, the doodle comes
//   down from the rig into the beam (it lifted off its easel). It holds ~15 s
//   without looking stuck.
// - Parts are queued and popped at 4 a second (faster when a burst lands
//   all at once): the lump bursts into the torso and <Creature> grows part by
//   part (each with the part-pop ding), the body re-forms, eyes open last.
// - READY: the name card drops from the rig on its cable (ding), then the
//   sketch-to-champion beat for a drawing: the doodle floats beside the
//   creature for two seconds and dissolves into it (shimmer), and the
//   creature jiggles.
// - FAILED (or the Foundry parked on the host): a jam card on the pedestal.
// - A house champion gets a "House champion" plate.
// - UPGRADE: the old champion hops onto a crate beside the pedestal while the
//   new one forges on top.
//
// Beats already played survive a phase change (the scene remounts per
// phase) through a per-stage memory, so FOUNDRY does not replay BUILD's
// celebration.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, Vector3, type Group, type Mesh } from "three";
import { toVoiceFighter } from "../../narration";
import type { Champion, Part } from "../../sheet";
import type { ArenaNodes } from "../arena/nodes";
import { Creature, createDriver, type CreatureEvent, type CreatureHandle } from "../creature/creature";
import { createToonMaterial } from "../look/toon";
import { useStage, type StageServices } from "../services";
import type { StagePhase } from "../stage-input";
import { Card } from "../ui3d/card";
import { darkOf, lightOf, UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { clamp01, easeInOutCubic, easeOutCubic, ringDown, springTo1 } from "../ui3d/motion";
import { stageSfx } from "../ui3d/sound";
import { fitTextSize } from "../ui3d/text";
import { NamePlate } from "../ui3d/tokens";
import { cameraPoint, fighterColor, pedestalTop, yawToward } from "./common";
import { createBeamMaterial, createDoodleMaterial } from "./doodle-material";
import type { DoodleRaster } from "./doodle-texture";
import { Puffs, Sparks, type PuffsHandle, type SparksHandle } from "./fx";
import { pedestalCast, popInterval, settledForgeAtMount } from "./forge-plan";
import type { SceneFighter } from "./scene-data";

export { pedestalCast, popInterval, POP_RATE, POP_RATE_BURST } from "./forge-plan";

/** One empty parts list, so memos keyed on the parts stay put while nothing grows. */
const NO_PARTS: readonly Part[] = [];
/** Seconds the doodle floats beside the new champion before it dissolves. */
const SKETCH_HOLD_S = 2;
const DISSOLVE_S = 1.3;
export const STAGE_SPECULAR = 1.3;

export type ForgeBeat = "start" | "firstPart" | "complete" | "card" | "dissolve" | "failed";

interface ForgeMemoryEntry {
  shown: number;
  celebrated: boolean;
}

const memories = new WeakMap<StageServices, Map<string, ForgeMemoryEntry>>();

function forgeMemory(services: StageServices, key: string): ForgeMemoryEntry {
  let map = memories.get(services);
  if (!map) {
    map = new Map();
    memories.set(services, map);
  }
  let entry = map.get(key);
  if (!entry) {
    entry = { shown: 0, celebrated: false };
    map.set(key, entry);
  }
  return entry;
}

const lumpGeometry = new SphereGeometry(1, 28, 18);
const ringGeometry = new TorusGeometry(0.42, 0.035, 10, 48).rotateX(Math.PI / 2);
const beamGeometry = new CylinderGeometry(0.44, 0.5, 2.6, 32, 1, true).translate(0, 1.3, 0);
const doodleGeometry = new PlaneGeometry(0.86, 0.86);

export interface ForgePedestalProps {
  fighter: SceneFighter;
  nodes: ArenaNodes | null;
  phase: StagePhase;
  round: number;
  /** The fighter's doodle (DRAW inputs), shared with its easel. */
  doodle: DoodleRaster | null;
  /** The Foundry waits on the host's retry. */
  parked: boolean;
  onBeat?: (beat: ForgeBeat, fighter: SceneFighter) => void;
}

export function ForgePedestal({ fighter, nodes, phase, round, doodle, parked, onBeat }: ForgePedestalProps) {
  const services = useStage();
  const top = pedestalTop(nodes, fighter.slot);
  const camera = useMemo(() => cameraPoint(nodes, "Cam_Foundry", [1.4, 2.5, 1.6]), [nodes]);
  const yaw = yawToward(top, camera);
  const color = fighterColor(fighter);
  const { forging, old, current } = pedestalCast(fighter, phase, round);
  const failed = fighter.status === "FAILED" || (parked && fighter.status === "FORGING" && fighter.partial.length === 0);
  const drawn = fighter.inputKind === "DRAW" && !!doodle && fighter.strokes.length > 0;
  const forgeKey = `${fighter.id}:${fighter.forge?.version ?? fighter.version}:${fighter.forge?.startedAt ?? 0}`;
  const memory = forgeMemory(services, forgeKey);

  // Settled at mount: a forge that finished long ago (or already celebrated)
  // shows as done. Only that forge: the upgrade's new forge plays its reveal.
  const [settledKey] = useState(() =>
    settledForgeAtMount(forgeKey, {
      hasChampion: !!current,
      celebrated: memory.celebrated,
      startedAt: fighter.forge?.startedAt ?? 0,
      now: services.clock.now,
    }),
  );
  const settled = settledKey === forgeKey;
  if (settled && current) memory.celebrated = true;

  // The part queue.
  const target: readonly Part[] = forging ? fighter.partial : current && !settled ? current.parts : NO_PARTS;
  const [shown, setShown] = useState(() => (settled ? (current?.parts.length ?? 0) : Math.min(memory.shown, target.length)));
  const [final, setFinal] = useState<Champion | null>(() => (settled ? current : null));
  const [card, setCard] = useState(() => settled);
  const [sketch, setSketch] = useState<"none" | "hover" | "beside" | "dissolve" | "gone">(() => (settled ? "gone" : "none"));
  const beat = useRef(onBeat);
  beat.current = onBeat;

  // A new forge (a retry, the upgrade) starts the queue over.
  const lastKey = useRef(forgeKey);
  useEffect(() => {
    if (lastKey.current === forgeKey) return;
    lastKey.current = forgeKey;
    setShown(0);
    setFinal(null);
    setCard(false);
    setSketch("none");
  }, [forgeKey]);

  // Beats: forge start, failure.
  const wasForging = useRef(forging);
  useEffect(() => {
    if (forging && !wasForging.current) {
      beat.current?.("start", fighter);
      stageSfx(services).play("confirm", { intensity: 0.4, gain: 0.6 });
    }
    wasForging.current = forging;
  }, [forging, services, fighter]);
  useEffect(() => {
    if (failed) {
      beat.current?.("failed", fighter);
      stageSfx(services).play("trickBonk", { intensity: 0.5, gain: 0.6 });
    }
    // Only on the transition into failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // The doodle comes down into the beam when a drawing starts forging.
  useEffect(() => {
    if (drawn && (forging || (current && !settled)) && sketch === "none") setSketch("hover");
  }, [drawn, forging, current, settled, sketch]);

  const timers = useRef({ pop: 0, finalWait: 0, cardWait: 0, sketchT: 0, pulse: 0, lumpGone: -1, preT: 0 });
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useFrame(() => {
    const dt = services.clock.delta;
    const t = timers.current;
    // Pop the queue at a steady cadence.
    if (shownRef.current < target.length) {
      t.pop += dt;
      const interval = popInterval(target.length - shownRef.current);
      if (t.pop >= interval) {
        t.pop = 0;
        const next = shownRef.current + 1;
        shownRef.current = next;
        memory.shown = next;
        setShown(next);
        if (next === 1) {
          beat.current?.("firstPart", fighter);
          t.lumpGone = 0;
        }
      }
    }
    // The finished sheet: once every part is out, the final body, then the card.
    if (current && !final && shownRef.current >= current.parts.length) {
      t.finalWait += dt;
      if (t.finalWait > 0.35) {
        setFinal(current);
        beat.current?.("complete", fighter);
      }
    }
    if (final && !card) {
      t.cardWait += dt;
      if (t.cardWait > 1.1) setCard(true);
    }
  });

  const showLump = forging && shown === 0 && !failed;
  const growingParts = useMemo(() => target.slice(0, shown), [target, shown]);
  const showCreature = !!final || (shown > 0 && target.length > 0);
  const driver = useMemo(() => createDriver(top, yaw), [top[0], top[1], top[2], yaw]); // eslint-disable-line react-hooks/exhaustive-deps
  const creature = useRef<CreatureHandle>(null);
  const lit = forging || (!!current && !settled && !card) ? 1 : final ? 0.18 : 0;

  const onCreatureEvent = (event: CreatureEvent) => {
    const sfx = stageSfx(services);
    if (event.kind === "partLanded") sfx.play("partPop", { intensity: 0.35 + Math.random() * 0.2, gain: 0.7 });
    else if (event.kind === "reform") sfx.play("inflate", { intensity: 0.3, gain: 0.35 });
    else if (event.kind === "eyesOpen") sfx.play("boing", { intensity: 0.25, gain: 0.45 });
  };

  const say = () => {
    const champion = current ?? final;
    if (!champion) return;
    const voice = services.voice;
    const me = toVoiceFighter(champion, fighter.ownerName);
    const line =
      round > 1 && fighter.previous
        ? voice.voice.upgradeReveal(me, toVoiceFighter(fighter.previous, fighter.ownerName), fighter.slot, round)
        : voice.voice.forged(me, fighter.slot);
    if (line) voice.say(line);
  };

  const cardTitle = final?.name ?? current?.name ?? "";
  const cardBody = fighter.house ? "House champion" : `${fighter.ownerName ?? "Player"}'s champion`;

  return (
    <group>
      <PedestalPower top={top} color={color} level={lit} forging={showLump} />
      {showLump && <ClayLump top={top} color={color} startedAt={fighter.forge?.startedAt ?? null} />}
      {!showLump && shown > 0 && !final && <LumpBurst top={top} />}
      {showCreature && (
        <Creature
          ref={creature}
          {...(final ? { champion: final } : { parts: growingParts, palette: old?.palette ?? null, complete: false })}
          driver={driver}
          seed={fighter.slot + 3}
          specularMinLight={STAGE_SPECULAR}
          onEvent={onCreatureEvent}
        />
      )}
      {old && <OldChampion champion={old} top={top} yaw={yaw} leaving={!!final && card} />}
      {drawn && doodle && sketch !== "none" && sketch !== "gone" && (
        <HoverDoodle
          doodle={doodle}
          top={top}
          yaw={yaw}
          state={sketch}
          canDissolve={card}
          onDissolve={() => {
            setSketch("dissolve");
            beat.current?.("dissolve", fighter);
            stageSfx(services).play("sketchDissolve", { intensity: 0.6 });
          }}
          onBeside={() => setSketch("beside")}
          onGone={() => {
            setSketch("gone");
            memory.celebrated = true;
            creature.current?.jiggle(0.9);
            creature.current?.squash(0.25);
          }}
        />
      )}
      {final && (
        <Card
          position={[top[0] - Math.sin(yaw) * 0.1, top[1] + 1.72, top[2] - Math.cos(yaw) * 0.1]}
          rotation={[0, yaw, 0]}
          width={1.3}
          height={0.6}
          enter={card && !settled ? "drop" : "none"}
          leaving={!card}
          cable={3}
          accent={color}
          title={cardTitle}
          body={cardBody}
          titleSize={fitTextSize(cardTitle, 1.15, 0.15)}
          bodySize={0.11}
          sound={false}
          seed={fighter.slot}
          onBeat={(event) => {
            // A settled card mounts already hanging ("none" lands at once): no ding, cut or line.
            if (event !== "land" || settled) return;
            stageSfx(services).play("nameCardDing", { intensity: 0.6 });
            beat.current?.("card", fighter);
            say();
            if (!drawn) memory.celebrated = true;
          }}
        />
      )}
      {failed && (
        <Card
          position={[top[0] - Math.sin(yaw) * 0.15, top[1] + 1.25, top[2] - Math.cos(yaw) * 0.15]}
          rotation={[0, yaw, 0]}
          width={1.5}
          height={0.78}
          enter="drop"
          cable={3}
          accent={UI_COLORS.tomato}
          title="The Foundry jammed"
          body={"Host, retry from\nthe ⋯ menu"}
          titleSize={0.13}
          bodySize={0.11}
          seed={fighter.slot + 7}
        />
      )}
      {fighter.house && (
        <NamePlate
          name="House champion"
          color={UI_COLORS.gold}
          width={1.05}
          height={0.26}
          position={[top[0] - Math.sin(yaw) * 0.72, Math.max(0.2, top[1] - 0.32), top[2] - Math.cos(yaw) * 0.72]}
          rotation={[0, yaw, 0]}
          delay={0.2 + fighter.slot * 0.15}
          idle={0.4}
          seed={fighter.slot}
          sound={false}
        />
      )}
    </group>
  );
}

/** The glowing ring on the pedestal top and the beam of light above it. */
function PedestalPower({ top, color, level, forging }: { top: number[]; color: string; level: number; forging: boolean }) {
  const services = useStage();
  const ring = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const ringMaterial = useMemo(() => {
    const material = createToonMaterial({ vertexColors: false, color: lightOf(color, 0.3), emissive: color, specular: 0.6, rim: 0.4 });
    material.emissiveIntensity = 0;
    return material;
  }, [color]);
  const beamMaterial = useMemo(() => createBeamMaterial(lightOf(color, 0.35)), [color]);
  useEffect(
    () => () => {
      ringMaterial.dispose();
      beamMaterial.dispose();
    },
    [ringMaterial, beamMaterial],
  );
  const current = useRef(0);
  useFrame(() => {
    const dt = services.clock.realDelta;
    current.current += (level - current.current) * Math.min(1, dt * 1.6);
    const value = current.current;
    const pulse = forging ? 0.25 + 0.25 * Math.sin(services.clock.elapsed * 6) : 0;
    ringMaterial.emissiveIntensity = value * (0.9 + pulse);
    beamMaterial.uniforms.uIntensity.value = value * (0.42 + pulse * 0.4);
    beamMaterial.uniforms.uTime.value = services.clock.elapsed;
    if (ring.current) {
      ring.current.visible = value > 0.02;
      const s = 1 + pulse * 0.06;
      ring.current.scale.set(s, 1, s);
    }
    if (beam.current) beam.current.visible = value > 0.03;
  });
  return (
    <group position={[top[0], top[1], top[2]]}>
      <mesh ref={ring} geometry={ringGeometry} material={ringMaterial} position={[0, 0.03, 0]} visible={false} />
      <mesh ref={beam} geometry={beamGeometry} material={beamMaterial} visible={false} renderOrder={5} />
    </group>
  );
}

/** The pre-growth lump: a wobbling ball of toy clay that grows and pulses brighter, throwing sparks and puffs. */
function ClayLump({ top, color, startedAt }: { top: number[]; color: string; startedAt: number | null }) {
  const services = useStage();
  const lump = useRef<Group>(null);
  const sparks = useRef<SparksHandle>(null);
  const puffs = useRef<PuffsHandle>(null);
  const material = useMemo(() => {
    const m = createToonMaterial({ vertexColors: false, color: "#d9a07a", emissive: lightOf(color, 0.4), specular: 0.5, rim: 0.35, translucency: 0.45 });
    m.emissiveIntensity = 0.1;
    return m;
  }, [color]);
  const outline = uiOutline("#b0704a", 2.4);
  useEffect(() => () => material.dispose(), [material]);
  const state = useRef({ t: 0, nextPulse: 0.4, pulseT: 9, nextSpark: 0.2 });
  useFrame(() => {
    const group = lump.current;
    if (!group) return;
    const dt = services.clock.delta;
    const s = state.current;
    s.t += dt;
    // How far into the wait: the beat builds over ~15 s.
    const waited = startedAt !== null ? Math.max(0, (services.clock.now - startedAt) / 1000) : s.t;
    const build = clamp01(waited / 15);
    const appear = springTo1(s.t, 2.4, 0.4);
    const size = (0.12 + 0.12 * easeOutCubic(build)) * appear;
    // Pulses come faster as the forge goes on.
    s.nextPulse -= dt;
    if (s.nextPulse <= 0) {
      s.nextPulse = 1.6 - build * 0.9;
      s.pulseT = 0;
      puffs.current?.emit([top[0], top[1] + 0.05, top[2]], 4, { radius: 0.3, size: 0.07 + build * 0.04, rise: 0.6 });
      sparks.current?.emit([top[0], top[1] + 0.06, top[2]], 6 + Math.round(build * 8), { radius: 0.42, speed: 2 + build });
      stageSfx(services).play("inflate", { intensity: 0.2 + build * 0.3, gain: 0.22 });
    }
    s.pulseT += dt;
    s.nextSpark -= dt;
    if (s.nextSpark <= 0) {
      s.nextSpark = 0.18 + Math.random() * 0.3;
      sparks.current?.emit([top[0], top[1] + 0.05, top[2]], 1 + Math.round(build * 2), { radius: 0.42, speed: 1.6 });
    }
    const pulse = ringDown(s.pulseT, 0.22, 2.6, 5);
    const wobble = Math.sin(s.t * 7.3) * 0.06 + Math.sin(s.t * 11.1 + 1) * 0.04;
    group.scale.set(size * (1 + pulse * 0.6 + wobble), size * (1 - pulse * 0.5 - wobble), size * (1 + pulse * 0.6 - wobble * 0.5));
    group.position.set(top[0], top[1] + size * (1 - pulse * 0.5) * 0.95, top[2]);
    group.rotation.y += dt * (0.6 + build);
    material.emissiveIntensity = 0.12 + build * 0.5 + Math.max(0, pulse) * 2.2;
  });
  return (
    <>
      <group ref={lump}>
        <mesh geometry={lumpGeometry} material={material} castShadow />
        <mesh geometry={lumpGeometry} material={outline} />
      </group>
      <Sparks ref={sparks} capacity={48} />
      <Puffs ref={puffs} capacity={16} />
    </>
  );
}

/** The lump bursting into the first part: a ring of puffs and sparks, then it is gone. */
function LumpBurst({ top }: { top: number[] }) {
  const sparks = useRef<SparksHandle>(null);
  const puffs = useRef<PuffsHandle>(null);
  const services = useStage();
  useEffect(() => {
    puffs.current?.emit([top[0], top[1] + 0.15, top[2]], 9, { radius: 0.35, size: 0.14, rise: 0.9 });
    sparks.current?.emit([top[0], top[1] + 0.2, top[2]], 20, { radius: 0.2, speed: 3.2 });
    stageSfx(services).play("partPop", { intensity: 0.8 });
    // Once per burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Sparks ref={sparks} capacity={24} />
      <Puffs ref={puffs} capacity={10} />
    </>
  );
}

/** The old champion during an upgrade, standing on a crate beside the pedestal (smaller, then hops away). */
function OldChampion({ champion, top, yaw, leaving }: { champion: Champion; top: number[]; yaw: number; leaving: boolean }) {
  const services = useStage();
  // Beside the pedestal, toward the camera and to one side.
  const side = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const base: [number, number, number] = [top[0] - Math.sin(yaw) * 0.95 + side[0]! * 0.55, 0, top[2] - Math.cos(yaw) * 0.95 + side[2]! * 0.55];
  const crateHeight = 0.36;
  const driver = useMemo(() => createDriver([base[0], crateHeight, base[2]], yaw), []); // eslint-disable-line react-hooks/exhaustive-deps
  const group = useRef<Group>(null);
  const t = useRef(0);
  useFrame(() => {
    if (!group.current) return;
    if (leaving) t.current += services.clock.delta;
    const k = clamp01(t.current / 0.6);
    group.current.scale.setScalar(Math.max(0.0001, 1 - easeInOutCubic(k)));
    group.current.visible = k < 1;
  });
  return (
    <group ref={group}>
      <mesh position={[base[0], crateHeight / 2, base[2]]} rotation={[0, yaw, 0]} castShadow receiveShadow material={[uiToon("#b98a5a", { glow: 0.04 }), uiToon(darkOf("#b98a5a", 0.3))]}>
        <boxGeometry args={[0.62, crateHeight, 0.62]} />
      </mesh>
      <group position={[base[0], 0, base[2]]} scale={0.72}>
        <group position={[-base[0], 0, -base[2]]}>
          <Creature champion={champion} driver={driver} seed={41} specularMinLight={STAGE_SPECULAR} />
        </group>
      </group>
    </group>
  );
}

const tmpTarget = new Vector3();

/**
 * The doodle hovering in the beam: it comes down from the rig, bobs and
 * turns slowly; once the name card is down it floats beside the creature for
 * two seconds and dissolves into it.
 */
function HoverDoodle({
  doodle,
  top,
  yaw,
  state,
  canDissolve,
  onBeside,
  onDissolve,
  onGone,
}: {
  doodle: DoodleRaster;
  top: number[];
  yaw: number;
  state: "hover" | "beside" | "dissolve";
  canDissolve: boolean;
  onBeside: () => void;
  onDissolve: () => void;
  onGone: () => void;
}) {
  const services = useStage();
  const group = useRef<Group>(null);
  const material = useMemo(() => createDoodleMaterial(doodle.texture), [doodle]);
  useEffect(() => () => material.dispose(), [material]);
  const sparks = useRef<SparksHandle>(null);
  const motion = useRef({ t: 0, phaseT: 0, y: top[1] + 4.2, vy: 0, x: top[0], z: top[2], fired: false, done: false });
  const callbacks = useRef({ onBeside, onDissolve, onGone, canDissolve, state });
  useEffect(() => {
    callbacks.current = { onBeside, onDissolve, onGone, canDissolve, state };
  }, [onBeside, onDissolve, onGone, canDissolve, state]);
  const side = [Math.cos(yaw), 0, -Math.sin(yaw)];
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const dt = services.clock.delta;
    const m = motion.current;
    const cb = callbacks.current;
    m.t += dt;
    m.phaseT += dt;
    let targetX = top[0]!;
    let targetY = top[1]! + 1.75;
    let targetZ = top[2]!;
    if (cb.state === "hover" && cb.canDissolve) {
      cb.onBeside();
      m.phaseT = 0;
    }
    if (cb.state === "beside") {
      targetX = top[0]! - Math.sin(yaw) * 0.35 + side[0]! * 0.85;
      targetY = top[1]! + 0.75;
      targetZ = top[2]! - Math.cos(yaw) * 0.35 + side[2]! * 0.85;
      if (m.phaseT > SKETCH_HOLD_S) {
        cb.onDissolve();
        m.phaseT = 0;
      }
    }
    let scale = 1;
    if (cb.state === "dissolve") {
      const k = clamp01(m.phaseT / DISSOLVE_S);
      targetX = top[0]!;
      targetY = top[1]! + 0.55;
      targetZ = top[2]!;
      material.uniforms.uDissolve.value = easeInOutCubic(k);
      material.uniforms.uGlow.value = 0.25 * Math.sin(k * Math.PI);
      scale = 1 - 0.55 * easeInOutCubic(k);
      if (!m.fired && k > 0.15) {
        m.fired = true;
        g.getWorldPosition(tmpTarget);
        sparks.current?.emit([tmpTarget.x, tmpTarget.y, tmpTarget.z], 26, { radius: 0.3, speed: 1.6, color: "#ffe08a" });
      }
      if (k >= 1 && !m.done) {
        m.done = true;
        cb.onGone();
      }
    }
    // Springy follow (it floats, never snaps).
    const follow = 1 - Math.exp(-dt * (cb.state === "hover" ? 2.2 : 4));
    m.x += (targetX - m.x) * follow;
    m.z += (targetZ - m.z) * follow;
    // Vertical: a soft spring so the arrival from the rig overshoots and settles.
    const k = 18;
    const damping = 5.5;
    m.vy += ((targetY - m.y) * k - m.vy * damping) * dt;
    m.y += m.vy * dt;
    const bob = Math.sin(m.t * 1.7) * 0.05;
    g.position.set(m.x, m.y + bob, m.z);
    g.rotation.set(Math.sin(m.t * 1.3) * 0.08, yaw + Math.sin(m.t * 0.8) * 0.25, Math.sin(m.t * 1.1) * 0.06);
    g.scale.setScalar(scale);
  });
  return (
    <>
      <group ref={group}>
        <mesh geometry={doodleGeometry} material={material} castShadow />
      </group>
      <Sparks ref={sparks} capacity={32} />
    </>
  );
}
