// The creature lab behind /dev/slopfight: every sample on a small stage under
// the three-point rig, a forge playback, a walk loop and a turntable, with a
// frame-time readout. Query: ?mode=gallery|forge|walk|single|finishes
// &sample=<id> &page=<n> (gallery/walk pages of 12), &hold=<parts> (forge:
// stop streaming after that many parts), &probe=1 (adds sheets from
// /dev/slopfight-probe.json).
//
// Finishes: &finish=<recipe> puts finishes on every sheet shown ("gold",
// "arm:metal", "torso:crystal,head:gold"; see finish-recipes.ts), and
// mode=finishes lines them up side by side: &set=all (every finish on
// &sample, default robot), mix (mixed bodies), four, or a recipe. Under arena
// lighting: /dev/slopfight/finishes.

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type DirectionalLight,
} from "three";
import { SAMPLES, type Sample } from "../../samples";
import type { Champion, Part } from "../../sheet";
import { createToonMaterial } from "../look/toon";
import { createDriver, type CreatureDriver, type DriverAnim } from "./animator";
import { Creature, type CreatureEvent, type CreatureHandle } from "./creature";
import { applyFinishRecipe, finishSet } from "./finish-recipes";
import { mesherStats } from "./mesh-client";

type Mode = "gallery" | "forge" | "walk" | "single" | "finishes";

interface LabParams {
  mode: Mode;
  sample: string | null;
  page: number;
  hold: number | null;
  probe: boolean;
  /** Fixed facing in degrees (single: no turntable; gallery: overrides the 3/4 turn). */
  yaw: number | null;
  /** A finish recipe put on every sheet (finish-recipes.ts). */
  finish: string | null;
  /** mode=finishes: which set (all, mix, four or a recipe). */
  set: string | null;
}

const PAGE_SIZE = 12;

function readParams(): LabParams {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const mode = q.get("mode");
  const hold = q.get("hold");
  return {
    mode: mode === "forge" || mode === "walk" || mode === "single" || mode === "finishes" ? mode : "gallery",
    sample: q.get("sample"),
    page: Math.max(1, Number(q.get("page") ?? 1) || 1),
    hold: hold !== null && Number.isFinite(Number(hold)) ? Number(hold) : null,
    probe: q.get("probe") === "1",
    yaw: q.get("yaw") !== null && Number.isFinite(Number(q.get("yaw"))) ? Number(q.get("yaw")) : null,
    finish: q.get("finish"),
    set: q.get("set"),
  };
}

