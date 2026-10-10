// Custom post effects for the SlopFight stage (postprocessing v6 `Effect`s, so
// they merge into one full-screen pass with tone mapping):
//
// - GradeEffect: the per-arena three-parameter grade (contrast, saturation,
//   tint) plus a tinted vignette (never pure black). Runs after ACES.
// - StageFxEffect: the director-driven transition layer: letterbox bars, the
//   iris on a world point, the accent wipe, and the impact frame (one white
//   flash frame + radial lines converging on the hit). Runs last, after the
//   grade, so the accent colour is exact.

import { Effect } from "postprocessing";
import { Color, Uniform, Vector2 } from "three";

const gradeShader = /* glsl */ `
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uTint;
uniform float uVignette;
uniform vec3 uVignetteColor;
uniform float uAspect;

vec3 toPerceptual(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
vec3 toLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = toPerceptual(inputColor.rgb);
  c = (c - 0.5) * uContrast + 0.5;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  c *= toPerceptual(uTint);
  vec2 d = (uv - 0.5) * vec2(uAspect, 1.0);
  float v = smoothstep(0.35, 1.05, length(d) * 1.15);
  c = mix(c, c * toPerceptual(uVignetteColor), v * uVignette);
  outputColor = vec4(toLinear(clamp(c, 0.0, 1.0)), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", gradeShader, {
      uniforms: new Map<string, Uniform>([
        ["uContrast", new Uniform(1)],
        ["uSaturation", new Uniform(1)],
        ["uTint", new Uniform(new Color(1, 1, 1))],
        ["uVignette", new Uniform(0.4)],
        ["uVignetteColor", new Uniform(new Color("#1a0f14"))],
        ["uAspect", new Uniform(16 / 9)],
      ]),
    });
  }

  set(values: { contrast: number; saturation: number; tint: string; vignette: number; vignetteColor: string }): void {
    this.uniforms.get("uContrast")!.value = values.contrast;
    this.uniforms.get("uSaturation")!.value = values.saturation;
    (this.uniforms.get("uTint")!.value as Color).set(values.tint);
    this.uniforms.get("uVignette")!.value = values.vignette;
    (this.uniforms.get("uVignetteColor")!.value as Color).set(values.vignetteColor);
  }

  setAspect(aspect: number): void {
    this.uniforms.get("uAspect")!.value = aspect;
  }
}

const stageFxShader = /* glsl */ `
uniform float uAspect;
uniform float uTime;
uniform float uBar;
uniform vec3 uBarColor;
uniform float uWipe;
uniform vec3 uWipeColor;
uniform float uWipeAngle;
uniform vec2 uIrisCenter;
uniform float uIrisRadius;
uniform vec3 uIrisColor;
uniform vec3 uIrisRing;
uniform float uFlash;
uniform float uLines;
uniform vec2 uImpactCenter;
uniform float uSeed;
uniform vec3 uInk;

