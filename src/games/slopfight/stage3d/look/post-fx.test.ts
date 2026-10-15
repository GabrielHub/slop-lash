import { describe, expect, test } from "vite-plus/test";
import { ALL_POST_ON, effectivePostToggles } from "./post-fx";

describe("effective post switches", () => {
  test("reports effects withheld by each quality budget without disabling grade, stage FX or AA", () => {
    expect(effectivePostToggles(ALL_POST_ON, "full")).toEqual(ALL_POST_ON);
    expect(effectivePostToggles(ALL_POST_ON, "reduced")).toEqual({ ...ALL_POST_ON, dof: false, chromatic: false });
    expect(effectivePostToggles(ALL_POST_ON, "minimal")).toEqual({ ...ALL_POST_ON, bloom: false, dof: false, chromatic: false });
  });

  test("quality changes never enable an effect the user switched off", () => {
    const switches = { ...ALL_POST_ON, bloom: false, vignette: false, smaa: false };
    expect(effectivePostToggles(switches, "full")).toEqual(switches);
    expect(effectivePostToggles(switches, "minimal")).toEqual({ ...switches, dof: false, chromatic: false });
    expect(switches.dof).toBe(true);
  });
});
