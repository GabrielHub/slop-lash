// The arena's named-node registry. The Blender sets follow a node contract
// (scripts/slopfight/blender/README.md, spec section 13); code reads nodes by
// name only through this file. Everything is captured as a world transform
// once the set is loaded (sets are static), plus the live Object3D for
// anything that needs to parent to it.

import { Box3, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import type { ArenaId } from "../../arenas";

export const CAMERA_ANCHORS = [
  "Cam_Establish",
  "Cam_Establish_End",
  "Cam_Build",
  "Cam_Foundry",
  "Cam_Roster",
  "Cam_FaceOff_A",
  "Cam_FaceOff_B",
  "Cam_FightWide",
  "Cam_Edge_N",
  "Cam_Edge_E",
  "Cam_Edge_S",
  "Cam_Edge_W",
  "Cam_Podium",
  "Cam_Scoreboard",
] as const;
export type CameraAnchorName = (typeof CAMERA_ANCHORS)[number];

/** A node's world transform, captured when the set loaded. */
export interface NodeTransform {
  name: string;
  object: Object3D;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  matrixWorld: Matrix4;
}

/** A Cam_* empty: Blender camera convention, looking down its local -Z with +Y up. */
export interface CameraAnchor extends NodeTransform {
  fov: number;
  /** World look-at point (glTF extra `target`, else 6 units down the forward axis). */
  target: Vector3;
  up: Vector3;
  forward: Vector3;
  /** Dutch roll in degrees, already baked into `up`. */
  roll: number;
}

/** A text or canvas plane marker: its local XY plane, facing local +Z. */
export interface PlaneNode extends NodeTransform {
  width: number;
  height: number;
  textColor: string | null;
  bgColor: string | null;
  normal: Vector3;
}

export type LightKind = "point" | "spot" | "rect" | "directional";

/** A Light_* empty. The stage creates the light. */
export interface LightMarker extends NodeTransform {
  kind: LightKind;
  color: string;
  intensity: number;
  flicker: number;
  distance: number;
  /** Spot cone, degrees. */
  angle: number;
  width: number;
  height: number;
  target: Vector3 | null;
  /** Only the authored key practical casts a shadow (one map per arena). */
  castShadow?: boolean;
  /** Work lights are on only while players use their station. */
  phases?: readonly string[];
}

export interface EaselNodes {
  index: number;
  node: NodeTransform;
  canvas: PlaneNode | null;
  avatar: NodeTransform | null;
}

export interface PedestalNodes {
  index: number;
  node: NodeTransform;
  top: NodeTransform | null;
  color: string | null;
}

export type EdgeSideCode = "N" | "E" | "S" | "W";

export interface EmissiveNode {
  object: Object3D;
  color: string | null;
  flicker: number;
  chase: boolean;
  edgeSide: EdgeSideCode | null;
}

export interface ArenaNodes {
  arena: ArenaId;
  root: Object3D;
  cameras: Partial<Record<CameraAnchorName, CameraAnchor>>;
  floor: NodeTransform | null;
  /** World bounds of the Floor mesh (for the geometry check). */
  floorBounds: Box3 | null;
  collision: Object3D | null;
  edge: Object3D | null;
  pit: Object3D | null;
  marquee: NodeTransform | null;
  marqueeText: PlaneNode | null;
  scoreboard: NodeTransform | null;
  scoreboardText: PlaneNode | null;
  easels: EaselNodes[];
  pedestals: PedestalNodes[];
  podium: { node: NodeTransform; tops: NodeTransform[] } | null;
  /** Mark_Roster_1..4 and Mark_FaceOff_A/B when the set has them. */
  marks: { roster: NodeTransform[]; faceOff: { A: NodeTransform | null; B: NodeTransform | null } };
  crowd: Object3D[];
  lights: LightMarker[];
  emissives: EmissiveNode[];
  /** The floor-edge light strips, for "ON THE EDGE". */
  edgeLights: Partial<Record<EdgeSideCode, Object3D>>;
  hazards: Map<string, Object3D>;
  /** Any node by its contract name. */
  get(name: string): Object3D | undefined;
}

type Extras = Record<string, unknown>;

const extrasOf = (object: Object3D): Extras => (object.userData ?? {}) as Extras;

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

const vec = (value: unknown): Vector3 | null =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number")
    ? new Vector3(value[0] as number, value[1] as number, value[2] as number)
    : null;

export function captureTransform(object: Object3D): NodeTransform {
  object.updateWorldMatrix(true, false);
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  return { name: object.name, object, position, quaternion, scale, matrixWorld: object.matrixWorld.clone() };
}

export function readCameraAnchor(object: Object3D): CameraAnchor {
  const base = captureTransform(object);
  const extras = extrasOf(object);
  const forward = new Vector3(0, 0, -1).applyQuaternion(base.quaternion).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(base.quaternion).normalize();
  const target = vec(extras.target) ?? base.position.clone().addScaledVector(forward, 6);
  return {
    ...base,
    fov: num(extras.fov, 40),
    target,
    up,
    forward,
    roll: num(extras.roll, 0),
  };
}

export function readPlane(object: Object3D): PlaneNode {
  const base = captureTransform(object);
  const extras = extrasOf(object);
  return {
    ...base,
    width: num(extras.width, 1),
    height: num(extras.height, 1),
    textColor: str(extras.text_color),
    bgColor: str(extras.bg_color),
    normal: new Vector3(0, 0, 1).applyQuaternion(base.quaternion).normalize(),
  };
}

export function readLight(object: Object3D): LightMarker | null {
  const extras = extrasOf(object);
  const declared = str(extras.light_kind);
  if (declared !== "point" && declared !== "spot" && declared !== "rect" && declared !== "directional") return null;
  // A far-off spot noted as directional (the rooftop moon) is a sun, not a cone.
  const note = str(extras.note) ?? "";
  const kind: LightKind = declared === "spot" && /directional/i.test(note) ? "directional" : declared;
  const base = captureTransform(object);
  const target = vec(extras.light_target);
  const dir = vec(extras.light_dir);
  return {
    ...base,
    kind,
    color: str(extras.light_color) ?? "#ffffff",
    intensity: num(extras.light_intensity, 1),
    flicker: num(extras.light_flicker, 0),
    distance: num(extras.light_distance, 0),
    angle: num(extras.light_angle, 50),
    width: num(extras.light_width, 1),
    height: num(extras.light_height, 1),
    target: target ?? (dir ? base.position.clone().add(dir) : null),
    castShadow: extras.light_shadow === true,
    phases: Array.isArray(extras.light_phases) ? extras.light_phases.filter((phase): phase is string => typeof phase === "string") : undefined,
  };
}

const EDGE_CODES: readonly EdgeSideCode[] = ["N", "E", "S", "W"];

/** arenas.ts edge names to compass codes: +z (front) is S, -z (back) N, +x (right) E. */
const EDGE_SIDE_CODES: Readonly<Record<string, EdgeSideCode>> = { front: "S", back: "N", left: "W", right: "E" };

/** The compass code for a glTF `edge` / `edge_side` extra, or a node-name suffix. */
export function edgeCodeOf(value: string | null): EdgeSideCode | null {
  if (!value) return null;
  if ((EDGE_CODES as readonly string[]).includes(value)) return value as EdgeSideCode;
  return EDGE_SIDE_CODES[value] ?? null;
}

/** Is this mesh one of the glowing ones (`*_Emissive`, the SF_Emissive material, or the extra)? */
export function isEmissiveNode(object: Object3D): boolean {
  const extras = extrasOf(object);
  if (extras.emissive === true) return true;
  if (object.name.endsWith("_Emissive") || object.name.startsWith("Edge_Lights_")) return true;
  const material = (object as Object3D & { material?: { name?: string } }).material;
  return material?.name === "SF_Emissive";
}

/**
 * Index a loaded set by contract name. Missing nodes are null or empty (a set
 * still being authored must not crash the stage); the caller reports gaps.
 */
export function buildArenaNodes(arena: ArenaId, root: Object3D): ArenaNodes {
  root.updateMatrixWorld(true);
  const byName = new Map<string, Object3D>();
  root.traverse((object) => {
    if (object.name && !byName.has(object.name)) byName.set(object.name, object);
  });
  const find = (name: string) => byName.get(name);
  const transform = (name: string) => {
    const object = find(name);
    return object ? captureTransform(object) : null;
  };
  const plane = (name: string) => {
    const object = find(name);
    return object ? readPlane(object) : null;
  };

  const cameras: ArenaNodes["cameras"] = {};
  for (const name of CAMERA_ANCHORS) {
    const object = find(name);
    if (object) cameras[name] = readCameraAnchor(object);
  }

  const easels: EaselNodes[] = [];
  const pedestals: PedestalNodes[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const easel = find(`Easel_${index}`);
    if (easel) {
      easels.push({
        index,
        node: captureTransform(easel),
        canvas: plane(`Easel_${index}_Canvas`),
        avatar: transform(`Easel_${index}_Avatar`),
      });
    }
    const pedestal = find(`Pedestal_${index}`);
    if (pedestal) {
      pedestals.push({
        index,
        node: captureTransform(pedestal),
        top: transform(`Pedestal_${index}_Top`),
        color: str(extrasOf(pedestal).pedestal_color),
      });
    }
  }

  const podiumNode = find("Podium");
  const podium = podiumNode
    ? {
        node: captureTransform(podiumNode),
        tops: [1, 2, 3].flatMap((rank) => {
          const top = transform(`Podium_${rank}`);
          return top ? [top] : [];
        }),
      }
    : null;

  const crowd: Object3D[] = [];
  for (let index = 1; index <= 40; index += 1) {
    const member = find(`Crowd_${String(index).padStart(2, "0")}`);
    if (member) crowd.push(member);
  }

  const lights: LightMarker[] = [];
  const emissives: EmissiveNode[] = [];
  const edgeLights: ArenaNodes["edgeLights"] = {};
  const hazards = new Map<string, Object3D>();
  root.traverse((object) => {
    if (object.name.startsWith("Light_")) {
      const light = readLight(object);
      if (light) lights.push(light);
    }
    if (object.name.startsWith("Hazard_") && !hazards.has(object.name)) hazards.set(object.name, object);
    const isMesh = (object as Object3D & { isMesh?: boolean }).isMesh === true;
    if (isMesh && isEmissiveNode(object)) {
      const extras = extrasOf(object);
      const edgeSide =
        edgeCodeOf(str(extras.edge)) ??
        edgeCodeOf(str(extras.edge_side)) ??
        edgeCodeOf(/^Edge_Lights_([NESW])$/.exec(object.name)?.[1] ?? null);
      if (edgeSide) edgeLights[edgeSide] = object;
      emissives.push({
        object,
        color: str(extras.emissive_color),
        flicker: num(extras.flicker, 0),
        chase: extras.chase === true,
        edgeSide,
      });
    }
  });

  const floorObject = find("Floor");
  const floorBounds = floorObject ? new Box3().setFromObject(floorObject) : null;

  return {
    arena,
    root,
    cameras,
    floor: floorObject ? captureTransform(floorObject) : null,
    floorBounds,
    collision: find("Collision") ?? null,
    edge: find("Edge") ?? null,
    pit: find("Pit") ?? null,
    marquee: transform("Marquee"),
    marqueeText: plane("Marquee_Text"),
    scoreboard: transform("Scoreboard"),
    scoreboardText: plane("Scoreboard_Text"),
    easels,
    pedestals,
    podium,
    marks: {
      roster: [1, 2, 3, 4].flatMap((index) => {
        const mark = transform(`Mark_Roster_${index}`);
        return mark ? [mark] : [];
      }),
      faceOff: { A: transform("Mark_FaceOff_A"), B: transform("Mark_FaceOff_B") },
    },
    crowd,
    lights,
    emissives,
    edgeLights,
    hazards,
    get: find,
  };
}

/** Contract nodes a complete set has; used to report gaps in a set being authored. */
export function missingContractNodes(nodes: ArenaNodes): string[] {
  const missing: string[] = [];
  const need = (ok: unknown, name: string) => {
    if (!ok) missing.push(name);
  };
  need(nodes.floor, "Floor");
  need(nodes.collision, "Collision");
  need(nodes.edge, "Edge");
  need(nodes.marqueeText, "Marquee_Text");
  need(nodes.scoreboardText, "Scoreboard_Text");
  need(nodes.podium, "Podium");
  need(nodes.crowd.length >= 20, "Crowd_01..20");
  for (let index = 1; index <= 4; index += 1) {
    need(nodes.easels.find((easel) => easel.index === index)?.canvas, `Easel_${index}_Canvas`);
    need(nodes.pedestals.find((pedestal) => pedestal.index === index)?.top, `Pedestal_${index}_Top`);
  }
  for (const name of CAMERA_ANCHORS) need(nodes.cameras[name], name);
  return missing;
}
