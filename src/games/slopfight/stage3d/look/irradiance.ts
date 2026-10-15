import { LightProbe, SphericalHarmonics3 } from "three";

/** Blender-baked world-space radiance, already converted to glTF Y-up. */
export function readIrradianceProbe(coefficients: unknown): LightProbe | null {
  if (!Array.isArray(coefficients) || coefficients.length !== 27 || !coefficients.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  return new LightProbe(new SphericalHarmonics3().fromArray(coefficients), 1);
}
