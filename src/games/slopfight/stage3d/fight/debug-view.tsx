"use client";

// Fight sim debug viewer: plain capsules per physics proxy body, the arena's
// play boxes, a health readout and an event ticker. Query params:
// ?a=<sampleId>&b=<sampleId>&arena=<id>&seed=<n>&speed=1&t=<ms to skip to>&pause=1&cam=front|high|side
// Exposes window.__fight (tMs, done, events, live) for scripted screenshots.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Group } from "three";
import { ARENA_IDS, ARENAS, platformColliders, type ArenaId } from "../../arenas";
import { SAMPLES, sampleById } from "../../samples";
import type { Champion } from "../../sheet";
import { SIM_FIXTURES } from "../../sim/fixtures";
import {
  createFight,
  loadRapier,
  STEP_MS,
  type FightEvent,
  type FightSim,
  type FighterLayout,
  type FighterLive,
  type Side,
} from "../../sim";
import { TOY_COLOR_VALUES } from "../../vocab";

interface Params {
  a: string;
  b: string;
  arena: ArenaId;
  seed: number;
  speed: number;
  skipMs: number;
  pause: boolean;
  cam: [number, number, number];
}

const CAMERAS: Record<string, [number, number, number]> = {
  front: [0, 4.2, 7.4],
  high: [0, 8.5, 4.6],
  side: [7.6, 3.6, 0.01],
};

function readParams(): Params {
  const query = new URLSearchParams(window.location.search);
  const arena = query.get("arena") as ArenaId | null;
  return {
    a: query.get("a") ?? SAMPLES[0]!.id,
    b: query.get("b") ?? SAMPLES[1]!.id,
    arena: arena && ARENA_IDS.includes(arena) ? arena : "ROOFTOP",
    seed: Number(query.get("seed") ?? 1) >>> 0,
    speed: Number(query.get("speed") ?? 1),
    skipMs: Number(query.get("t") ?? 0),
    pause: query.get("pause") === "1",
    cam: CAMERAS[query.get("cam") ?? "front"] ?? CAMERAS.front!,
  };
}

function championFor(id: string): Champion {
  return sampleById(id)?.champion ?? SIM_FIXTURES.find((fixture) => fixture.id === id)?.champion ?? SAMPLES[0]!.champion;
}

interface HudState {
  tMs: number;
  done: boolean;
  live: Record<Side, FighterLive> | null;
  events: FightEvent[];
  result: string | null;
}

declare global {
  interface Window {
    __fight?: { tMs: number; done: boolean; events: FightEvent[]; live: Record<Side, FighterLive> | null };
  }
}

function Fighter({ sim, side, color }: { sim: FightSim; side: Side; color: string }) {
  const layout: FighterLayout = useMemo(() => sim.layout(side), [sim, side]);
  const refs = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const pose = sim.pose(side);
    pose.bodies.forEach((body, index) => {
      const group = refs.current[index];
      if (!group) return;
      group.position.set(body.p[0], body.p[1], body.p[2]);
      group.quaternion.set(body.q[0], body.q[1], body.q[2], body.q[3]);
    });
  });
  return (
    <>
      {layout.bodies.map((body, index) => (
        <group key={body.key} ref={(group) => void (refs.current[index] = group)}>
          {body.shapes.map((shape, shapeIndex) => {
            if (shape.kind === "ball") {
              return (
                <mesh key={shapeIndex} position={shape.center} castShadow>
                  <sphereGeometry args={[shape.radius, 16, 12]} />
                  <meshStandardMaterial color={index === 0 ? color : "#f3e9d8"} roughness={0.6} />
                </mesh>
              );
            }
            const dx = shape.b[0] - shape.a[0];
            const dy = shape.b[1] - shape.a[1];
            const dz = shape.b[2] - shape.a[2];
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const mid: [number, number, number] = [
              (shape.a[0] + shape.b[0]) / 2,
              (shape.a[1] + shape.b[1]) / 2,
              (shape.a[2] + shape.b[2]) / 2,
            ];
            // Rotate the capsule's +Y onto the segment.
            const nx = dx / (length || 1);
            const ny = dy / (length || 1);
            const nz = dz / (length || 1);
            const qx = nz;
            const qz = -nx;
            const qw = 1 + ny;
            const qn = Math.sqrt(qx * qx + qz * qz + qw * qw) || 1;
            const quaternion: [number, number, number, number] =
              qw < 1e-6 ? [1, 0, 0, 0] : [qx / qn, 0, qz / qn, qw / qn];
            return (
              <mesh key={shapeIndex} position={mid} quaternion={quaternion} castShadow>
                <capsuleGeometry args={[shape.radius, length, 6, 12]} />
                <meshStandardMaterial color={index === 0 ? color : "#f3e9d8"} roughness={0.6} />
              </mesh>
            );
          })}
        </group>
      ))}
    </>
  );
}