float hash11(float n) { return fract(sin(n * 12.9898 + uSeed * 4.1414) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;

  // Impact frame: one white flash frame, then radial lines for the hit stop.
  if (uFlash > 0.5) {
    c = mix(vec3(1.0, 0.985, 0.96), c, 0.1);
  }
  if (uLines > 0.0) {
    vec2 d = (uv - uImpactCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float a = atan(d.y, d.x);
    float slices = 72.0;
    float id = floor((a + 3.14159265) / 6.2831853 * slices);
    float local = fract((a + 3.14159265) / 6.2831853 * slices);
    float keep = step(0.45, hash11(id));
    float width = 0.18 + 0.3 * hash11(id + 17.0);
    float line = keep * (1.0 - smoothstep(width * 0.5, width * 0.5 + 0.08, abs(local - 0.5)));
    float inner = 0.22 + 0.25 * hash11(id + 31.0) + (1.0 - uLines) * 0.35;
    line *= smoothstep(inner, inner + 0.12, r);
    c = mix(c, uFlash > 0.5 ? uInk * 0.6 : uInk, line * min(1.0, uLines * 1.4));
  }

  // Iris: everything outside the circle goes to the deep accent, with a bright ring.
  if (uIrisRadius < 1.6) {
    vec2 d = (uv - uIrisCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float edge = 0.003;
    float outside = smoothstep(uIrisRadius - edge, uIrisRadius + edge, r);
    float ring = smoothstep(uIrisRadius - 0.004, uIrisRadius, r) * (1.0 - smoothstep(uIrisRadius + 0.006, uIrisRadius + 0.014, r));
    c = mix(c, uIrisColor, outside);
    c = mix(c, uIrisRing, ring * step(0.002, uIrisRadius));
  }

  // Wipe: a band in the accent colour sweeps across (0..1 covers, 1..2 clears).
  if (uWipe > 0.0 && uWipe < 2.0) {
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    vec2 dir = vec2(cos(uWipeAngle), sin(uWipeAngle));
    float extent = 0.5 * (uAspect * abs(dir.x) + abs(dir.y)) + 0.12;
    float s = dot(p, dir) / extent * 0.5 + 0.5;
    float perp = dot(p, vec2(-dir.y, dir.x));
    float wave = 0.012 * sin(perp * 26.0 + uTime * 9.0) + 0.006 * sin(perp * 61.0 - uTime * 13.0);
    float lead = clamp(uWipe, 0.0, 1.0) * 1.3 - 0.15 + wave;
    float trail = uWipe > 1.0 ? (uWipe - 1.0) * 1.3 - 0.15 + wave : -10.0;
    float inside = step(s, lead) * step(trail, s);
    float highlight = step(s, lead) * step(lead - 0.035, s) * step(trail, s);
    float shadow = step(s, trail + 0.03) * step(trail, s) * step(s, lead);
    vec3 band = uWipeColor;
    band = mix(band, min(uWipeColor * 1.35 + 0.08, vec3(1.0)), highlight);
    band = mix(band, uWipeColor * 0.55, shadow);
    // A soft halftone shimmer so the band is not a flat fill.
    float dots = smoothstep(0.32, 0.3, length(fract(vec2(perp, s * extent * 2.0) * 34.0) - 0.5));
    band = mix(band, band * 1.08, dots * 0.5);
    c = mix(c, band, inside);
  }

  // Letterbox bars.
  if (uBar > 0.0) {
    float bar = step(uv.y, uBar) + step(1.0 - uBar, uv.y);
    c = mix(c, uBarColor, clamp(bar, 0.0, 1.0));
  }

  outputColor = vec4(c, inputColor.a);
}
`;

export class StageFxEffect extends Effect {
  constructor() {
    super("StageFxEffect", stageFxShader, {
      uniforms: new Map<string, Uniform>([
        ["uAspect", new Uniform(16 / 9)],
        ["uTime", new Uniform(0)],
        ["uBar", new Uniform(0)],
        ["uBarColor", new Uniform(new Color("#0c090b"))],
        ["uWipe", new Uniform(0)],
        ["uWipeColor", new Uniform(new Color("#2a9d8f"))],
        ["uWipeAngle", new Uniform(0.3)],
        ["uIrisCenter", new Uniform(new Vector2(0.5, 0.5))],
        ["uIrisRadius", new Uniform(2)],
        ["uIrisColor", new Uniform(new Color("#1b1020"))],
        ["uIrisRing", new Uniform(new Color("#f2c44c"))],
        ["uFlash", new Uniform(0)],
        ["uLines", new Uniform(0)],
        ["uImpactCenter", new Uniform(new Vector2(0.5, 0.5))],
        ["uSeed", new Uniform(0)],
        ["uInk", new Uniform(new Color("#1d1220"))],
      ]),
    });
  }

  uniform<T>(name: string): Uniform<T> {
    return this.uniforms.get(name) as Uniform<T>;
  }
}