/** Accepts the Forge workstream's probe file in a few likely shapes; ignores anything else. */
function probeSamples(data: unknown): Sample[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (((data as Record<string, unknown>).results ?? (data as Record<string, unknown>).samples ?? []) as unknown[])
      : [];
  const out: Sample[] = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const rec = item as Record<string, unknown>;
    const result = rec.result as Record<string, unknown> | undefined;
    const champion = (rec.champion ?? result?.champion ?? (Array.isArray(rec.parts) ? rec : null)) as Champion | null;
    if (!champion || !Array.isArray(champion.parts) || !champion.palette || !champion.bodyPlan) return;
    const id = typeof rec.id === "string" ? rec.id : `probe-${i + 1}`;
    const input = typeof rec.input === "string" ? rec.input : typeof rec.prompt === "string" ? rec.prompt : champion.name;
    out.push({ id: `probe:${id}`, input: input ?? "", champion });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const SKY_FRAGMENT = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
void main() {
  float y = vDir.y;
  vec3 col = y > 0.0 ? mix( uHorizon, uTop, smoothstep( 0.0, 0.55, y ) ) : mix( uHorizon, uBottom, smoothstep( 0.0, 0.2, -y ) );
  float glow = pow( max( 0.0, 1.0 - abs( y ) * 3.0 ), 3.0 );
  col += vec3( 0.12, 0.06, 0.02 ) * glow;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const HORIZON = "#e8b896";

function Backdrop() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTop: { value: new Color("#4a3d6b") },
          uHorizon: { value: new Color(HORIZON) },
          uBottom: { value: new Color("#7a5a4a") },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const geometry = useMemo(() => new SphereGeometry(60, 32, 16), []);
  return <mesh geometry={geometry} material={material} renderOrder={-10} />;
}

/** A warm stage disc: lighter centre, a darker lip, soft rings (vertex colours). */
function Floor() {
  const { geometry, material } = useMemo(() => {
    // Concentric rings for smooth vertex colour bands.
    const rings = 40;
    const seg = 96;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const inner = new Color("#f1dfc4");
    const mid = new Color("#e2c6a2");
    const lip = new Color("#b98d6c");
    const outer = new Color("#9c7660");
    const c = new Color();
    for (let r = 0; r <= rings; r += 1) {
      const rad = (r / rings) ** 1.3 * 16;
      const t = rad;
      // (t: distance from the centre)
      if (t < 5.5) c.copy(inner).lerp(mid, t / 5.5);
      else if (t < 6.2) c.copy(mid).lerp(lip, (t - 5.5) / 0.7);
      else c.copy(lip).lerp(outer, Math.min(1, (t - 6.2) / 5));
      const band = 1 - 0.035 * (Math.round(t * 1.4) % 2);
      for (let s = 0; s < seg; s += 1) {
        const a = (s / seg) * Math.PI * 2;
        pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        col.push(c.r * band, c.g * band, c.b * band);
      }
    }
    for (let r = 0; r < rings; r += 1) {
      for (let s = 0; s < seg; s += 1) {
        const a = r * seg + s;
        const b = r * seg + ((s + 1) % seg);
        const d = (r + 1) * seg + s;
        const e = (r + 1) * seg + ((s + 1) % seg);
        idx.push(a, b, d, b, e, d);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setIndex(idx);
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(col, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const material = createToonMaterial({ vertexColors: true, rim: 0, specular: 0, translucency: 0.15, shade: 0.55 });
    return { geometry, material };
  }, []);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function Rig({ extent }: { extent: number }) {
  const key = useRef<DirectionalLight>(null);
  useEffect(() => {
    const light = key.current;
    if (!light) return;
    const cam = light.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 0.5;
    cam.far = 40;
    cam.updateProjectionMatrix();
  }, [extent]);
  return (
    <>
      <fog attach="fog" args={[HORIZON, 16, 46]} />
      <hemisphereLight args={["#c7b6e6", "#6b5040", 0.55]} />
      <directionalLight
        ref={key}
        position={[6, 9, 7]}
        intensity={2.7}
        color="#ffdcb4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.045}
      />
      <directionalLight position={[-7, 3.5, 4]} intensity={0.75} color="#a7bbff" />
      <directionalLight position={[-2, 5, -9]} intensity={1.8} color="#ffc6dc" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

interface LabStats {
  frames: number[];
  events: Record<string, number>;
  creatures: number;
  meshed: number;
}

declare global {
  interface Window {
    __slopLab?: {
      ready: boolean;
      creatures: number;
      meshed: number;
      frameMs: number;
      p95: number;
      mesher: typeof mesherStats;
      events: Record<string, number>;
    };
  }
}

function FrameMeter({ stats }: { stats: LabStats }) {
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (last.current) {
      stats.frames.push(now - last.current);
      if (stats.frames.length > 240) stats.frames.shift();
    }
    last.current = now;
  });
  return null;
}

function Readout({ stats, mode, label }: { stats: LabStats; mode: Mode; label: string }) {
  const el = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const f = [...stats.frames].sort((a, b) => a - b);
      const avg = f.length ? f.reduce((s, v) => s + v, 0) / f.length : 0;
      const p95 = f.length ? f[Math.floor(f.length * 0.95)]! : 0;
      const recent = [...mesherStats.recent].sort((a, b) => a - b);
      const med = recent.length ? recent[Math.floor(recent.length / 2)]! : 0;
      window.__slopLab = {
        ready: stats.meshed >= stats.creatures && stats.creatures > 0,
        creatures: stats.creatures,
        meshed: stats.meshed,
        frameMs: +avg.toFixed(2),
        p95: +p95.toFixed(2),
        mesher: mesherStats,
        events: stats.events,
      };
      if (!el.current) return;
      const ev = Object.entries(stats.events)
        .map(([k, v]) => `${k} ${v}`)
        .join("  ");
      el.current.textContent =
        `${mode}  ${label}\n` +
        `frame ${avg.toFixed(1)} ms (${avg > 0 ? (1000 / avg).toFixed(0) : "-"} fps)  p95 ${p95.toFixed(1)} ms\n` +
        `mesher ${mesherStats.worker ? "worker" : "main"}  last ${mesherStats.lastMs.toFixed(1)} ms @${mesherStats.lastResolution}  median ${med.toFixed(1)} ms  meshes ${mesherStats.meshes}\n` +
        `creatures ${stats.meshed}/${stats.creatures}${ev ? `\n${ev}` : ""}`;
    }, 250);
    return () => window.clearInterval(id);
  }, [stats, mode, label]);
  return (
    <pre
      ref={el}
      className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-black/55 px-3 py-2 font-mono text-[12px] leading-4 text-white"
    />
  );
}

// The lab's mutable bookkeeping (stats, drivers, walkers) is written through
// these helpers from effects and frame callbacks, never during render.

function countEvent(stats: LabStats, event: CreatureEvent) {
  stats.events[event.kind] = (stats.events[event.kind] ?? 0) + 1;
}

function setCreatureCount(stats: LabStats, count: number) {
  stats.creatures = count;
}

function resetMeshed(stats: LabStats) {
  stats.meshed = 0;
}

function turnDriver(driver: CreatureDriver, by: number) {
  driver.yaw += by;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function useEventCounter(stats: LabStats) {
  return useMemo(() => {
    const seen = new Set<number>();
    return (index: number) => (event: CreatureEvent) => {
      if (event.kind === "meshed" && !seen.has(index)) {
        seen.add(index);
        stats.meshed += 1;
      }
      countEvent(stats, event);
    };
  }, [stats]);
}

interface LabelSpot {
  title: string;
  input: string;
  position: Vector3;
}

/** Dev labels: plain DOM chips outside the canvas, moved to projected positions every frame. */
const labelBoard: { spots: LabelSpot[]; els: (HTMLDivElement | null)[] } = { spots: [], els: [] };

function LabelProjector() {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    labelBoard.spots.forEach((spot, i) => {
      const el = labelBoard.els[i];
      if (!el) return;
      v.copy(spot.position).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
      el.style.opacity = v.z < 1 ? "1" : "0";
    });
  });
  return null;
}

