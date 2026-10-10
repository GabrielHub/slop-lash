"use client";

// The stage lab (/dev/slopfight/stage): view each arena, cycle the shots and
// transitions, toggle quality and post effects, poke impacts and cheers, and
// read the frame time. Everything is reproducible from the URL:
//
//   ?arena=garage|kitchen|rooftop (or the ArenaId)  ?phase=LOBBY..FINISHED
//   ?shot=fight_wide  ?transition=wipe  ?at=0.5 (freeze the transition there)
//   ?quality=high|medium|low  ?nopost=bloom,dof,...  ?drift=0  ?ui=0  ?debug=1
//
// Two stand-in fighters (toon capsules) give the shots something to frame.

import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CapsuleGeometry, Group, Vector3 } from "three";
import { ARENA_IDS, ARENAS, type ArenaId } from "../../arenas";
import { CAMERA_ANCHORS, type CameraAnchorName } from "../arena/nodes";
import { TOY_COLOR_VALUES } from "../../vocab";
import type { ShotRequest, TargetLike } from "../director/director";
import { SHOT_IDS, type ShotId } from "../director/shots";
import type { TransitionKind } from "../events";
import { createOutlineMaterial } from "../look/outline";
import { ALL_POST_ON, type PostToggles } from "../look/post-fx";
import { parseQualityParam, QUALITY_TIERS, type QualityTier } from "../look/quality";
import { createToonMaterial } from "../look/toon";
import { PHASE_DIRECTION, PlaceholderScene } from "../scenes/phase-scene";
import { useArenaNodes, useCreateStageServices, useStage, type StageServices } from "../services";
import { StageCanvas } from "../stage-canvas";
import { STAGE_PHASES, standaloneStageInput, type StagePhase } from "../stage-input";

const ARENA_ALIASES: Record<string, ArenaId> = {
  garage: "FLOODED_GARAGE",
  kitchen: "KITCHEN_COUNTER",
  rooftop: "ROOFTOP",
};
const ARENA_SHORT: Record<ArenaId, string> = {
  FLOODED_GARAGE: "garage",
  KITCHEN_COUNTER: "kitchen",
  ROOFTOP: "rooftop",
};
const TRANSITIONS: readonly TransitionKind[] = ["slam", "wipe", "letterboxIn", "letterboxOut", "iris", "matchCut", "cut"];
const POST_KEYS = Object.keys(ALL_POST_ON) as Array<keyof PostToggles>;

interface LabState {
  arena: ArenaId;
  phase: StagePhase;
  shot: ShotId;
  /** For the `anchor` shot (or an override on the anchor holds): a Cam_* name. */
  anchor: CameraAnchorName | null;
  transition: TransitionKind | null;
  at: number | null;
  quality: QualityTier | null;
  post: PostToggles;
  drift: number;
  ui: boolean;
  debug: boolean;
}

function readState(): LabState {
  const params = new URLSearchParams(window.location.search);
  const arenaParam = params.get("arena") ?? "";
  const arena = ARENA_ALIASES[arenaParam.toLowerCase()] ?? (ARENA_IDS.find((id) => id === arenaParam) || "FLOODED_GARAGE");
  const phaseParam = (params.get("phase") ?? "").toUpperCase();
  const phase = (STAGE_PHASES as readonly string[]).includes(phaseParam) ? (phaseParam as StagePhase) : "FIGHT";
  const shotParam = params.get("shot") ?? "";
  const shot = (SHOT_IDS as readonly string[]).includes(shotParam) ? (shotParam as ShotId) : PHASE_DIRECTION[phase].shot;
  const anchorParam = params.get("anchor") ?? "";
  const anchor = (CAMERA_ANCHORS as readonly string[]).includes(anchorParam) ? (anchorParam as CameraAnchorName) : null;
  const transitionParam = params.get("transition") ?? "";
  const transition = (TRANSITIONS as readonly string[]).includes(transitionParam) ? (transitionParam as TransitionKind) : null;
  const atParam = params.get("at");
  const at = atParam !== null && Number.isFinite(Number(atParam)) ? Math.min(1, Math.max(0, Number(atParam))) : null;
  const off = new Set((params.get("nopost") ?? "").split(",").filter(Boolean));
  const post = { ...ALL_POST_ON };
  for (const key of POST_KEYS) if (off.has(key) || off.has("all")) post[key] = false;
  return {
    arena,
    phase,
    shot,
    anchor,
    transition,
    at,
    quality: parseQualityParam(params),
    post,
    drift: params.get("drift") === "0" ? 0 : 1,
    ui: params.get("ui") !== "0",
    debug: params.get("debug") === "1" || params.get("ui") !== "0",
  };
}

