import { readFileSync } from "node:fs";
import { Object3D, Vector3, type LightProbe } from "three";
import { describe, expect, it } from "vite-plus/test";
import { readLight } from "../arena/nodes";
import { readIrradianceProbe } from "./irradiance";

interface ArenaAsset {
  nodes: { name: string; translation?: number[]; extras?: Record<string, unknown> }[];
}

function readArena(arena: string): ArenaAsset {
  const data = readFileSync(`public/models/slopfight/${arena}.glb`);
  return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString()) as ArenaAsset;
}

function readLights(asset: ArenaAsset) {
  return asset.nodes.filter((node) => node.name.startsWith("Light_")).map((node) => {
    const object = new Object3D();
    object.name = node.name;
    object.userData = node.extras ?? {};
    object.position.fromArray(node.translation ?? [0, 0, 0]);
    return readLight(object)!;
  });
}

function expectPositiveLighting(probe: LightProbe) {
  for (let i = 0; i < 256; i++) {
    const y = 1 - 2 * (i + 0.5) / 256;
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(1 - y * y);
    const light = probe.sh.getIrradianceAt(new Vector3(radius * Math.cos(phi), y, radius * Math.sin(phi)), new Vector3());
    for (const channel of light.toArray()) {
      expect(channel).toBeGreaterThan(0);
      expect(channel).toBeLessThan(2);
    }
  }
}

const glb = readArena("rooftop");

describe("baked rooftop irradiance", () => {
  it("falls back for absent or malformed coefficients", () => {
    for (const value of [undefined, [], Array(26).fill(0), Array(27).fill(NaN), Array(27).fill("0")]) {
      expect(readIrradianceProbe(value)).toBeNull();
    }
  });

  it("ships a finite Y-up field with dim sky and brighter blue platform bounce", () => {
    const extras = glb.nodes.find((node: { name: string }) => node.name === "Probe_Ambient")?.extras;
    const probe = readIrradianceProbe(extras?.sf_probe_sh);
    expect(probe).not.toBeNull();
    const up = probe!.sh.getIrradianceAt(new Vector3(0, 1, 0), new Vector3());
    const down = probe!.sh.getIrradianceAt(new Vector3(0, -1, 0), new Vector3());
    expect(up.z).toBeGreaterThan(up.x);
    // The floodlit blue floor is now brighter than the night sky. Checking
    // both directions catches a Z-up bake accidentally shipped as Y-up.
    expect(down.z).toBeGreaterThan(down.x);
    expect(down.length()).toBeGreaterThan(up.length());
    expectPositiveLighting(probe!);
  });

  it("aims the two floodlights at the ring and reserves a single shadow map", () => {
    const lights = readLights(glb);
    const floods = lights.filter((light) => light.name.startsWith("Light_Ring_"));
    expect(floods).toHaveLength(2);
    expect(lights.filter((light) => light.castShadow).map((light) => light.name)).toEqual(["Light_Ring_Key"]);
    for (const light of floods) {
      expect(light.kind).toBe("spot");
      expect(light.position.y).toBeGreaterThan(5);
      expect(light.target?.distanceTo(new Vector3(0, 0.35, 0))).toBeLessThan(0.001);
      expect(light.angle).toBeGreaterThan(60);
      expect(light.angle).toBeLessThan(80);
    }
    expect(lights.find((light) => light.name === "Light_Work_Build")?.phases).toEqual(["BUILD", "UPGRADE"]);
    expect(lights.find((light) => light.name === "Light_Work_Foundry")?.phases).toEqual(["FOUNDRY"]);
  });
});

describe.each([
  { arena: "garage", key: "Light_Tube", warm: false },
  { arena: "kitchen", key: "Light_Pendant", warm: true },
])("$arena practical lighting", ({ arena, key, warm }) => {
  const scene = readArena(arena);

  it("has finite, positive bounced light with its own colour atmosphere", () => {
    const probe = readIrradianceProbe(scene.nodes.find((node) => node.name === "Probe_Ambient")?.extras?.sf_probe_sh);
    expect(probe).not.toBeNull();
    const down = probe!.sh.getIrradianceAt(new Vector3(0, -1, 0), new Vector3());
    if (warm) expect(down.x).toBeGreaterThan(down.z);
    else expect(down.z).toBeGreaterThan(down.x);
    expectPositiveLighting(probe!);
  });

  it("uses one aimed fixture shadow and limits work lights to their station phases", () => {
    const lights = readLights(scene);
    expect(lights.filter((light) => light.castShadow).map((light) => light.name)).toEqual([key]);
    const primary = lights.find((light) => light.name === key)!;
    expect(primary.kind).toBe("spot");
    expect(primary.position.y).toBeGreaterThan(5);
    expect(primary.target?.distanceTo(new Vector3(0, 0.2, 0))).toBeLessThan(0.001);
    expect(lights.find((light) => light.name === "Light_Work_Build")?.phases).toEqual(["BUILD", "UPGRADE"]);
    expect(lights.find((light) => light.name === "Light_Work_Foundry")?.phases).toEqual(["FOUNDRY"]);
  });
});
