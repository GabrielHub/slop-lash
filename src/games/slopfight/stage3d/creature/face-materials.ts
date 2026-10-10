// Eye styles, their shader, and cached mouth textures. The face rig owns placement and animation.

import { CanvasTexture, Color, ShaderMaterial, SRGBColorSpace, Vector2, type IUniform } from "three";
import type { EyeStyle, MouthStyle } from "../../vocab";
import type { Expression } from "./animator";

export const enum EyeKind {
  Eye = 0,
  Dot = 1,
  Visor = 2,
}

export interface EyeSlot {
  /** Position on the face in base eye radii (x to the creature's left, y up). */
  x: number;
  y: number;
  size: number;
}

export interface EyeLook {
  kind: EyeKind;
  slots: EyeSlot[];
  open: number;
  lower: number;
  tilt: number;
  brow: number;
  browTilt: number;
  pupil: number;
  pupilY: number;
  star: number;
  lids: boolean;
  googly: boolean;
  /** Line width in eye radii. */
  line: number;
  /** Eye height factor (sclera y radius). */
  tall: number;
}

const PAIR = (spread: number, y: number, size: number): EyeSlot[] => [
  { x: spread, y, size },
  { x: -spread, y, size },
];

export const BASE: EyeLook = {
  kind: EyeKind.Eye,
  slots: PAIR(1.18, 0.25, 1),
  open: 1,
  lower: 0,
  tilt: 0,
  brow: 0,
  browTilt: 0,
  pupil: 0.5,
  pupilY: 0,
  star: 0,
  lids: true,
  googly: false,
  line: 0.14,
  tall: 1.1,
};

export const EYE_LOOKS: Record<EyeStyle, EyeLook> = {
  round: { ...BASE },
  sleepy: { ...BASE, open: 0.46, pupilY: -0.18, pupil: 0.52, tall: 1.0 },
  angry: { ...BASE, open: 0.9, tilt: 0.42, brow: 1, browTilt: 0.42, pupil: 0.46 },
  googly: {
    ...BASE,
    slots: [
      { x: 1.2, y: 0.32, size: 1.12 },
      { x: -1.12, y: 0.18, size: 0.86 },
    ],
    pupil: 0.56,
    lids: false,
    googly: true,
    line: 0.12,
    tall: 1,
  },
  tiny: { ...BASE, kind: EyeKind.Dot, slots: PAIR(1.75, 0.15, 0.36), pupil: 1, tall: 1 },
  cyclops: { ...BASE, slots: [{ x: 0, y: 0.38, size: 1.6 }], pupil: 0.46 },
  many: {
    ...BASE,
    slots: [
      { x: 0.72, y: 0.1, size: 0.62 },
      { x: -0.72, y: 0.1, size: 0.62 },
      { x: 1.95, y: 0.42, size: 0.46 },
      { x: -1.95, y: 0.42, size: 0.46 },
      { x: 0.55, y: 1.25, size: 0.4 },
      { x: -0.55, y: 1.25, size: 0.4 },
      { x: 0, y: -0.85, size: 0.32 },
    ],
    pupil: 0.55,
    tall: 1,
  },
  visor: { ...BASE, kind: EyeKind.Visor, slots: [{ x: 0, y: 0.3, size: 1 }], lids: false, tall: 1 },
  starry: { ...BASE, star: 1, pupil: 0.58, slots: PAIR(1.2, 0.25, 1.06) },
  beady: { ...BASE, kind: EyeKind.Dot, slots: PAIR(0.85, 0.3, 0.42), pupil: 1, tall: 1 },
};

// ---------------------------------------------------------------------------
// Eye shader
// ---------------------------------------------------------------------------

const EYE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const EYE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform vec2 uHalf;
uniform float uKind;
uniform float uOpen;
uniform float uLower;
uniform float uTilt;
uniform float uCurve;
uniform float uLids;
uniform float uBrow;
uniform float uBrowTilt;
uniform vec2 uPupil;
uniform float uPupilSize;
uniform float uStar;
uniform float uLine;
uniform float uRing;
uniform float uTall;
uniform float uTime;
uniform vec3 uSclera;
uniform vec3 uPupilCol;
uniform vec3 uIris;
uniform vec3 uLid;
uniform vec3 uLineCol;
uniform vec3 uRingCol;

float cover( float d ) {
  float aa = max( fwidth( d ), 1e-4 );
  return 1.0 - smoothstep( -aa, aa, d );
}

float sdSegment( vec2 p, vec2 a, vec2 b ) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
  return length( pa - ba * h );
}

float sdRoundBox( vec2 p, vec2 b, float r ) {
  vec2 q = abs( p ) - b + r;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - r;
}

