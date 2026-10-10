import { resolveChampionSkeleton, resolveSkeleton, type Skeleton } from "../../body/skeleton";
import { sampleById } from "../../samples";
import { parsePartialParts, type Part } from "../../sheet";
import { TOY_COLOR_VALUES, type BodyPlan } from "../../vocab";
import type { MeshRequest } from "./mesher";
import { heldItemBones } from "./props";

export function request(id: string, resolution = 32): MeshRequest {
  const champion = sampleById(id)!.champion;
  const skeleton = resolveChampionSkeleton(champion);
  return {
    bones: skeleton.bones,
    palette: {
      primary: TOY_COLOR_VALUES[champion.palette.primary].hex,
      secondary: TOY_COLOR_VALUES[champion.palette.secondary].hex,
      accent: TOY_COLOR_VALUES[champion.palette.accent].hex,
    },
    resolution,
  };
}

export function layoutFace(skeleton: Skeleton) {
  return { bone: skeleton.head ?? skeleton.torso, normal: skeleton.face.normal, scale: skeleton.face.scale };
}

/** The full request <CreatureView> sends: layout inputs, markings and the slots' dark hexes. */
export function fullRequest(id: string, resolution = 32, skipItem = false): MeshRequest {
  const champion = sampleById(id)!.champion;
  const base = request(id, resolution);
  const skeleton = resolveChampionSkeleton(champion);
  return {
    ...base,
    parts: champion.parts,
    bodyPlan: champion.bodyPlan,
    markings: champion.markings,
    skip: skipItem ? heldItemBones(skeleton).skip : [],
    face: layoutFace(skeleton),
    palette: {
      ...base.palette,
      dark: {
        primary: TOY_COLOR_VALUES[champion.palette.primary].dark,
        secondary: TOY_COLOR_VALUES[champion.palette.secondary].dark,
        accent: TOY_COLOR_VALUES[champion.palette.accent].dark,
      },
    },
  };
}

export type Row = [id: string, spec: string, attach: string | null, color?: string, mirror?: boolean];

/** Parts from compact rows: id, "role shape size elongation", "parent.anchor", colour, mirrored. */
function parts(rows: Row[]): Part[] {
  return parsePartialParts({
    parts: rows.map(([id, spec, attach, color, mirror]) => {
      const [role, shape, size, elongation] = spec.split(" ");
      const [parent, anchor] = attach ? attach.split(".") : [null, null];
      return { id, role, shape, size, elongation, parent, anchor, color: color ?? "primary", mirror: mirror ?? false };
    }),
  });
}

export function synthetic(rows: Row[], bodyPlan: BodyPlan) {
  const list = parts(rows);
  return { parts: list, skeleton: resolveSkeleton(list, { bodyPlan }) };
}

export const PALETTE = { primary: "#E8553D", secondary: "#F5C94C", accent: "#2F6FB0" };
