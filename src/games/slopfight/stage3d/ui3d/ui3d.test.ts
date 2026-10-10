import { describe, expect, it } from "vite-plus/test";
import { CHARS_PER_LINE, wrapCaption } from "./caption-layout";
import { contrastRatio, isLightColor, luminance, onCardTone, textGlowOn, textOn, UI_COLORS } from "./materials";
import { TOY_COLOR_VALUES } from "../../vocab";
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
