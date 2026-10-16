import { describe, expect, it } from "vite-plus/test";
import { keyboardInset, revealDelta } from "./keyboard";

describe("keyboardInset", () => {
  it("is what an iOS keyboard covers of the layout viewport, wherever the view is panned", () => {
    expect(keyboardInset(800, { height: 450, offsetTop: 0, scale: 1 })).toBe(350);
    expect(keyboardInset(800, { height: 450, offsetTop: 120, scale: 1 })).toBe(230);
  });

  it("is 0 when the page already shrank (Android), with no keyboard, or when pinch-zoomed", () => {
    expect(keyboardInset(450, { height: 450, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 800, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 400, offsetTop: 100, scale: 2 })).toBe(0);
  });
});

describe("revealDelta", () => {
  const visible = { top: 56, bottom: 400 };

  it("leaves a frame that is already in view", () => {
    expect(revealDelta({ top: 100, bottom: 380 }, { top: 100, bottom: 230 }, visible)).toBe(0);
  });

  it("scrolls Send up above the keyboard", () => {
    expect(revealDelta({ top: 150, bottom: 450 }, { top: 150, bottom: 280 }, visible)).toBe(50);
  });

  it("never pushes the field under the top bar, even when Send can't fit", () => {
    expect(revealDelta({ top: 100, bottom: 700 }, { top: 100, bottom: 230 }, visible)).toBe(44);
  });

  it("scrolls back down to a field hidden under the top bar", () => {
    expect(revealDelta({ top: 20, bottom: 300 }, { top: 20, bottom: 150 }, visible)).toBe(-36);
  });
});
