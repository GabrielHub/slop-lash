import { describe, expect, it } from "vite-plus/test";
import type { Stroke, StrokeBatch } from "../../strokes";
import { DoodleRaster } from "./doodle-texture";

const stroke = (x: number): Stroke => ({ c: 1, w: 1, p: [x, 100, x + 120, 300] });

describe("DoodleRaster", () => {
  it("repaints when undo shortens the last row in place", () => {
    const raster = new DoodleRaster(64);
    const two: StrokeBatch = { layer: 0, seq: 0, strokes: [stroke(40), stroke(600)] };
    raster.update([two]);
    const painted = Array.from(raster.image.data);
    expect(raster.strokes).toBe(2);
    // The backend's undo patches the row: same layer and seq, one stroke fewer.
    expect(raster.update([{ ...two, strokes: [stroke(40)] }])).toBe(true);
    expect(raster.strokes).toBe(1);
    expect(Array.from(raster.image.data)).not.toEqual(painted);
  });
});