function Arena({ arena }: { arena: ArenaId }) {
  const boxes = useMemo(() => platformColliders(ARENAS[arena].geometry), [arena]);
  return (
    <>
      {boxes.map((box, index) => (
        <mesh
          key={index}
          position={[(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]}
          receiveShadow
        >
          <boxGeometry args={[box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]]} />
          <meshStandardMaterial color={index % 2 ? "#6b5a52" : "#75645b"} roughness={0.9} />
        </mesh>
      ))}
      <gridHelper args={[10, 20, "#3b2f37", "#3b2f37"]} position={[0, -0.6, 0]} />
    </>
  );
}

function Stepper({
  sim,
  params,
  initial,
  onHud,
}: {
  sim: FightSim;
  params: Params;
  initial: FightEvent[];
  onHud: (hud: HudState) => void;
}) {
  const acc = useRef(0);
  const events = useRef<FightEvent[]>(initial);
  const outroMs = useRef(0);
  const frames = useRef(0);
  useFrame((_, delta) => {
    if (!params.pause) {
      acc.current += Math.min(delta, 0.1) * 1000 * params.speed;
      let steps = 0;
      while (acc.current >= STEP_MS && steps < 12) {
        acc.current -= STEP_MS;
        steps += 1;
        if (sim.done) {
          outroMs.current += STEP_MS;
          if (outroMs.current > 3500) continue;
        }
        events.current.push(...sim.step());
      }
    }
    frames.current += 1;
    if (frames.current % 6 === 0 || sim.done) {
      const live = { A: sim.live("A"), B: sim.live("B") };
      const outcome = sim.outcome();
      const hud: HudState = {
        tMs: sim.tMs,
        done: sim.done,
        live,
        events: events.current.slice(-14),
        result: outcome ? `${outcome.winner} wins by ${outcome.method} at ${(outcome.endMs / 1000).toFixed(2)}s (hash ${outcome.hash})` : null,
      };
      window.__fight = { tMs: sim.tMs, done: sim.done, events: events.current, live };
      onHud(hud);
    }
  });
  return null;
}

/** The palette colour, or a light fallback when it would vanish on the dark background. */
function readable(hex: string): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const luminance = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  return luminance < 90 ? "#f5ead6" : hex;
}

function describe(event: FightEvent): string {
  const t = (event.t / 1000).toFixed(2);
  switch (event.kind) {
    case "hit":
      return `${t} ${event.side} hit ${event.type} m${event.move} -${event.damage} kb ${event.knockback}${event.big ? " BIG" : ""}${event.counter ? " counter" : ""}${event.miracle ? " MIRACLE" : ""}`;
    case "throw":
      return `${t} ${event.side} throw -${event.damage} kb ${event.knockback}`;
    case "whiff":
      return `${t} ${event.side} whiff ${event.type} (${event.reason})`;
    case "windup":
      return `${t} ${event.side} windup ${event.type} m${event.move}`;
    case "stagger":
      return `${t} ${event.side} stagger ${event.ms}ms (${event.cause})`;
    case "end":
      return `${t} END ${event.side} ${event.method}`;
    default:
      return `${t} ${event.side ?? "-"} ${event.kind}`;
  }
}

