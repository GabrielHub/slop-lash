import { describe, expect, test, vi } from "vite-plus/test";
import { sampleById } from "../../samples";
import { championHash, championScale } from "../../sheet";
import { QUALITY_LADDER } from "../look/quality";
import { CreatureView, type CreatureSource } from "./creature-view";
import { createDriver } from "./animator";

describe("creature quality changes", () => {
  test("remeshes the same champion at the selected grid without changing its skeleton", async () => {
    const champion = sampleById("cat")!.champion;
    const source: CreatureSource = {
      parts: champion.parts,
      bodyPlan: champion.bodyPlan,
      palette: champion.palette,
      face: champion.face,
      scale: championScale(champion),
      complete: true,
      hash: championHash(champion),
      resolution: QUALITY_LADDER[0]!.meshGrid.final,
    };
    const view = new CreatureView();
    const driver = createDriver();
    try {
      view.setSource(source);
      await vi.waitFor(() => expect(view.lastMesh?.resolution).toBe(64));
      const highVertices = view.lastMesh!.vertices;
      const highSkeleton = view.skeleton;
      view.update(0, driver);

      view.setSource({ ...source, resolution: QUALITY_LADDER[3]!.meshGrid.final });
      await vi.waitFor(() => expect(view.lastMesh?.resolution).toBe(40));
      expect(view.lastMesh!.vertices).toBeLessThan(highVertices);
      expect(view.skeleton).toEqual(highSkeleton);
      expect(view.update(0, driver).map((event) => event.kind)).toEqual(["meshed"]);

      // A cached high-quality mesh must not satisfy the low-quality request,
      // and a later increase must be able to recover the original surface.
      view.setSource(source);
      await vi.waitFor(() => expect(view.lastMesh?.resolution).toBe(64));
      expect(view.lastMesh!.vertices).toBe(highVertices);
      expect(view.update(0, driver).map((event) => event.kind)).toEqual(["meshed"]);
    } finally {
      view.dispose();
    }
  });
});
