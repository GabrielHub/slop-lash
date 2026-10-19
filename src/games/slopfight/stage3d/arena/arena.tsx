"use client";

// The arena set in the scene. Loads the set's GLB (drei useGLTF; the next
// arena is preloaded), dresses it (toon on the vertex-coloured meshes, a glow
// material on *_Emissive, outlines on props, water on Hazard_Water, Collision
// hidden, the podium hidden until the final), runs the practical flicker, the
// marquee chase, the edge alerts, the crowd and the set-piece animations, and
// publishes the named-node registry (useArenaNodes) to the director and the
// scenes. A set that fails to load falls back to a stand-in built from the
// canonical play geometry in arenas.ts, so the stage never goes dark.

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { BoxGeometry, Group, Mesh, Vector3, type Material, type Object3D, type ShaderMaterial } from "three";
import { ARENA_IDS, ARENAS, platformColliders, type ArenaId } from "../../arenas";
import { StageBoundary } from "../boundary";
import { TOY_COLOR_VALUES } from "../../vocab";
import { flickerAt, hash01 } from "../director/noise";
import type { ArenaMood } from "../look/moods";
import { useStage } from "../services";
import { createFinaleSetAnimator, relaxFinale, type FinaleSetAnimator } from "./finale";
import { checkFloor, type GeometryCheck } from "./geometry-check";
import { createHazardAnimators, type HazardAnimator } from "./hazards";
import { arenaSurface, createArenaToon, createEmissiveMaterial, OutlinePalette, type ArenaSurface, type EmissiveUniforms } from "./materials";
import { buildArenaNodes, isEmissiveNode, missingContractNodes, type ArenaNodes, type EdgeSideCode } from "./nodes";
import { StormFx } from "./storm";
import { createFloodSheet, createRippleMaterial, createWaterMaterial } from "./water";

export const ARENA_FILES: Readonly<Record<ArenaId, string>> = {
  FLOODED_GARAGE: "/models/slopfight/garage.glb",
  KITCHEN_COUNTER: "/models/slopfight/kitchen.glb",
  ROOFTOP: "/models/slopfight/rooftop.glb",
};

const available = new Map<ArenaId, Promise<boolean>>();

/** Does the set's GLB exist? (HEAD probe, memoized, so a missing set never 404-spams.) */
export function arenaAvailable(id: ArenaId): Promise<boolean> {
  let probe = available.get(id);
  if (!probe) {
    probe = fetch(ARENA_FILES[id], { method: "HEAD" })
      .then((response) => response.ok)
      .catch(() => false);
    available.set(id, probe);
  }
  return probe;
}

/** Start loading a set in the background (tonight's next arena). */
export function preloadArena(id: ArenaId): void {
  if (typeof window === "undefined") return;
  void arenaAvailable(id).then((ok) => {
    if (ok) useGLTF.preload(ARENA_FILES[id]);
  });
}

/** The arena after `current` in tonight's order (or the catalog order). */
export function nextArena(current: ArenaId, order: readonly ArenaId[] = ARENA_IDS): ArenaId | null {
  const index = order.indexOf(current);
  if (index < 0) return order[0] ?? null;
  return order[index + 1] ?? null;
}

interface Glow {
  uniforms: EmissiveUniforms;
  flicker: number;
  channel: number;
  edgeSide: EdgeSideCode | null;
}

export interface PreparedSet {
  root: Object3D;
  nodes: ArenaNodes;
  materials: Material[];
  glows: Glow[];
  timed: ShaderMaterial[];
  hazards: HazardAnimator;
  finale: FinaleSetAnimator;
  check: GeometryCheck;
  missing: string[];
}

type MeshLike = Mesh & { material: Material | Material[] };

/** Props that get an ink outline. The room shell, water and glows do not. */
const OUTLINED = /^(Crowd_\d+|Easel_\d+|Pedestal_\d+|Podium|Hazard_(?!Water)|Floater_\d+|Marquee$|Scoreboard$)/;

/** Meshes this big (bounding radius) receive shadows but never cast them (room shells, the city). */
const SHELL_RADIUS = 8;

