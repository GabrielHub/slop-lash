"use client";

// A player's doodle as a live texture: the strokes painted with the forge's
// own brush model (raster.ts: the phone's thick round ink on the cream
// canvas, phone palette, the eraser paints cream), so the easel shows exactly
// what the Foundry will see. New batches paint incrementally; anything else
// (an undo removed a stroke, a new layer) repaints from scratch. An upgrade's
// layer shows over the earlier drawing faded to 35%.

import { useEffect, useMemo } from "react";
import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import { blankRaster, fadeRaster, paintStrokes, type RasterImage } from "../../raster";
import { strokesByLayer, type StrokeBatch } from "../../strokes";

/** Texture size: crisp on an easel at the build shot, cheap to repaint. */
export const DOODLE_TEXTURE_SIZE = 320;

// The stroke count is part of the key: undo shortens the last row in place (same seq).
const batchKey = (batch: StrokeBatch) => `${batch.layer}:${batch.seq}:${batch.strokes.length}`;

export class DoodleRaster {
  readonly image: RasterImage;
  readonly texture: DataTexture;
  private painted: string[] = [];
  private paintedTop = -1;
  private strokeCount = 0;

  constructor(size = DOODLE_TEXTURE_SIZE) {
    this.image = blankRaster(size);
    this.texture = new DataTexture(this.image.data, size, size, RGBAFormat, UnsignedByteType);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    // Raster rows run top to bottom; flip so the drawing reads upright on a plane.
    this.texture.flipY = false;
    this.texture.repeat.set(1, -1);
    this.texture.offset.set(0, 1);
    this.texture.needsUpdate = true;
  }

  /** Strokes painted so far. */
  get strokes(): number {
    return this.strokeCount;
  }

  /**
   * Paint `batches` (one fighter's rows). `topLayer`: the layer shown at full
   * strength; earlier layers fade under it when it has strokes. Returns true
   * when the texture changed.
   */
  update(batches: readonly StrokeBatch[], topLayer = 0): boolean {
    const shown = batches.filter((batch) => batch.layer <= topLayer);
    const sorted = [...shown].sort((a, b) => a.layer - b.layer || a.seq - b.seq);
    const keys = sorted.map(batchKey);
    const top = Math.max(0, ...sorted.map((batch) => batch.layer));
    const prefix = this.paintedTop === top && keys.length >= this.painted.length && this.painted.every((key, index) => keys[index] === key);
    if (prefix && keys.length === this.painted.length) return false;
    if (prefix) {
      const fresh = sorted.slice(this.painted.length);
      paintStrokes(this.image, fresh.flatMap((batch) => batch.strokes));
      this.strokeCount += fresh.reduce((sum, batch) => sum + batch.strokes.length, 0);
    } else {
      this.repaint(sorted, top);
    }
    this.painted = keys;
    this.paintedTop = top;
    this.texture.needsUpdate = true;
    return true;
  }

  private repaint(sorted: readonly StrokeBatch[], top: number) {
    const blank = blankRaster(this.image.width);
    this.image.data.set(blank.data);
    const layers = strokesByLayer(sorted);
    const topGroup = top > 0 ? layers.find((group) => group.layer === top) : undefined;
    const below = topGroup ? layers.filter((group) => group !== topGroup) : layers;
    paintStrokes(this.image, below.flatMap((group) => group.strokes));
    if (topGroup) {
      fadeRaster(this.image);
      paintStrokes(this.image, topGroup.strokes);
    }
    this.strokeCount = sorted.reduce((sum, batch) => sum + batch.strokes.length, 0);
  }

  dispose() {
    this.texture.dispose();
  }
}

/** A DoodleRaster kept in step with `batches` (painted in an effect, never during render). */
export function useDoodleTexture(batches: readonly StrokeBatch[], topLayer = 0): DoodleRaster {
  const raster = useMemo(() => new DoodleRaster(), []);
  useEffect(() => () => raster.dispose(), [raster]);
  useEffect(() => {
    raster.update(batches, topLayer);
  }, [raster, batches, topLayer]);
  return raster;
}
