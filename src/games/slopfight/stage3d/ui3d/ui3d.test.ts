import { describe, expect, it } from "vite-plus/test";
import { CAPTION_BOTTOM_NDC, captionBottom, captionX, CHARS_PER_LINE, chooseCaptionSlot, wrapCaption } from "./caption-layout";
import { AlwaysDepth, Mesh, MeshStandardMaterial } from "three";
import { contrastRatio, isLightColor, keepOutlineDark, luminance, onCardTone, textGlowOn, textOn, UI_COLORS, UI_MAX_LUMINANCE, uiOutline, uiToon } from "./materials";
import { TOY_COLOR_VALUES } from "../../vocab";
import { ARENA_MOODS } from "../look/moods";
import { clamp01, createPose, ENTER_SECONDS, enterPose, exitPose, EXIT_SECONDS, ringDown, springTo1 } from "./motion";
import { sanitizeStageText } from "./sanitize";

describe("motion", () => {
  it("springs settle at 1 and ring-downs decay to 0", () => {
    expect(springTo1(0)).toBeCloseTo(0, 5);
    expect(springTo1(3)).toBeCloseTo(1, 2);
    // Overshoot is part of the language: it passes 1 before settling.
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => springTo1(i / 40)));
    expect(peak).toBeGreaterThan(1);
    expect(Math.abs(ringDown(2, 0.3))).toBeLessThan(0.001);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it("every entrance ends near the rest pose (MotionGroup snaps the rest)", () => {
    for (const kind of ["rise", "drop", "pop", "none"] as const) {
      const pose = createPose();
      const done = enterPose(kind, ENTER_SECONDS[kind] + 0.01, pose, { distance: 2 });
      expect(done).toBe(true);
      expect(Math.abs(pose.y)).toBeLessThan(0.1);
      expect(Math.abs(pose.sx - 1)).toBeLessThan(0.1);
      expect(Math.abs(pose.sy - 1)).toBeLessThan(0.1);
    }
  });

  it("a rise starts below and a drop above", () => {
    const rise = createPose();
    enterPose("rise", 0, rise, { distance: 2 });
    expect(rise.y).toBeLessThan(-1);
    const drop = createPose();
    enterPose("drop", 0, drop, { distance: 2 });
    expect(drop.y).toBeGreaterThan(1);
  });

  it("the flick-off finishes", () => {
    const pose = createPose();
    expect(exitPose(EXIT_SECONDS + 0.01, pose)).toBe(true);
  });
});

describe("sanitizeStageText", () => {
  it("folds typography the font cannot draw", () => {
    expect(sanitizeStageText("It’s “here” — now…")).toBe('It\'s "here" - now...');
    // Accents fold to the base letter; letters with no decomposition outside Latin-1 drop.
    expect(sanitizeStageText("Café Zoë Ł")).toBe("Cafe Zoe");
    expect(sanitizeStageText("Piñata")).toBe("Pinata");
  });

  it("drops emoji and collapses whitespace, keeping line breaks", () => {
    expect(sanitizeStageText("  Big \u{1F525}  Bob \n second   line ")).toBe("Big Bob\nsecond line");
  });

  it("never returns empty for a name that had only undrawable characters", () => {
    expect(sanitizeStageText("\u{1F600}\u{1F600}")).toBe("?");
    expect(sanitizeStageText("")).toBe("");
    expect(sanitizeStageText("   ")).toBe("");
  });
});

describe("wrapCaption", () => {
  it("keeps a short line whole", () => {
    expect(wrapCaption("Larry floats in.")).toEqual(["Larry floats in."]);
  });

  it("breaks a long line into two even halves", () => {
    const text = "Jelly Supreme floats in. It knows it looks good, and so does the crowd.";
    const lines = wrapCaption(text);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toBe(text);
    const [a, b] = lines.map((line) => line.length);
    expect(Math.abs(a! - b!)).toBeLessThan(CHARS_PER_LINE / 2);
  });
});

describe("caption placement", () => {
  const W = 0.5;
  const H = 0.2;
  const bottom = CAPTION_BOTTOM_NDC;
  const box = (minX: number, maxX: number, minY: number, maxY: number) => ({ minX, maxX, minY, maxY });

  it("sits low, and above the letterbox bars when they are in", () => {
    expect(captionBottom(0)).toBe(CAPTION_BOTTOM_NDC);
    // Full 2.39:1 bars on 16:9: the bar's edge is at -0.744.
    expect(captionBottom((1 - 16 / 9 / 2.39) / 2)).toBeGreaterThan(-0.744);
  });

  it("keeps the side slots inside the frame", () => {
    expect(captionX(-1, W) - W / 2).toBeGreaterThan(-1);
    expect(captionX(1, W) + W / 2).toBeLessThan(1);
    expect(captionX(0, W)).toBe(0);
  });

  it("takes the centre when nothing is under it", () => {
    expect(chooseCaptionSlot([box(-0.5, 0.5, -0.3, 0.5)], W, H, bottom, -1, true)).toBe(0);
  });

  it("moves off a fighter standing in the bottom centre", () => {
    const fighter = box(-0.3, 0.3, -0.95, 0.2);
    expect(chooseCaptionSlot([fighter], W, H, bottom, 0, true)).not.toBe(0);
    // Two fighters low on the left: the right.
    expect(chooseCaptionSlot([box(-0.9, -0.5, -0.95, 0), box(-0.4, 0.1, -0.95, 0)], W, H, bottom, 0, true)).toBe(1);
  });

  it("stays put during a line unless it covers a fighter", () => {
    expect(chooseCaptionSlot([box(-0.2, 0.2, -0.5, 0.5)], W, H, bottom, 1, false)).toBe(1);
    expect(chooseCaptionSlot([box(0.4, 0.95, -0.95, 0.3)], W, H, bottom, 1, false)).not.toBe(1);
  });
});