const extraNumber = (extras: Record<string, unknown>, key: string): number | null => {
  const value = extras[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Glow strength for an emissive mesh: its `emissive_strength` extra relative to a bulb, times the arena's boost. */
function emissiveBoost(extras: Record<string, unknown>, mood: ArenaMood): number {
  const strength = extraNumber(extras, "emissive_strength");
  // Unlit backdrops (the rooftop sky) show their authored colour, below the bloom threshold.
  if (extras.unlit === true) return Math.min(0.95, strength ?? 1);
  if (strength === null) return mood.emissiveBoost;
  return mood.emissiveBoost * Math.min(1, Math.max(0.35, strength / 3));
}

/** Clone the cached set and dress it. Creates materials; touches nothing global. */
export function prepareSet(arena: ArenaId, source: Object3D, mood: ArenaMood): PreparedSet {
  const root = source.clone(true);
  root.name = `Arena_${arena}`;
  const nodes = buildArenaNodes(arena, root);
  const glows: Glow[] = [];
  const timed: ShaderMaterial[] = [];
  const finishes = new Map<ArenaSurface, ReturnType<typeof createArenaToon>>();
  const outlines = new OutlinePalette(2);
  const own: Material[] = [];

  const materialFor = (surface: ArenaSurface) => {
    let material = finishes.get(surface);
    if (!material) {
      material = createArenaToon({
        surface,
        vertexColors: true,
        rimColor: mood.rim.color,
        shadeTint: mood.fill.color,
        shade: mood.toonShade,
      });
      finishes.set(surface, material);
      own.push(material);
    }
    return material;
  };

  const practicals = nodes.lights
    // Static reflections must not include work lights that are off in fights.
    .filter((light) => light.kind !== "directional" && !light.phases)
    .map((light) => ({ position: light.position, color: light.color, intensity: light.intensity }));
  const spec = ARENAS[arena];
  let sheet: ReturnType<typeof createFloodSheet> | null = null;
  const meshes: MeshLike[] = [];
  root.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as MeshLike);
  });

  for (const mesh of meshes) {
    const extras = mesh.userData as Record<string, unknown>;
    if (mesh.name === "Collision" || extras.collision === true) {
      mesh.visible = false;
      continue;
    }
    if (mesh.name === "Hazard_Water") {
      const water = createWaterMaterial({ ...mood.water, lights: practicals });
      mesh.material = water;
      own.push(water);
      timed.push(water);
      mesh.receiveShadow = false;
      if (spec.finale.id === "flood" && !sheet) {
        // The finale's flood over the pad (hidden until the water rises).
        const material = createWaterMaterial({ ...mood.water, lights: practicals, flood: true });
        sheet = createFloodSheet(material, spec.geometry.halfSize, spec.finale.waterY);
        own.push(material);
        timed.push(material);
      }
      continue;
    }
    if (mesh.name === "Hazard_Water_Ripples") {
      const ripples = createRippleMaterial(mood.water.sheen);
      mesh.material = ripples;
      mesh.renderOrder = 2;
      own.push(ripples);
      timed.push(ripples);
      continue;
    }
    if (isEmissiveNode(mesh)) {
      const glow = createEmissiveMaterial({ boost: emissiveBoost(extras, mood), chase: extras.chase === true });
      if (extras.backdrop === true) glow.fog = false;
      mesh.material = glow;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      own.push(glow);
      const entry = nodes.emissives.find((emissive) => emissive.object === mesh);
      const flicker = entry?.flicker ?? 0;
      glows.push({
        uniforms: glow.userData.uniforms,
        flicker,
        channel: Math.round(flicker * 1000),
        edgeSide: entry?.edgeSide ?? null,
      });
      continue;
    }
    mesh.material = materialFor(arenaSurface(extras.sf_surface));
    mesh.receiveShadow = true;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const radius = (mesh.geometry.boundingSphere?.radius ?? 0) * mesh.getWorldScale(new Vector3()).x;
    mesh.castShadow = radius < SHELL_RADIUS && extras.backdrop !== true;
    if (OUTLINED.test(mesh.name)) {
      const hull = new Mesh(mesh.geometry, outlines.forGeometry(mesh.geometry));
      hull.name = `${mesh.name}__outline`;
      hull.castShadow = false;
      hull.receiveShadow = false;
      hull.raycast = () => {};
      mesh.add(hull);
    }
  }

  // The podium waits for the final.
  if (nodes.podium) nodes.podium.node.object.visible = false;
  if (sheet) root.add(sheet);

  return {
    root,
    nodes,
    materials: [...own, ...outlines.materials],
    glows,
    timed,
    hazards: createHazardAnimators(root),
    finale: createFinaleSetAnimator(root, arena, sheet),
    check: checkFloor(spec.geometry, nodes.floorBounds),
    missing: missingContractNodes(nodes),
  };
}

const IDLE_GUST_PERIOD = 9;
const IDLE_GUST_SECONDS = 2.2;