export default function FightDebugView() {
  const [params] = useState<Params>(() => readParams());
  const [sim, setSim] = useState<FightSim | null>(null);
  const [skipped, setSkipped] = useState<FightEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState>({ tMs: 0, done: false, live: null, events: [], result: null });
  const champions = useMemo(() => ({ A: championFor(params.a), B: championFor(params.b) }), [params]);

  useEffect(() => {
    let alive = true;
    let created: FightSim | null = null;
    loadRapier()
      .then((R) => {
        if (!alive) return;
        created = createFight(R, {
          seed: params.seed,
          arena: params.arena,
          a: champions.A,
          b: champions.B,
          notes: [],
          limitMs: 30_000,
        });
        const early: FightEvent[] = [];
        while (created.tMs < params.skipMs && !created.done) early.push(...created.step());
        setSkipped(early);
        setSim(created);
      })
      .catch((reason: unknown) => setError(String(reason)));
    return () => {
      alive = false;
      created?.dispose();
    };
  }, [params, champions]);

  const colorA = TOY_COLOR_VALUES[champions.A.palette.primary].hex;
  const colorB = TOY_COLOR_VALUES[champions.B.palette.primary].hex;
  const textA = readable(colorA);
  const textB = readable(colorB);

  return (
    <div className="absolute inset-0 bg-[#1d1419]">
      {sim && (
        <Canvas shadows camera={{ position: params.cam, fov: 42 }} onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}>
          <color attach="background" args={["#1d1419"]} />
          <hemisphereLight args={["#ffe2c4", "#2b1d26", 0.6]} />
          <directionalLight position={[4, 8, 5]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
          <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#9cc4ff" />
          <Arena arena={params.arena} />
          <Fighter sim={sim} side="A" color={colorA} />
          <Fighter sim={sim} side="B" color={colorB} />
          <Stepper sim={sim} params={params} initial={skipped} onHud={setHud} />
          <OrbitControls target={[0, 0.3, 0]} />
        </Canvas>
      )}
      <div className="pointer-events-none absolute top-0 left-0 flex w-full justify-between p-4 font-mono text-sm text-[#f5ead6]">
        {(["A", "B"] as const).map((side) => {
          const live = hud.live?.[side];
          const champion = champions[side];
          return (
            <div key={side} className={side === "B" ? "text-right" : ""} data-side={side}>
              <div className="text-base font-bold" style={{ color: side === "A" ? textA : textB }}>
                {side}: {champion.name} ({champion.bodyPlan}, H{champion.stats.heft} R{champion.stats.reach} C{champion.stats.chaos})
              </div>
              <div>
                {live ? `${live.health}/${live.maxHealth}` : "-"} {live?.intent ?? ""} {live?.staggered ? "STAGGER" : ""}{" "}
                {live?.airborne ? "AIR" : ""} {live?.onEdge ? "EDGE" : ""}
              </div>
              <div className="mt-1 h-2 w-64 bg-[#3b2f37]" style={{ marginLeft: side === "B" ? "auto" : 0 }}>
                <div
                  className="h-2"
                  style={{
                    width: `${live ? (100 * live.health) / live.maxHealth : 100}%`,
                    background: side === "A" ? colorA : colorB,
                    marginLeft: side === "B" ? "auto" : 0,
                  }}
                />
              </div>
              <div className="text-xs opacity-70">{champion.moves.map((move) => `${move.type[0]}${move.power}:${move.delivery}`).join(" ")}</div>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0 p-4 text-right font-mono text-xs text-[#f5ead6]">
        <div className="text-base">
          {ARENAS[params.arena].name} seed {params.seed} t={(hud.tMs / 1000).toFixed(2)}s {hud.result ?? ""}
        </div>
        {hud.events.map((event, index) => (
          <div key={`${event.t}-${index}`}>{describe(event)}</div>
        ))}
        {error && <div className="text-red-400">{error}</div>}
      </div>
    </div>
  );
}