function LabelLayer({ spots }: { spots: LabelSpot[] }) {
  useEffect(() => {
    labelBoard.spots = spots;
  }, [spots]);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {spots.map((spot, i) => (
        <div
          key={spot.title}
          ref={(el) => {
            labelBoard.els[i] = el;
          }}
          className="absolute left-0 top-0 max-w-[220px] rounded-md bg-[#2b1d22]/70 px-2 py-0.5 text-center font-mono text-[11px] leading-[13px] text-[#fff4e2]"
        >
          <div className="font-bold">{spot.title}</div>
          <div className="opacity-80">{spot.input}</div>
        </div>
      ))}
    </div>
  );
}

function galleryLayout(count: number, yawDeg: number | null) {
  const cols = 4;
  const dx = 2.7;
  const dz = 3.8;
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = (c - (cols - 1) / 2) * dx;
    const z = (r - (rows - 1) / 2) * dz;
    return { x, z, yaw: yawDeg !== null ? (yawDeg * Math.PI) / 180 : 0.5 - x * 0.05 };
  });
}

function Gallery({ samples, stats, yaw }: { samples: Sample[]; stats: LabStats; yaw: number | null }) {
  const counter = useEventCounter(stats);
  const drivers = useMemo(
    () => galleryLayout(samples.length, yaw).map((spot) => createDriver([spot.x, 0, spot.z], spot.yaw)),
    [samples, yaw],
  );
  useEffect(() => {
    setCreatureCount(stats, samples.length);
  }, [stats, samples.length]);
  return (
    <>
      {samples.map((sample, i) => (
        <Creature key={sample.id} champion={sample.champion} driver={drivers[i]} seed={i + 1} onEvent={counter(i)} />
      ))}
    </>
  );
}

