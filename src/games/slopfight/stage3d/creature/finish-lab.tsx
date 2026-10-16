"use client";

// The finish lab (/dev/slopfight/finishes): finished creatures lined up on a
// real arena (the stage canvas, its moods, practicals and post), so each
// finish can be judged under the lighting it fights in.
//
//   ?arena=garage|kitchen|rooftop  ?set=all|mix|four|<recipe>  ?sample=<id>
//   ?page=<n>  ?per=<n> (a page, default 5)  ?zoom=<k> (camera distance, 1 = the row fits)
//   ?yaw=<deg> (default: a three-quarter turn toward the camera; ?spin=1 turns)
//   ?hits=1   finish hit layers every second at each creature (?live=1 sounds)
//   ?grow=1   the forge beat on a loop: parts land with their finish bursts
//   ?quality=high|medium|low  ?debug=1 (the stage's frame-time readout)
//
// window.__finishLab: ready, creatures, meshed, frameMs, p95, programs, calls.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { ARENA_IDS, type ArenaId } from "../../arenas";
import { sfx } from "../../audio";
import { partFinish } from "../../finishes";
import type { Champion, Part } from "../../sheet";
import { anchorFor } from "../director/anchors";
import { sparkColors } from "../fight/conduct";
import { FightFx, FxSystem } from "../fight/fx";
import { parseQualityParam, type QualityTier } from "../look/quality";
import { useArenaNodes, useCreateStageServices, useStage, type StageServices } from "../services";
import { StageCanvas } from "../stage-canvas";
import { standaloneStageInput } from "../stage-input";
import { createDriver, type CreatureDriver } from "./animator";
import { Creature, type CreatureEvent } from "./creature";
import { FINISH_HIT_SOUND, FINISH_LAND_SOUND } from "./finish-look";
import { finishSet, type FinishVariant } from "./finish-recipes";

const ARENA_ALIASES: Record<string, ArenaId> = { garage: "FLOODED_GARAGE", kitchen: "KITCHEN_COUNTER", rooftop: "ROOFTOP" };
const PAGE = 5;
const SPACING = 1.25;

interface LabParams {
  arena: ArenaId;
  set: string | null;
  sample: string | null;
  page: number;
  per: number;
  zoom: number;
  yaw: number | null;
  spin: boolean;
  hits: boolean;
  grow: boolean;
  live: boolean;
  quality: QualityTier | null;
  debug: boolean;
}

function readParams(): LabParams {
  const q = new URLSearchParams(window.location.search);
  const arenaParam = q.get("arena") ?? "garage";
  const number = (name: string) => (q.get(name) !== null && Number.isFinite(Number(q.get(name))) ? Number(q.get(name)) : null);
  return {
    arena: ARENA_ALIASES[arenaParam] ?? ((ARENA_IDS as readonly string[]).includes(arenaParam) ? (arenaParam as ArenaId) : "FLOODED_GARAGE"),
    set: q.get("set"),
    sample: q.get("sample"),
    page: Math.max(1, number("page") ?? 1),
    per: Math.min(10, Math.max(1, Math.round(number("per") ?? PAGE))),
    zoom: Math.min(4, Math.max(0.2, number("zoom") ?? 1)),
    yaw: number("yaw"),
    spin: q.get("spin") === "1",
    hits: q.get("hits") === "1",
    grow: q.get("grow") === "1",
    live: q.get("live") === "1",
    quality: parseQualityParam(q),
    debug: q.get("debug") === "1",
  };
}

declare global {
  interface Window {
    __finishLab?: {
      ready: boolean;
      creatures: number;
      meshed: number;
      frameMs: number;
      p95: number;
      programs: number;
      calls: number;
      titles: string[];
    };
  }
}

const xOf = (i: number, count: number) => (i - (count - 1) / 2) * SPACING;

// Stage objects are mutated through these helpers from effects and frame
// callbacks, never during render (as in the creature lab).

/** Back along `forward` from `at` by `distance`, a little above. */
function aim(camera: PerspectiveCamera, at: Vector3, forward: Vector3, distance: number, fov: number) {
  camera.fov = fov;
  camera.position.copy(at).addScaledVector(forward, -distance);
  camera.position.y = at.y + distance * 0.22;
  camera.lookAt(at);
  camera.updateProjectionMatrix();
}

function holdStill(services: StageServices) {
  services.director.driftScale = 0;
}

function turnAll(drivers: readonly CreatureDriver[], by: number) {
  for (const driver of drivers) driver.yaw += by;
}

/** The lineup's camera: the arena's fight-wide angle, pulled back until the row fits. */
function LineupCamera({ count, zoom }: { count: number; zoom: number }) {
  const nodes = useArenaNodes();
  const size = useThree((state) => state.size);
  const pose = useMemo(() => {
    const anchor = anchorFor(nodes, "Cam_FightWide");
    const forward = new Vector3().subVectors(anchor.target, anchor.position);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    return { forward, fov: 30 };
  }, [nodes]);
  const target = useMemo(() => new Vector3(0, 0.5, 0.2), []);
  // After the director (0.5), before the post pass renders.
  useFrame((state) => {
    const aspect = size.width / Math.max(1, size.height);
    const half = (count * SPACING) / 2 + 0.4;
    const hFov = 2 * Math.atan(Math.tan((pose.fov * Math.PI) / 180 / 2) * aspect);
    const distance = Math.max(3.2, half / Math.tan(hFov / 2)) * zoom;
    aim(state.camera as PerspectiveCamera, target, pose.forward, distance, pose.fov);
  }, 0.75);
  return null;
}

