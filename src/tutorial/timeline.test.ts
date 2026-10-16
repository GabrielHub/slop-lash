import { describe, expect, test } from "vite-plus/test";
import {
  bezier,
  captionOf,
  chaptersOf,
  cuesFor,
  interpolate,
  progress,
  spring,
  SPRINGS,
  type TutorialScript,
  type TutorialTiming,
} from "./timeline";
import { TUTORIALS } from "./registry";

const SCRIPT: TutorialScript = {
  lead: 2,
  tail: 3,
  lines: [
    { id: "hello", say: "[excited] Hello, everyone!" },
    { id: "rules", say: "Tap once. That's it.", chapter: "Vote", pause: 0.5 },
  ],
};

const TIMING: TutorialTiming = {
  durationMs: 9000,
  audio: null,
  lines: [
    {
      id: "hello",
      text: "Hello, everyone!",
      start: 2,
      end: 3.1,
      words: [
        { text: "Hello,", start: 2, end: 2.4 },
        { text: "everyone!", start: 2.5, end: 3.1 },
      ],
    },
    {
      id: "rules",
      text: "Tap once. That's it.",
      start: 3.6,
      end: 5.2,
      words: [
        { text: "Tap", start: 3.6, end: 3.8 },
        { text: "once.", start: 3.85, end: 4.2 },
        { text: "That's", start: 4.6, end: 4.9 },
        { text: "it.", start: 4.95, end: 5.2 },
      ],
    },
  ],
};

describe("tutorial timing", () => {
  test("captions drop delivery tags", () => {
    expect(captionOf("[excited] Welcome to  SlopLash! [laughs]")).toBe("Welcome to SlopLash!");
  });

  test("cues find lines and words, ignoring case and punctuation", () => {
    const timing = TIMING;
    const cues = cuesFor(timing);
    expect(cues.at("rules")).toBe(timing.lines[1].start);
    expect(cues.end("hello", 0.5)).toBe(timing.lines[0].end + 0.5);
    expect(cues.word("rules", "THAT'S")).toBe(timing.lines[1].words[2].start);
    expect(cues.lineAt(0)).toBeNull();
    expect(cues.lineAt(cues.at("rules") + 0.01)?.id).toBe("rules");
    expect(() => cues.word("rules", "twice")).toThrow(/no word/);
    expect(() => cues.at("missing")).toThrow(/not in the timing/);
  });

  test("chapters start with their first line", () => {
    const timing = TIMING;
    expect(chaptersOf(SCRIPT, timing)).toEqual([{ title: "Vote", start: timing.lines[1].start }]);
  });

  test("every game's timing matches its script", () => {
    for (const entry of Object.values(TUTORIALS)) {
      expect(entry.timing.lines.map((line) => line.id)).toEqual(
        entry.script.lines.map((line) => line.id),
      );
      for (const [index, line] of entry.timing.lines.entries()) {
        expect(line.text).toBe(captionOf(entry.script.lines[index].say));
      }
      expect(entry.timing.durationMs).toBeGreaterThan(30_000);
      expect(entry.timing.durationMs).toBeLessThan(120_000);
    }
  });
});

describe("motion math", () => {
  test("cubic-bezier easings hit their ends and track CSS's", () => {
    const easeOut = bezier(0.22, 1, 0.36, 1);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    // CSS's ease (0.25, 0.1, 0.25, 1) is about 0.8024 at the midpoint.
    expect(bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  test("progress and interpolate clamp at both ends", () => {
    expect(progress(-1, 0, 2)).toBe(0);
    expect(progress(1, 0, 2)).toBe(0.5);
    expect(progress(5, 0, 2)).toBe(1);
    expect(progress(3, 3, 0)).toBe(1);
    expect(interpolate(-1, [0, 1, 2], [10, 20, 0])).toBe(10);
    expect(interpolate(0.5, [0, 1, 2], [10, 20, 0])).toBe(15);
    expect(interpolate(1.5, [0, 1, 2], [10, 20, 0])).toBe(10);
    expect(interpolate(9, [0, 1, 2], [10, 20, 0])).toBe(0);
    expect(() => interpolate(0, [0], [1])).toThrow();
  });

  test("springs start at rest and settle on 1, whatever their damping", () => {
    for (const config of [
      ...Object.values(SPRINGS),
      { stiffness: 100, damping: 20 }, // critically damped
      { stiffness: 100, damping: 40 }, // overdamped
    ]) {
      expect(spring(0, config)).toBe(0);
      expect(spring(-1, config)).toBe(0);
      // Velocity starts at zero: the first instant barely moves.
      expect(spring(0.001, config)).toBeLessThan(0.01);
      expect(spring(4, config)).toBeCloseTo(1, 2);
    }
    // An underdamped spring overshoots; an overdamped one never does.
    const samples = (config: { stiffness: number; damping: number }) =>
      Array.from({ length: 200 }, (_, index) => spring(index / 100, config));
    expect(Math.max(...samples(SPRINGS.jelly))).toBeGreaterThan(1.2);
    expect(Math.max(...samples({ stiffness: 100, damping: 40 }))).toBeLessThanOrEqual(1);
  });
});