function Single({ sample, stats, yaw, focus }: {
  sample: Sample;
  stats: LabStats;
  yaw: number | null;
  focus: RefObject<CreatureHandle | null>;
}) {
  const driver = useMemo(() => createDriver([0, 0, 0], yaw !== null ? (yaw * Math.PI) / 180 : 0.5), [yaw]);
  const counter = useEventCounter(stats);
  useEffect(() => {
    setCreatureCount(stats, 1);
  }, [stats]);
  useFrame((_, dt) => {
    if (yaw === null) turnDriver(driver, dt * 0.45);
  });
  return <Creature ref={focus} champion={sample.champion} driver={driver} seed={7} onEvent={counter(0)} />;
}

interface ForgeState {
  index: number;
  count: number;
  face: boolean;
  complete: boolean;
}

function Forge({ samples, fixed, hold, stats, onLabel, focus }: {
  focus: RefObject<CreatureHandle | null>;
  samples: Sample[];
  fixed: boolean;
  hold: number | null;
  stats: LabStats;
  onLabel: (label: string) => void;
}) {
  const [state, setState] = useState<ForgeState>({ index: 0, count: 0, face: false, complete: false });
  const clock = useRef(0);
  const driver = useMemo(() => createDriver([0, 0, 0], 0.35), []);
  const sample = samples[state.index % samples.length]!;
  const total = sample.champion.parts.length;
  const counter = useEventCounter(stats);
  useEffect(() => {
    setCreatureCount(stats, 1);
  }, [stats]);
  useEffect(() => {
    onLabel(`${sample.id}  parts ${state.count}/${total}${state.face ? "  face" : ""}${state.complete ? "  complete" : ""}`);
  }, [onLabel, sample.id, state, total]);
  useFrame((_, dt) => {
    clock.current += dt;
    const t = clock.current;
    const PART = 0.25;
    const limit = hold ?? total;
    const count = Math.min(limit, Math.floor(t / PART) + 1);
    const allIn = Math.min(limit, total) * PART;
    const face = hold === null && t > allIn + 0.35;
    const complete = hold === null && t > allIn + 0.9;
    const done = hold === null && t > allIn + 3.6;
    if (done) {
      clock.current = 0;
      resetMeshed(stats);
      setState((s) => ({ index: fixed ? s.index : s.index + 1, count: 0, face: false, complete: false }));
      return;
    }
    if (count !== state.count || face !== state.face || complete !== state.complete) {
      setState((s) => ({ ...s, count, face, complete }));
    }
  });
  const parts: Part[] = useMemo(() => sample.champion.parts.slice(0, state.count), [sample, state.count]);
  return (
    <Creature
      ref={focus}
      key={`${sample.id}-${state.index}`}
      // Like the stage's forge: the finished sheet (markings, item) lands once complete.
      {...(state.complete
        ? { champion: sample.champion }
        : {
            parts,
            bodyPlan: sample.champion.bodyPlan,
            palette: sample.champion.palette,
            face: state.face ? sample.champion.face : null,
            heft: sample.champion.stats.heft,
            complete: false,
          })}
      scale={1}
      driver={driver}
      seed={state.index + 3}
      onEvent={counter(state.index)}
    />
  );
}

interface Walker {
  driver: CreatureDriver;
  radius: number;
  speed: number;
  angle: number;
  nextMove: number;
  moveT: number;
  move: number;
}