function writeUrl(state: LabState) {
  const params = new URLSearchParams();
  params.set("arena", ARENA_SHORT[state.arena]);
  params.set("phase", state.phase);
  params.set("shot", state.shot);
  if (state.anchor) params.set("anchor", state.anchor);
  if (state.transition) params.set("transition", state.transition);
  if (state.at !== null) params.set("at", String(state.at));
  if (state.quality) params.set("quality", state.quality);
  const off = POST_KEYS.filter((key) => !state.post[key]);
  if (off.length > 0) params.set("nopost", off.join(","));
  if (state.drift === 0) params.set("drift", "0");
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// stand-in fighters

interface Fighters {
  A: Group;
  B: Group;
  /** Torso points (the shots' targets). */
  torsoA: Group;
  torsoB: Group;
}

function StandInFighter({ color, torsoRef, rootRef }: { color: string; torsoRef: (g: Group | null) => void; rootRef: (g: Group | null) => void }) {
  const geometry = useMemo(() => new CapsuleGeometry(0.3, 0.42, 6, 18).translate(0, 0.6, 0), []);
  const materials = useMemo(() => {
    const dark = Object.values(TOY_COLOR_VALUES).find((value) => value.hex === color)?.dark ?? "#3b2a2a";
    return {
      body: createToonMaterial({ vertexColors: false, color }),
      eye: createToonMaterial({ vertexColors: false, color: "#fff8ec" }),
      pupil: createToonMaterial({ vertexColors: false, color: "#2a1d22" }),
      outline: createOutlineMaterial({ color: dark, width: 2.5 }),
    };
  }, [color]);
  useEffect(
    () => () => {
      geometry.dispose();
      Object.values(materials).forEach((material) => material.dispose());
    },
    [geometry, materials],
  );
  return (
    <group ref={rootRef}>
      <mesh geometry={geometry} material={materials.body} castShadow receiveShadow />
      <mesh geometry={geometry} material={materials.outline} />
      {[-0.11, 0.11].map((z) => (
        <group key={z} position={[0.24, 0.82, z]}>
          <mesh material={materials.eye} castShadow>
            <sphereGeometry args={[0.075, 16, 12]} />
          </mesh>
          <mesh material={materials.pupil} position={[0.05, 0, 0]}>
            <sphereGeometry args={[0.038, 12, 10]} />
          </mesh>
        </group>
      ))}
      <group ref={torsoRef} position={[0, 0.55, 0]} />
    </group>
  );
}

function StandInFighters({ fighters, shot }: { fighters: React.MutableRefObject<Partial<Fighters>>; shot: ShotId }) {
  const services = useStage();
  const nodes = useArenaNodes();
  const geometry = nodes ? ARENAS[nodes.arena].geometry : ARENAS.FLOODED_GARAGE.geometry;
  const onEdge = shot === "edge_drama";
  const onMarks = shot === "face_off_low";
  const tmp = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const { A, B } = fighters.current;
    if (!A || !B) return;
    const t = services.clock.elapsed;
    const [ax, , az] = geometry.spawns.A;
    const [bx, , bz] = geometry.spawns.B;
    const sway = onMarks ? 0 : Math.sin(t * 0.8) * 0.35;
    const inset = onMarks ? 0 : 0.35;
    A.position.set(ax + inset + sway, Math.abs(Math.sin(t * 5.2)) * 0.06, az + (onMarks ? 0 : Math.sin(t * 0.6) * 0.3));
    if (onEdge) B.position.set(geometry.halfSize - 0.35, Math.abs(Math.sin(t * 6)) * 0.03, bz + 0.4);
    else B.position.set(bx - inset + sway * 0.6, Math.abs(Math.sin(t * 4.6 + 1)) * 0.06, bz - (onMarks ? 0 : Math.sin(t * 0.7) * 0.3));
    // Face each other (+x is the eyes' side).
    tmp.subVectors(B.position, A.position);
    A.rotation.y = Math.atan2(-tmp.z, tmp.x);
    B.rotation.y = Math.atan2(tmp.z, -tmp.x);
    A.scale.setScalar(1 + Math.sin(t * 2.1) * 0.015);
    B.scale.setScalar(1 + Math.sin(t * 2.3 + 1) * 0.015);
  });
  return (
    <>
      <StandInFighter
        color={TOY_COLOR_VALUES.butter.hex}
        rootRef={(g) => void (fighters.current.A = g ?? undefined)}
        torsoRef={(g) => void (fighters.current.torsoA = g ?? undefined)}
      />
      <StandInFighter
        color={TOY_COLOR_VALUES.lilac.hex}
        rootRef={(g) => void (fighters.current.B = g ?? undefined)}
        torsoRef={(g) => void (fighters.current.torsoB = g ?? undefined)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// the scene inside the canvas

function shotRequest(shot: ShotId, fighters: Partial<Fighters>): ShotRequest {
  const a: TargetLike | undefined = fighters.torsoA;
  const b: TargetLike | undefined = fighters.torsoB;
  const both = [a, b].filter(Boolean) as TargetLike[];
  switch (shot) {
    case "walk_on_track":
    case "winner_pose":
      return { targets: a ? [a] : [] };
    case "edge_drama":
    case "ragdoll_follow":
      return { targets: b ? [b] : [] };
    case "face_off_low":
      return { targets: both, side: "A" };
    case "impact_pop": {
      const mid = () => (a && b ? a.getWorldPosition(new Vector3()).lerp(b.getWorldPosition(new Vector3()), 0.5) : null);
      return { targets: [mid] };
    }
    default:
      return { targets: both };
  }
}

function LabScene({
  state,
  fighters,
  replay,
}: {
  state: LabState;
  fighters: React.MutableRefObject<Partial<Fighters>>;
  replay: number;
}) {
  const services = useStage();
  const nodes = useArenaNodes();
  const input = useMemo(() => standaloneStageInput({ phase: state.phase, arena: state.arena }), [state.phase, state.arena]);

  useEffect(() => {
    services.director.driftScale = state.drift;
  }, [services, state.drift]);

  // The chosen shot as the base (re-solved when the set arrives).
  useEffect(() => {
    if (!nodes) return;
    services.clock.resync();
    const request = shotRequest(state.shot, fighters.current);
    if (state.anchor) request.anchor = state.anchor;
    services.director.setBase(state.shot, request);
  }, [services, nodes, state.shot, state.anchor, fighters, replay]);

  // The chosen transition, once the set (and the fonts) are up.
  useEffect(() => {
    if (!nodes || !state.transition) return;
    const kind = state.transition;
    const freezeAt = state.at ?? undefined;
    const timer = window.setTimeout(() => {
      const t = services.transitions;
      const f = fighters.current;
      switch (kind) {
        case "slam":
          void t.play("slam", { text: "FIGHT!", freezeAt });
          break;
        case "wipe":
          void t.play("wipe", { freezeAt });
          break;
        case "iris":
          void t.play("iris", { target: f.torsoB ?? null, freezeAt });
          break;
        case "matchCut":
          void t.play("matchCut", {
            to: "fight_close",
            request: shotRequest("fight_close", f),
            target: f.torsoA ?? new Vector3(),
            freezeAt,
          });
          break;
        case "letterboxIn":
        case "letterboxOut":
          if (kind === "letterboxOut") {
            services.fx.letterbox = 1;
            services.fx.letterboxTarget = 1;
          }
          void t.play(kind, { freezeAt });
          break;
        case "cut":
          void t.play("cut", { onCover: () => services.director.request("fight_close", { ...shotRequest("fight_close", f), force: true }) });
          break;
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [services, nodes, state.transition, state.at, fighters, replay]);

  return (
    <>
      <Suspense fallback={null}>
        <PlaceholderScene input={input} nodes={nodes} />
      </Suspense>
      <StandInFighters fighters={fighters} shot={state.shot} />
    </>
  );
}

// ---------------------------------------------------------------------------
// the page

function Panel({
  state,
  set,
  services,
  onReplay,
  fighters,
}: {
  state: LabState;
  set: (patch: Partial<LabState>) => void;
  services: StageServices;
  onReplay: () => void;
  fighters: React.MutableRefObject<Partial<Fighters>>;
}) {
  const shotIndex = SHOT_IDS.indexOf(state.shot);
  const cycle = (delta: number) => set({ shot: SHOT_IDS[(shotIndex + delta + SHOT_IDS.length) % SHOT_IDS.length]! });
  const impact = (big: boolean) => {
    const { torsoA, torsoB } = fighters.current;
    const point = torsoA && torsoB ? torsoA.getWorldPosition(new Vector3()).lerp(torsoB.getWorldPosition(new Vector3()), 0.5) : null;
    services.impact({ point, strength: big ? 0.9 : 0.45, big });
    if (big) services.director.request("impact_pop", { targets: point ? [point] : [], hold: 1.3, priority: 2 });
  };
  const button = "rounded-lg border-2 border-edge bg-surface px-[0.6rem] py-[0.2rem] text-[0.8rem] font-bold text-ink hover:bg-surface-2";
  const select = "rounded-lg border-2 border-edge bg-surface px-[0.4rem] py-[0.15rem] text-[0.8rem] text-ink";
  return (
    <div className="absolute top-[2.25rem] left-[0.5rem] z-10 flex w-[min(22rem,calc(100%-1rem))] flex-col gap-[0.5rem] rounded-xl border-2 border-edge bg-canvas/90 p-[0.75rem] text-[0.8rem] text-ink">
      <div className="flex flex-wrap items-center gap-[0.4rem]">
        <span className="w-[3.5rem] font-bold">Arena</span>
        <select className={select} value={state.arena} onChange={(e) => set({ arena: e.target.value as ArenaId })}>
          {ARENA_IDS.map((id) => (
            <option key={id} value={id}>
              {ARENAS[id].name}
            </option>
          ))}
        </select>
        <select className={select} value={state.phase} onChange={(e) => set({ phase: e.target.value as StagePhase })}>
          {STAGE_PHASES.map((phase) => (
            <option key={phase}>{phase}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-[0.4rem]">
        <span className="w-[3.5rem] font-bold">Shot</span>
        <button className={button} onClick={() => cycle(-1)}>
          [
        </button>
        <select className={select} value={state.shot} onChange={(e) => set({ shot: e.target.value as ShotId })}>
          {SHOT_IDS.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        <button className={button} onClick={() => cycle(1)}>
          ]
        </button>
        <button className={button} onClick={onReplay}>
          Replay
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-[0.3rem]">
        <span className="w-[3.5rem] font-bold">Trans.</span>
        {TRANSITIONS.map((kind) => (
          <button
            key={kind}
            className={`${button} ${state.transition === kind ? "ring-2 ring-punch" : ""}`}
            onClick={() => {
              set({ transition: kind, at: null });
              onReplay();
            }}
          >
            {kind}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[0.4rem]">
        <span className="w-[3.5rem] font-bold">Quality</span>
        {[...QUALITY_TIERS, null].map((tier) => (
          <button
            key={tier ?? "auto"}
            className={`${button} ${state.quality === tier ? "ring-2 ring-punch" : ""}`}
            onClick={() => {
              set({ quality: tier });
              if (tier) services.quality.set(tier, performance.now());
            }}
          >
            {tier ?? "auto"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[0.5rem]">
        <span className="w-[3.5rem] font-bold">Post</span>
        {POST_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-[0.2rem]">
            <input
              type="checkbox"
              checked={state.post[key]}
              onChange={(e) => set({ post: { ...state.post, [key]: e.target.checked } })}
            />
            {key}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[0.3rem]">
        <span className="w-[3.5rem] font-bold">Poke</span>
        <button className={button} onClick={() => impact(false)}>
          hit
        </button>
        <button className={button} onClick={() => impact(true)}>
          big hit
        </button>
        <button className={button} onClick={() => services.cheer(1)}>
          cheer
        </button>
        <button
          className={button}
          onClick={() => {
            const alerts = services.edgeAlerts;
            alerts.E = alerts.E > 0 ? 0 : 1;
          }}
        >
          edge E
        </button>
        <button
          className={button}
          onClick={() => {
            const wind = services.wind;
            wind.driven = !wind.driven;
            wind.strength = wind.driven ? 1 : 0;
          }}
        >
          gust
        </button>
        <button className={button} onClick={() => set({ drift: state.drift ? 0 : 1 })}>
          drift {state.drift ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}

export default function StageLab() {
  const [state, setState] = useState<LabState>(readState);
  const services = useCreateStageServices({ quality: state.quality });
  const fighters = useRef<Partial<Fighters>>({});
  const [replay, setReplay] = useState(0);
  const set = useCallback((patch: Partial<LabState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      if (patch.phase && !patch.shot) next.shot = PHASE_DIRECTION[patch.phase].shot;
      writeUrl(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const index = SHOT_IDS.indexOf(state.shot);
      if (event.key === "]") set({ shot: SHOT_IDS[(index + 1) % SHOT_IDS.length]! });
      if (event.key === "[") set({ shot: SHOT_IDS[(index - 1 + SHOT_IDS.length) % SHOT_IDS.length]! });
      if (event.key === "r") setReplay((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.shot, set]);

  const phase: StagePhase = state.shot === "podium" ? "FINISHED" : state.phase;
  const input = useMemo(() => standaloneStageInput({ phase, arena: state.arena }), [phase, state.arena]);

  return (
    <StageCanvas
      input={input}
      quality={state.quality}
      toggles={state.post}
      debug={state.debug}
      services={services}
      scene={<LabScene state={{ ...state, phase }} fighters={fighters} replay={replay} />}
      overlay={
        state.ui ? (
          <Panel state={state} set={set} services={services} onReplay={() => setReplay((n) => n + 1)} fighters={fighters} />
        ) : null
      }
    />
  );
}