describe("card colours", () => {
  it("picks ink on light colours and bone on dark ones", () => {
    expect(textOn("#fbf1dc")).toBe(UI_COLORS.ink);
    expect(textOn("#2b1d24")).toBe(UI_COLORS.bone);
    expect(isLightColor("#f5c94c")).toBe(true);
    expect(isLightColor("#3a2138")).toBe(false);
  });

  it("picks whichever of ink and bone contrasts more, so mid tones take ink", () => {
    // Tomato reads better with ink (4.4:1) than bone (3.3:1); cobalt with bone.
    expect(textOn(TOY_COLOR_VALUES.tomato.hex)).toBe(UI_COLORS.ink);
    expect(textOn(TOY_COLOR_VALUES.cobalt.hex)).toBe(UI_COLORS.bone);
    for (const { hex } of Object.values(TOY_COLOR_VALUES)) {
      const text = textOn(hex);
      const other = text === UI_COLORS.ink ? UI_COLORS.bone : UI_COLORS.ink;
      expect(contrastRatio(hex, text)).toBeGreaterThanOrEqual(contrastRatio(hex, other));
      expect(contrastRatio(hex, text)).toBeGreaterThan(3);
    }
  });

  it("makes bone text on dark surfaces glow more than ink on light ones", () => {
    expect(textGlowOn(UI_COLORS.plum)).toBeGreaterThan(textGlowOn(UI_COLORS.card));
    expect(textGlowOn(UI_COLORS.card)).toBe(0.12);
  });

  it("darkens colours that would vanish on cream card stock and keeps dark ones", () => {
    const cream = "#f7ecd2";
    expect(luminance(onCardTone(cream))).toBeLessThan(luminance(cream) * 0.75);
    expect(onCardTone("#2f4a9c")).toBe("#2f4a9c");
  });
});

describe("caption overlay materials", () => {
  it("renders above transparent world surfaces without changing world-material depth behavior", () => {
    for (const create of [uiToon, (color: string, options: { overlay?: boolean }) => uiOutline(color, 2.4, options)]) {
      const world = create(UI_COLORS.plum, {});
      const overlay = create(UI_COLORS.plum, { overlay: true });

      expect(overlay).not.toBe(world);
      expect(overlay.transparent).toBe(true);
      expect(overlay.depthTest).toBe(false);
      expect(overlay.depthWrite).toBe(false);
      expect(overlay.fog).toBe(false);
      expect(world.transparent).toBe(false);
      expect(world.depthTest).toBe(true);
      expect(world.depthWrite).toBe(true);
    }
  });

  it("can write depth (so depth of field keeps it sharp) while still drawing over everything", () => {
    const overlay = uiToon(UI_COLORS.plum, { overlay: true, depthWrite: true });
    expect(overlay).not.toBe(uiToon(UI_COLORS.plum, { overlay: true }));
    // WebGL skips depth writes when the depth test is off: test, but always pass.
    expect(overlay.depthTest).toBe(true);
    expect(overlay.depthFunc).toBe(AlwaysDepth);
    expect(overlay.depthWrite).toBe(true);
    expect(overlay.transparent).toBe(true);
  });
});

describe("kit materials and bloom", () => {
  it("caps lit kit surfaces under every arena's bloom threshold", () => {
    for (const mood of Object.values(ARENA_MOODS)) expect(UI_MAX_LUMINANCE).toBeLessThan(mood.bloom.threshold);
    expect(uiToon(UI_COLORS.card).defines?.SLOP_MAX_LUMINANCE).toBe(UI_MAX_LUMINANCE.toFixed(3));
  });

  it("keeps a text outline (troika's Object.create copy of the fill) from inheriting the fill's glow", () => {
    const fill = new MeshStandardMaterial({ emissive: "#fff2d6", emissiveIntensity: 0.62 });
    const outline = Object.assign(Object.create(fill) as MeshStandardMaterial, { isTextOutlineMaterial: true });
    const drawn: number[] = [];
    // Troika's Text defines onBeforeRender on its class, as here.
    class TextMesh extends Mesh {
      override onBeforeRender(...args: Parameters<Mesh["onBeforeRender"]>): void {
        drawn.push((args[4] as MeshStandardMaterial).emissiveIntensity);
      }
    }
    const mesh = new TextMesh();
    keepOutlineDark(mesh);
    keepOutlineDark(mesh);
    const draw = (material: MeshStandardMaterial) => mesh.onBeforeRender(null!, null!, null!, null!, material, null!);
    draw(outline);
    draw(fill);
    expect(drawn).toEqual([0, 0.62]);
    fill.emissiveIntensity = 0.3;
    expect(outline.emissiveIntensity).toBe(0);
  });
});