function useDressedSet(arena: ArenaId, prepared: PreparedSet, showPodium: boolean) {
  const services = useStage();
  const { nodes } = prepared;

  useLayoutEffect(() => {
    services.arena.set(nodes);
    services.director.setNodes(nodes);
    services.crowd.bind(nodes.crowd);
    const accent = TOY_COLOR_VALUES[ARENAS[arena].accent];
    services.transitions.setAccent(accent.hex, accent.dark);
    return () => {
      prepared.hazards.reset();
      prepared.finale.reset();
      if (services.arena.nodes !== nodes) return;
      services.crowd.reset();
      services.arena.set(null);
      services.director.setNodes(null);
    };
  }, [services, nodes, prepared, arena]);

  useEffect(() => {
    if (nodes.podium) nodes.podium.node.object.visible = showPodium;
  }, [nodes, showPodium]);

  useEffect(() => () => prepared.materials.forEach((material) => material.dispose()), [prepared]);

  useFrame(() => {
    const { clock, edgeAlerts, wind, crowd, finale } = services;
    const t = clock.elapsed;
    for (const material of prepared.timed) material.uniforms.uTime!.value = t;
    for (const glow of prepared.glows) {
      glow.uniforms.uTime.value = t;
      glow.uniforms.uFlicker.value = flickerAt(glow.flicker, t, glow.channel);
      glow.uniforms.uAlert.value = glow.edgeSide ? edgeAlerts[glow.edgeSide] : 0;
    }
    if (!wind.driven) {
      // Idle gusts when no fight drives the wind.
      const cycle = Math.floor(t / IDLE_GUST_PERIOD);
      const phase = t - cycle * IDLE_GUST_PERIOD;
      wind.strength =
        phase < IDLE_GUST_SECONDS
          ? Math.sin((phase / IDLE_GUST_SECONDS) * Math.PI) * (0.35 + 0.45 * hash01(cycle))
          : 0;
    }
    prepared.hazards.update(t, wind);
    // The finale (published by the fight, or easing back to calm after it).
    relaxFinale(finale, clock.realDelta);
    prepared.finale.update(finale);
    crowd.update(clock.delta);
  });
}

function GltfSet({ arena, mood, showPodium }: { arena: ArenaId; mood: ArenaMood; showPodium: boolean }) {
  const gltf = useGLTF(ARENA_FILES[arena]);
  const prepared = useMemo(() => prepareSet(arena, gltf.scene, mood), [arena, gltf.scene, mood]);
  useDressedSet(arena, prepared, showPodium);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!prepared.check.ok) {
      console.warn(`[slopfight] ${arena} set vs arenas.ts: ${prepared.check.findings.join("; ")}`);
    }
    if (prepared.missing.length > 0) {
      console.info(`[slopfight] ${arena} set is missing: ${prepared.missing.join(", ")}`);
    }
  }, [arena, prepared]);
  return (
    <>
      <primitive object={prepared.root} />
      {ARENAS[arena].finale.id === "storm" && <StormFx />}
    </>
  );
}

/** A stand-in set from the canonical geometry (the platform's collider boxes) while a GLB is missing. */
function StandInSet({ arena, mood }: { arena: ArenaId; mood: ArenaMood }) {
  const prepared = useMemo(() => {
    const group = new Group();
    platformColliders(ARENAS[arena].geometry).forEach((box, index) => {
      const mesh = new Mesh(
        new BoxGeometry(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]),
      );
      mesh.position.set(
        (box.max[0] + box.min[0]) / 2,
        (box.max[1] + box.min[1]) / 2,
        (box.max[2] + box.min[2]) / 2,
      );
      mesh.name = index === 0 ? "Floor" : `StandIn_${index}`;
      group.add(mesh);
    });
    const set = prepareSet(arena, group, mood);
    const accent = TOY_COLOR_VALUES[ARENAS[arena].accent];
    const plain = createArenaToon({ vertexColors: false, color: accent.hex, rimColor: mood.rim.color });
    set.root.traverse((object) => {
      if ((object as Mesh).isMesh) (object as Mesh).material = plain;
    });
    set.materials.push(plain);
    return set;
  }, [arena, mood]);
  useDressedSet(arena, prepared, false);
  return <primitive object={prepared.root} />;
}

export interface ArenaSetProps {
  arena: ArenaId;
  mood: ArenaMood;
  /** Show the podium (the final's results). */
  showPodium?: boolean;
  /** Tonight's order, for preloading the next set. */
  order?: readonly ArenaId[];
}

/** The current arena's set. Must sit inside a Suspense boundary (the GLB suspends while loading). */
export function ArenaSet({ arena, mood, showPodium = false, order }: ArenaSetProps) {
  useEffect(() => {
    const next = nextArena(arena, order);
    if (next) preloadArena(next);
  }, [arena, order]);
  return (
    // Falls back to the stand-in when the set fails to load; a new arena retries.
    <StageBoundary key={arena} label={`${arena} set`} fallback={<StandInSet arena={arena} mood={mood} />}>
      <GltfSet arena={arena} mood={mood} showPodium={showPodium} />
    </StageBoundary>
  );
}