// A four-point sparkle (astroid), returned as an implicit value < 0 inside.
float sparkle( vec2 p, float r ) {
  vec2 q = abs( p ) / r;
  return pow( q.x, 0.62 ) + pow( q.y, 0.62 ) - 1.0;
}

void main() {
  vec2 p = ( vUv * 2.0 - 1.0 ) * uHalf;
  vec3 col = vec3( 0.0 );
  float alpha = 0.0;

  if ( uKind > 1.5 ) {
    // Visor: a glowing band with scanlines and a sweeping glint.
    float h = max( 0.06, 0.55 * uOpen );
    float d = sdRoundBox( p, vec2( uHalf.x - 0.2, h ), min( h, 0.45 ) );
    float outer = cover( d - uLine );
    float inner = cover( d );
    float scan = 0.82 + 0.18 * step( 0.5, fract( p.y * 3.2 + uTime * 0.6 ) );
    float sweep = smoothstep( 0.35, 0.0, abs( p.x - ( fract( uTime * 0.35 ) * 2.0 - 1.0 ) * uHalf.x * 1.3 - p.y * 0.6 ) );
    vec3 glow = uSclera * scan + vec3( 0.6 ) * sweep;
    col = mix( uLineCol, glow, inner );
    alpha = outer;
    gl_FragColor = vec4( col, alpha );
    if ( alpha < 0.01 ) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  // Eye shape (an ellipse; dots are circles).
  float d = ( length( p / vec2( 1.0, uTall ) ) - 1.0 ) * min( 1.0, uTall );
  float shape = cover( d - uLine );
  float ring = uRing > 0.0 ? cover( d - uLine - uRing ) : 0.0;
  float sclera = cover( d );

  // Lids: the upper lid covers everything above lidY, the lower lid below lowY.
  float lidY = mix( -0.12, uTall + 0.15, uOpen ) + uTilt * p.x + uCurve * p.x * p.x;
  float lowY = -uTall - 0.15 + ( uTall + 0.1 ) * uLower - 0.25 * uTilt * p.x;
  float upper = uLids * cover( lidY - p.y );
  float lower = uLids * cover( p.y - lowY );
  float lid = max( upper, lower );
  float lidLine = uLids * max( cover( abs( p.y - lidY ) - uLine ) * step( uOpen, 0.985 ), cover( abs( p.y - lowY ) - uLine ) * step( 0.01, uLower ) );

  // Sclera, pupil, highlights.
  vec3 eye = uSclera;
  if ( uKind < 0.5 ) {
    float irisD = length( p - uPupil ) - uPupilSize * 1.42;
    eye = mix( eye, uIris, cover( irisD ) * step( 0.5, uStar ) );
    float pupilD = length( p - uPupil ) - uPupilSize;
    eye = mix( eye, uPupilCol, cover( pupilD ) );
  }
  float ps = uKind < 0.5 ? max( uPupilSize, 0.4 ) : 1.0;
  vec2 c = uKind < 0.5 ? uPupil : vec2( 0.0 );
  float h1 = uStar > 0.5
    ? sparkle( p - c - vec2( -0.12, 0.12 ) * ps, 0.95 * ps )
    : length( p - c - vec2( -0.34, 0.36 ) * ps ) - 0.3 * ps;
  float h2 = length( p - c - vec2( 0.34, -0.32 ) * ps ) - 0.12 * ps;
  float shine = max( uStar > 0.5 ? cover( h1 * 0.25 * ps ) : cover( h1 ), cover( h2 ) );
  eye = mix( eye, vec3( 1.0 ), shine * 0.95 );

  col = mix( uLineCol, eye, sclera );
  col = mix( col, uLid, lid * shape );
  col = mix( col, uLineCol, lidLine * shape );
  alpha = shape;
  if ( ring > 0.0 ) {
    col = mix( uRingCol, col, shape );
    alpha = max( alpha, ring * ( 1.0 - lid ) );
  }

  // Brows.
  if ( uBrow > 0.0 ) {
    float by = uTall + 0.42 - 0.25 * ( 1.0 - uOpen );
    vec2 a = vec2( -0.95, by - uBrowTilt * 0.95 );
    vec2 b = vec2( 0.95, by + uBrowTilt * 0.95 );
    float bd = sdSegment( p, a, b ) - 0.22;
    float brow = cover( bd ) * uBrow;
    col = mix( col, uLineCol, brow );
    alpha = max( alpha, brow );
  }

  gl_FragColor = vec4( col, alpha );
  if ( alpha < 0.01 ) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type EyeUniforms = {
  [name: string]: IUniform;
  uHalf: IUniform<Vector2>;
  uKind: IUniform<number>;
  uOpen: IUniform<number>;
  uLower: IUniform<number>;
  uTilt: IUniform<number>;
  uCurve: IUniform<number>;
  uLids: IUniform<number>;
  uBrow: IUniform<number>;
  uBrowTilt: IUniform<number>;
  uPupil: IUniform<Vector2>;
  uPupilSize: IUniform<number>;
  uStar: IUniform<number>;
  uLine: IUniform<number>;
  uRing: IUniform<number>;
  uTall: IUniform<number>;
  uTime: IUniform<number>;
  uSclera: IUniform<Color>;
  uPupilCol: IUniform<Color>;
  uIris: IUniform<Color>;
  uLid: IUniform<Color>;
  uLineCol: IUniform<Color>;
  uRingCol: IUniform<Color>;
};

export function eyeMaterial(): ShaderMaterial & { uniforms: EyeUniforms } {
  const uniforms: EyeUniforms = {
    uHalf: { value: new Vector2(1.35, 1.8) },
    uKind: { value: 0 },
    uOpen: { value: 1 },
    uLower: { value: 0 },
    uTilt: { value: 0 },
    uCurve: { value: 0 },
    uLids: { value: 1 },
    uBrow: { value: 0 },
    uBrowTilt: { value: 0 },
    uPupil: { value: new Vector2() },
    uPupilSize: { value: 0.5 },
    uStar: { value: 0 },
    uLine: { value: 0.14 },
    uRing: { value: 0 },
    uTall: { value: 1.1 },
    uTime: { value: 0 },
    uSclera: { value: new Color("#fffaf0") },
    uPupilCol: { value: new Color("#1d1a20") },
    uIris: { value: new Color("#3d4fb8") },
    uLid: { value: new Color("#e8553d") },
    uLineCol: { value: new Color("#2a1c22") },
    uRingCol: { value: new Color("#f4ead8") },
  };
  return new ShaderMaterial({
    uniforms,
    vertexShader: EYE_VERTEX,
    fragmentShader: EYE_FRAGMENT,
  }) as ShaderMaterial & { uniforms: EyeUniforms };
}

// ---------------------------------------------------------------------------
// Mouth textures
// ---------------------------------------------------------------------------

export type MouthShape =
  | "smile"
  | "grin"
  | "fangs"
  | "fangsOpen"
  | "beak"
  | "beakOpen"
  | "frown"
  | "o"
  | "shout"
  | "tongue"
  | "smug"
  | "zigzag"
  | "flat"
  | "open";

const MOUTH_W = 256;
const MOUTH_H = 128;
const INSIDE = "#6b2232";
const TONGUE = "#ee7b93";
const TEETH = "#fff8ec";
export const mouthTextures = new Map<string, CanvasTexture>();

function shade(hex: string, amount: number): string {
  const c = new Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

function drawMouth(ctx: CanvasRenderingContext2D, shape: MouthShape, line: string, accent: string) {
  const lw = 15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  const stroke = () => ctx.stroke();
  const dShape = (left: number, right: number, top: number, bottom: number, sag: number) => {
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.quadraticCurveTo(128, top + sag, right, top);
    ctx.quadraticCurveTo(right - 12, bottom, 128, bottom);
    ctx.quadraticCurveTo(left + 12, bottom, left, top);
    ctx.closePath();
  };
  const fang = (x: number, y: number, dir: number) => {
    ctx.beginPath();
    ctx.moveTo(x - 13, y - 2);
    ctx.lineTo(x + 13, y - 2 + dir * 2);
    ctx.lineTo(x + dir * 2, y + 30);
    ctx.closePath();
    ctx.fillStyle = TEETH;
    ctx.lineWidth = 6;
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = lw;
  };
  switch (shape) {
    case "smile":
      ctx.beginPath();
      ctx.moveTo(52, 50);
      ctx.quadraticCurveTo(128, 112, 204, 50);
      stroke();
      break;
    case "frown":
      ctx.beginPath();
      ctx.moveTo(60, 94);
      ctx.quadraticCurveTo(128, 34, 196, 94);
      stroke();
      break;
    case "flat":
      ctx.beginPath();
      ctx.moveTo(78, 70);
      ctx.quadraticCurveTo(128, 62, 180, 66);
      stroke();
      break;
    case "smug":
      ctx.beginPath();
      ctx.moveTo(70, 72);
      ctx.quadraticCurveTo(150, 92, 194, 46);
      stroke();
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(186, 36);
      ctx.lineTo(206, 54);
      stroke();
      break;
    case "zigzag": {
      ctx.lineWidth = 12;
      ctx.beginPath();
      const xs = [40, 64, 88, 112, 136, 160, 184, 210];
      xs.forEach((x, i) => (i === 0 ? ctx.moveTo(x, 62) : ctx.lineTo(x, i % 2 ? 46 : 80)));
      stroke();
      ctx.lineWidth = 7;
      for (const x of [76, 124, 172]) {
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(x, 88);
        stroke();
      }
      break;
    }
    case "o":
    case "shout": {
      const big = shape === "shout";
      ctx.beginPath();
      ctx.ellipse(128, 66, big ? 34 : 24, big ? 46 : 30, 0, 0, Math.PI * 2);
      ctx.fillStyle = INSIDE;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(128, big ? 110 : 96, 30, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.ellipse(128, 66, big ? 34 : 24, big ? 46 : 30, 0, 0, Math.PI * 2);
      stroke();
      break;
    }
    case "open":
    case "fangsOpen":
    case "grin": {
      const grin = shape === "grin";
      dShape(grin ? 26 : 50, grin ? 230 : 206, 40, grin ? 112 : 116, grin ? 12 : 16);
      ctx.fillStyle = INSIDE;
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (grin) {
        ctx.fillStyle = TEETH;
        ctx.fillRect(0, 30, MOUTH_W, 36);
        ctx.strokeStyle = shade(INSIDE, 0.1);
        ctx.lineWidth = 5;
        for (const x of [66, 97, 128, 159, 190]) {
          ctx.beginPath();
          ctx.moveTo(x, 40);
          ctx.lineTo(x, 66);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, 66);
        ctx.lineTo(MOUTH_W, 66);
        ctx.stroke();
      } else {
        ctx.fillStyle = TONGUE;
        ctx.beginPath();
        ctx.ellipse(128, 118, 46, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = line;
      ctx.lineWidth = 12;
      dShape(grin ? 26 : 50, grin ? 230 : 206, 40, grin ? 112 : 116, grin ? 12 : 16);
      stroke();
      if (shape === "fangsOpen") {
        fang(86, 50, 1);
        fang(170, 50, -1);
      }
      break;
    }
    case "fangs":
      ctx.beginPath();
      ctx.moveTo(50, 52);
      ctx.quadraticCurveTo(128, 96, 206, 52);
      stroke();
      fang(90, 66, 1);
      fang(166, 66, -1);
      break;
    case "tongue":
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.moveTo(100, 66);
      ctx.lineTo(100, 96);
      ctx.quadraticCurveTo(128, 136, 156, 96);
      ctx.lineTo(156, 66);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(128, 76);
      ctx.lineTo(128, 98);
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(52, 52);
      ctx.quadraticCurveTo(128, 96, 204, 52);
      stroke();
      break;
    case "beak":
    case "beakOpen": {
      const open = shape === "beakOpen";
      const dark = shade(accent, -0.22);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 9;
      if (open) {
        ctx.beginPath();
        ctx.moveTo(84, 62);
        ctx.lineTo(172, 62);
        ctx.lineTo(128, 112);
        ctx.closePath();
        ctx.fillStyle = INSIDE;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(92, 82);
        ctx.quadraticCurveTo(128, 76, 164, 82);
        ctx.lineTo(128, 120);
        ctx.closePath();
        ctx.fillStyle = shade(accent, -0.08);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(66, 30);
      ctx.quadraticCurveTo(128, 14, 190, 30);
      ctx.lineTo(128, open ? 76 : 112);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.stroke();
      if (!open) {
        ctx.beginPath();
        ctx.moveTo(90, 56);
        ctx.quadraticCurveTo(128, 70, 166, 56);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.ellipse(104, 34, 14, 6, -0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

export function mouthTexture(shape: MouthShape, line: string, accent: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const key = `${shape}|${line}|${accent}`;
  const hit = mouthTextures.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = MOUTH_W;
  canvas.height = MOUTH_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawMouth(ctx, shape, line, accent);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  mouthTextures.set(key, texture);
  return texture;
}

/** The mouth drawn for a style under an expression (or while striking). */
export function mouthShapeFor(style: MouthStyle, expression: Expression, open: boolean): MouthShape | null {
  if (style === "none") return null;
  if (style === "beak") return open || expression === "wide" ? "beakOpen" : "beak";
  if (expression === "wide") return "shout";
  if (open) return style === "fangs" ? "fangsOpen" : style === "grin" ? "grin" : style === "tongue" ? "tongue" : "open";
  if (expression === "smug") return "smug";
  if (expression === "annoyed" || expression === "closed") return style === "zigzag" ? "zigzag" : "flat";
  if (expression === "squint") return style === "fangs" ? "fangs" : style === "grin" ? "grin" : "flat";
  return style;
}
