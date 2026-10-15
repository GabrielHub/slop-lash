// Arena materials. Vertex-coloured set meshes get the shared toon look
// (look/toon.ts, tuned a touch flatter for sets than for creatures) and props
// an inverted-hull outline (look/outline.ts) in a dark version of their own
// colour; *_Emissive meshes get an HDR glow material (the only things over the
// bloom threshold), with flicker, a marquee chase and the edge-alert tint
// driven per frame.

import { BufferGeometry, Color, MeshBasicMaterial, type IUniform, type Material } from "three";
import { createOutlineMaterial, type OutlineMaterial } from "../look/outline";
import { createToonMaterial, type ToonMaterial } from "../look/toon";

export type ArenaSurface = "toy" | "matte" | "satin" | "gloss";

/** Authored Blender extras select a finish without adding shader variants. */
export function arenaSurface(value: unknown): ArenaSurface {
  return value === "matte" || value === "satin" || value === "gloss" ? value : "toy";
}

const SURFACE_FINISH = {
  toy: { specular: 0.18, specularSize: 0.99, rim: 0.22, translucency: 0.18 },
  matte: { specular: 0.025, specularSize: 0.97, rim: 0.06, translucency: 0 },
  satin: { specular: 0.12, specularSize: 0.985, rim: 0.12, translucency: 0 },
  gloss: { specular: 0.24, specularSize: 0.994, rim: 0.16, translucency: 0.03 },
} satisfies Record<ArenaSurface, Partial<Parameters<typeof createToonMaterial>[0]>>;

export interface ArenaToonOptions {
  surface?: ArenaSurface;
  vertexColors?: boolean;
  color?: string;
  rimColor?: string;
  /** Cool tint of the dark band (per arena). */
  shadeTint?: string;
  /** Dark band brightness (per arena). */
  shade?: number;
}

/** The toon material for a set: Creature's toon, with a softer highlight and rim for big surfaces. */
export function createArenaToon(options: ArenaToonOptions = {}): ToonMaterial {
  return createToonMaterial({
    vertexColors: options.vertexColors ?? true,
    color: options.color ?? "#ffffff",
    shade: options.shade ?? 0.42,
    shadeTint: options.shadeTint ?? "#8f86c4",
    softness: 0.08,
    ...SURFACE_FINISH[options.surface ?? "toy"],
    // Tiny practical bulbs must not stamp a polka-dot highlight on every tile.
    specularMinLight: 1.2,
    rimColor: options.rimColor ?? "#ffb877",
  });
}

/** Mean vertex colour of a geometry (linear), white when it has none. */
export function meanVertexColor(geometry: BufferGeometry, target = new Color()): Color {
  const attribute = geometry.getAttribute("color");
  if (!attribute) return target.setRGB(1, 1, 1);
  let r = 0;
  let g = 0;
  let b = 0;
  const step = Math.max(1, Math.floor(attribute.count / 256));
  let n = 0;
  for (let i = 0; i < attribute.count; i += step) {
    r += attribute.getX(i);
    g += attribute.getY(i);
    b += attribute.getZ(i);
    n += 1;
  }
  return target.setRGB(r / n, g / n, b / n);
}

/**
 * Outline materials shared by colour: a prop's hull is a dark, slightly
 * saturated version of its own mean colour (never pure black). Cached per
 * quantized colour so a set makes a handful of materials, not one per mesh.
 */
export class OutlinePalette {
  private readonly cache = new Map<string, OutlineMaterial>();
  constructor(
    private readonly width = 2,
    private readonly floor = new Color("#1d1418"),
  ) {}

  forGeometry(geometry: BufferGeometry): OutlineMaterial {
    const color = meanVertexColor(geometry);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + 0.05), Math.min(0.16, hsl.l * 0.3));
    color.lerp(this.floor, 0.25);
    const key = color.getHexString().slice(0, 5);
    let material = this.cache.get(key);
    if (!material) {
      material = createOutlineMaterial({ color, width: this.width });
      this.cache.set(key, material);
    }
    return material;
  }

  get materials(): Material[] {
    return [...this.cache.values()];
  }
}

export interface EmissiveUniforms {
  uBoost: IUniform<number>;
  uFlicker: IUniform<number>;
  uChase: IUniform<number>;
  uTime: IUniform<number>;
  uAlert: IUniform<number>;
  uAlertColor: IUniform<Color>;
}

/**
 * HDR glow for *_Emissive meshes: vertex colour x boost x flicker, with an
 * optional bulb chase along x (the marquee) and an alert tint (edge lights).
 */
export function createEmissiveMaterial(options: { boost: number; chase?: boolean }): MeshBasicMaterial & {
  userData: { uniforms: EmissiveUniforms };
} {
  const uniforms: EmissiveUniforms = {
    uBoost: { value: options.boost },
    uFlicker: { value: 1 },
    uChase: { value: options.chase ? 1 : 0 },
    uTime: { value: 0 },
    uAlert: { value: 0 },
    uAlertColor: { value: new Color("#ff3b2a") },
  };
  const material = new MeshBasicMaterial({ vertexColors: true, color: "#ffffff" });
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vSfWorld;\nvoid main() {")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvSfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform float uBoost;
        uniform float uFlicker;
        uniform float uChase;
        uniform float uTime;
        uniform float uAlert;
        uniform vec3 uAlertColor;
        varying vec3 vSfWorld;
        void main() {`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
          float chase = 1.0;
          if (uChase > 0.5) {
            float wave = sin((vSfWorld.x + vSfWorld.y) * 5.5 - uTime * 7.0);
            chase = 0.55 + 0.45 * smoothstep(-0.2, 0.6, wave);
          }
          vec3 glow = mix(outgoingLight, uAlertColor * (0.8 + 0.4 * sin(uTime * 18.0)), uAlert);
          outgoingLight = glow * uBoost * uFlicker * chase;
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "sf-emissive";
  return material as MeshBasicMaterial & { userData: { uniforms: EmissiveUniforms } };
}

export function disposeMaterials(materials: Iterable<Material>): void {
  for (const material of materials) material.dispose();
}