/** Walk mode: each creature circles, with a strike toward a point ahead every few seconds. */
function stepWalkers(walkers: Walker[], dt: number, time: number) {
  for (const w of walkers) {
    const anim = w.driver.anim as DriverAnim;
    const striking = w.moveT >= 0;
    const omega = (w.speed / w.radius) * (striking ? 0.25 : 1);
    w.angle += omega * dt;
    const x = Math.cos(w.angle) * w.radius;
    const z = Math.sin(w.angle) * w.radius;
    const vx = -Math.sin(w.angle) * w.radius * omega;
    const vz = Math.cos(w.angle) * w.radius * omega;
    w.driver.velocity[0] = vx;
    w.driver.velocity[1] = 0;
    w.driver.velocity[2] = vz;
    w.driver.position[0] = x;
    w.driver.position[2] = z;
    w.driver.yaw = Math.atan2(vx, vz);
    // A strike every few seconds: wind up, hit, recover, at a point ahead.
    if (!striking && time > w.nextMove) {
      w.moveT = 0;
      w.move = (w.move + 1) % 3;
    }
    if (w.moveT >= 0) {
      w.moveT += dt;
      const t = w.moveT;
      const phase = t < 0.35 ? "windup" : t < 0.6 ? "active" : t < 1.0 ? "recover" : null;
      anim.move = phase ? w.move : null;
      anim.movePhase = phase;
      anim.progress = phase === "windup" ? t / 0.35 : phase === "active" ? (t - 0.35) / 0.25 : (t - 0.6) / 0.4;
      const fx = Math.sin(w.driver.yaw);
      const fz = Math.cos(w.driver.yaw);
      anim.reachTarget = [x + fx * 1.1, 0.55, z + fz * 1.1];
      if (!phase) {
        w.moveT = -1;
        w.nextMove = time + 3 + Math.random() * 3;
      }
    }
  }
}