/** Frame time, programs and draw calls for scripted checks. */
function Meter({ titles, meshed }: { titles: string[]; meshed: React.MutableRefObject<Set<number>> }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef<number[]>([]);
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (last.current) {
      frames.current.push(now - last.current);
      if (frames.current.length > 240) frames.current.shift();
    }
    last.current = now;
    if (frames.current.length % 15 !== 0) return;
    const sorted = [...frames.current].sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    window.__finishLab = {
      ready: meshed.current.size >= titles.length,
      creatures: titles.length,
      meshed: meshed.current.size,
      frameMs: +avg.toFixed(2),
      p95: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2),
      programs: gl.info.programs?.length ?? 0,
      calls: gl.info.render.calls,
      titles,
    };
  }, 2);
  return null;
}

/** A champion's parts, `count` of them, for the growth loop. */
function grown(champion: Champion, count: number): Part[] {
  return champion.parts.slice(0, count);
}

function Lineup({ variants, params }: { variants: FinishVariant[]; params: LabParams }) {
  const services = useStage();
  const fx = useMemo(() => new FxSystem(), []);
  const meshed = useRef(new Set<number>());
  const nodes = useArenaNodes();
  const drivers = useMemo(() => {
    // Face the lineup camera, turned a little to show a side (?yaw= adds to it).
    const anchor = anchorFor(nodes, "Cam_FightWide");
    const toward = Math.atan2(anchor.position.x - anchor.target.x, anchor.position.z - anchor.target.z);
    const turn = params.yaw !== null ? (params.yaw * Math.PI) / 180 : 0.3;
    return variants.map((_, i) => {
      const x = xOf(i, variants.length);
      return createDriver([x, 0, 0], toward + turn - x * 0.06);
    });
  }, [variants, params.yaw, nodes]);
  const [step, setStep] = useState(0);
  const clock = useRef(0);
  const nextHit = useRef(1);
  const hitIndex = useRef(0);
  const maxParts = Math.max(...variants.map((v) => v.champion.parts.length));

  useEffect(() => holdStill(services), [services]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    clock.current += dt;
    if (params.spin) turnAll(drivers, dt * 0.5);
    if (params.grow) {
      // A part every 0.3 s, a beat with the body complete, then again.
      const cycle = maxParts * 0.3 + 2.4;
      const t = clock.current % cycle;
      const next = Math.min(maxParts + 1, Math.floor(t / 0.3) + 1);
      if (next !== step) setStep(next);
    }
    if (params.hits && clock.current > nextHit.current) {
      nextHit.current = clock.current + 1;
      variants.forEach((variant, i) => {
        // Each creature's finished parts in turn (vinyl ones show nothing).
        const finishes = [...new Set(variant.champion.parts.map(partFinish))].filter((f) => f !== "vinyl");
        const finish = finishes[hitIndex.current % Math.max(1, finishes.length)];
        if (!finish) return;
        const point = new Vector3(xOf(i, variants.length) + 0.25, 0.55, 0.35);
        const palette = { primary: variant.champion.palette.primary, secondary: variant.champion.palette.secondary, accent: variant.champion.palette.accent };
        fx.spark(point, { colors: sparkColors(palette), strength: 0.6 });
        fx.finishHit(point, finish, { colors: sparkColors(palette), strength: 0.6, big: hitIndex.current % 4 === 3 });
        const sound = FINISH_HIT_SOUND[finish];
        if (params.live && sound && i === 0) sfx.play(sound.name, { intensity: sound.intensity, gain: sound.gain });
      });
      hitIndex.current += 1;
    }
  });

  const onEvent = (i: number) => (event: CreatureEvent) => {
    if (event.kind === "meshed") meshed.current.add(i);
    if (params.live && event.kind === "partLanded" && i === 0) {
      sfx.play("partPop", { intensity: 0.4, gain: 0.7 });
      const sound = event.part.finish ? FINISH_LAND_SOUND[event.part.finish] : null;
      if (sound) sfx.play(sound.name, { intensity: sound.intensity, gain: sound.gain });
    }
  };

  return (
    <>
      <LineupCamera count={variants.length} zoom={params.zoom} />
      <Meter titles={variants.map((v) => v.title)} meshed={meshed} />
      <FightFx system={fx} />
      {variants.map((variant, i) => {
        const growing = params.grow && step <= variant.champion.parts.length;
        return (
          <Creature
            key={variant.id}
            {...(growing
              ? {
                  parts: grown(variant.champion, step),
                  bodyPlan: variant.champion.bodyPlan,
                  palette: variant.champion.palette,
                  face: null,
                  heft: variant.champion.stats.heft,
                  complete: false,
                }
              : { champion: variant.champion })}
            driver={drivers[i]}
            seed={i + 1}
            onEvent={onEvent(i)}
          />
        );
      })}
    </>
  );
}

/** Plain DOM name chips along the bottom (dev only). */
function Labels({ variants }: { variants: FinishVariant[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-around px-6">
      {variants.map((v) => (
        <div key={v.id} className="rounded-md bg-black/55 px-2 py-0.5 font-mono text-[12px] text-white">
          {v.title}
        </div>
      ))}
    </div>
  );
}

export default function FinishLab() {
  const [params] = useState(readParams);
  const services = useCreateStageServices({ clockOffsetMs: 0, quality: params.quality });
  const variants = useMemo(() => {
    const all = finishSet(params.set, params.sample);
    const start = (params.page - 1) * params.per;
    return all.slice(start, start + params.per);
  }, [params]);
  const input = useMemo(() => standaloneStageInput({ phase: "FIGHT", arena: params.arena }), [params.arena]);
  return (
    <StageCanvas
      input={input}
      quality={params.quality}
      debug={params.debug}
      services={services}
      scene={<Lineup variants={variants} params={params} />}
      overlay={<Labels variants={variants} />}
    />
  );
}