function Walk({ samples, stats }: { samples: Sample[]; stats: LabStats }) {
  const counter = useEventCounter(stats);
  const walkers = useMemo<Walker[]>(
    () =>
      samples.map((sample, i) => {
        const plan = sample.champion.bodyPlan;
        const radius = 2.2 + (i % 4) * 1.15;
        const base = plan === "FLIER" ? 1.5 : plan === "SLITHER" ? 0.7 : plan === "HOPPER" ? 1.0 : 1.1;
        const speed = base * (1.15 - 0.07 * sample.champion.stats.heft) * (i % 2 ? 1 : -1);
        const angle = (i / samples.length) * Math.PI * 2;
        const driver = createDriver([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
        driver.anim = { locomotion: plan === "HOPPER" ? "hop" : "walk", movePhase: null, move: null, progress: 0 };
        return { driver, radius, speed, angle, nextMove: 2 + i * 0.7, moveT: -1, move: 0 };
      }),
    [samples],
  );
  useEffect(() => {
    setCreatureCount(stats, samples.length);
  }, [stats, samples.length]);
  useFrame((state, dtRaw) => stepWalkers(walkers, Math.min(dtRaw, 1 / 20), state.clock.elapsedTime));
  return (
    <>
      {samples.map((sample, i) => (
        <Creature key={sample.id} champion={sample.champion} driver={walkers[i]!.driver} seed={i + 1} onEvent={counter(i)} />
      ))}
    </>
  );
}

/** Single and forge: keep the creature framed as it grows and re-forms. */
function AutoFrame({ focus }: { focus: RefObject<CreatureHandle | null> }) {
  const { camera } = useThree();
  const state = useRef({ dist: 3.4, y: 0.5, ready: false });
  const dir = useMemo(() => new Vector3(0.23, 0.2, 0.95).normalize(), []);
  useFrame((_, dt) => {
    const skeleton = focus.current?.view.skeleton;
    let size = 1;
    let height = 1;
    if (skeleton) {
      const { min, max } = skeleton.bounds;
      height = skeleton.height;
      size = Math.max(height, 0.62 * Math.max(max[0] - min[0], max[2] - min[2]));
    }
    const st = state.current;
    const k = st.ready ? 1 - Math.exp(-dt * 2.5) : 1;
    st.ready = st.ready || !!skeleton;
    st.dist += (0.5 + 2.9 * size - st.dist) * k;
    st.y += (0.55 * height - st.y) * k;
    camera.position.set(dir.x * st.dist, st.y + dir.y * st.dist, dir.z * st.dist);
    camera.lookAt(0, st.y, 0);
  });
  return null;
}

function CameraRig({ mode, count }: { mode: Mode; count: number }) {
  const { camera } = useThree();
  const { position, target } = useMemo(() => {
    if (mode === "gallery" || mode === "finishes") {
      const rows = Math.max(3, Math.ceil(count / 4));
      return {
        position: [0, 3 + rows * 1.35, 4.6 + rows * 2.6] as [number, number, number],
        target: [0, 0.15, 0.45] as [number, number, number],
      };
    }
    return { position: [0, 7.5, 11.5] as [number, number, number], target: [0, 0.3, 0] as [number, number, number] };
  }, [mode, count]);
  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(new Vector3(...target));
  }, [camera, position, target]);
  return <OrbitControls target={target} makeDefault enableDamping={false} />;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function CreatureLab() {
  const [params] = useState(readParams);
  const [extra, setExtra] = useState<Sample[]>([]);
  const [label, setLabel] = useState("");
  const stats = useMemo<LabStats>(() => ({ frames: [], events: {}, creatures: 0, meshed: 0 }), []);
  const focus = useRef<CreatureHandle | null>(null);

  useEffect(() => {
    if (!params.probe) return;
    let alive = true;
    fetch("/dev/slopfight-probe.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data) setExtra(probeSamples(data));
      })
      .catch(() => {
        /* no probe file: samples only */
      });
    return () => {
      alive = false;
    };
  }, [params.probe]);

  const all = useMemo(() => {
    const list = [...extra, ...SAMPLES];
    const recipe = params.finish;
    return recipe ? list.map((s) => ({ ...s, champion: applyFinishRecipe(s.champion, recipe) })) : list;
  }, [extra, params.finish]);
  const finishes = params.mode === "finishes";
  const chosen = params.sample && !finishes ? all.find((s) => s.id === params.sample || s.id === `probe:${params.sample}`) : undefined;
  const pageSamples = useMemo(() => {
    if (finishes) {
      return finishSet(params.set, params.sample).map((v) => ({ id: v.id, input: v.title, champion: v.champion }));
    }
    if (chosen) return [chosen];
    const start = (params.page - 1) * PAGE_SIZE;
    return all.slice(start, start + PAGE_SIZE);
  }, [all, chosen, params.page, finishes, params.set, params.sample]);
  const pages = Math.ceil(all.length / PAGE_SIZE);
  const labelSpots = useMemo(
    () =>
      galleryLayout(pageSamples.length, params.yaw).map((spot, i) => ({
        title: pageSamples[i]!.id,
        input: pageSamples[i]!.input,
        position: new Vector3(spot.x, 0, spot.z + 0.6),
      })),
    [pageSamples, params.yaw],
  );
  const single = chosen ?? all[0]!;
  const headline =
    finishes
      ? `finishes ${params.set ?? "all"}${params.sample ? ` on ${params.sample}` : ""}`
      : params.mode === "gallery" || params.mode === "walk"
      ? `page ${params.page}/${pages}  (${all.length} sheets)${params.finish ? `  finish ${params.finish}` : ""}`
      : params.mode === "single"
        ? `${single.id}: ${single.input}`
        : label;

  return (
    <div className="relative h-full w-full" style={{ background: HORIZON }}>
      <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 30, near: 0.1, far: 140, position: [0, 4, 10] }}>
        <Backdrop />
        <Rig extent={params.mode === "walk" ? 8 : params.mode === "gallery" || finishes ? 7 : 3} />
        <Floor />
        <ContactShadows position={[0, 0.004, 0]} scale={24} resolution={1024} blur={2.4} opacity={0.5} far={1.6} color="#3a2420" />
        <FrameMeter stats={stats} />
        {params.mode === "gallery" || params.mode === "walk" || finishes ? (
          <CameraRig mode={params.mode} count={pageSamples.length} />
        ) : (
          <AutoFrame focus={focus} />
        )}
        {(params.mode === "gallery" || finishes) && <Gallery samples={pageSamples} stats={stats} yaw={params.yaw} />}
        {params.mode === "single" && <Single sample={single} stats={stats} yaw={params.yaw} focus={focus} />}
        {(params.mode === "gallery" || finishes) && <LabelProjector />}
        {params.mode === "walk" && <Walk samples={pageSamples} stats={stats} />}
        {params.mode === "forge" && (
          <Forge
            samples={chosen ? [chosen] : all}
            fixed={!!chosen}
            hold={params.hold}
            stats={stats}
            onLabel={setLabel}
            focus={focus}
          />
        )}
      </Canvas>
      {(params.mode === "gallery" || finishes) && <LabelLayer spots={labelSpots} />}
      <Readout stats={stats} mode={params.mode} label={headline} />
    </div>
  );
}
