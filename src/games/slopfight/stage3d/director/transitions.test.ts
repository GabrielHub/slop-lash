import { Vector3 } from "three";
import { describe, expect, test } from "vite-plus/test";
import { StageEvents } from "../events";
import { PostFx } from "../look/post-fx";
import { Director } from "./director";
import { SLAM_IMPACT_MS, TransitionController } from "./transitions";

function setup() {
  const fx = new PostFx();
  const events = new StageEvents();
  const director = new Director({ fx, events, drift: 0 });
  const transitions = new TransitionController({ fx, director, events, camera: () => null });
  const log: string[] = [];
  events.on("transition", ({ kind, phase }) => log.push(`${kind}:${phase}`));
  events.on("slam", () => log.push("slam:impact"));
  return { fx, director, transitions, log };
}

const frames = (transitions: TransitionController, ms: number) => {
  for (let t = 0; t < ms; t += 1000 / 60) transitions.update(1 / 60);
};

describe("TransitionController", () => {
  test("a wipe covers, calls onCover once at full cover, then clears", async () => {
    const { fx, transitions, log } = setup();
    let covers = 0;
    const done = transitions.play("wipe", {
      onCover: () => {
        covers += 1;
        expect(fx.wipe.progress).toBeGreaterThan(0.9);
      },
    });
    frames(transitions, 200);
    expect(fx.wipe.progress).toBeGreaterThan(0);
    expect(fx.wipe.progress).toBeLessThan(1);
    frames(transitions, 1200);
    await done;
    expect(covers).toBe(1);
    expect(fx.wipe.progress).toBe(0);
    expect(log).toEqual(["wipe:start", "wipe:cover", "wipe:end"]);
  });

  test("a slam hits at the impact time with shake, then flicks off", async () => {
    const { transitions, log } = setup();
    const done = transitions.play("slam", { text: "FIGHT!" });
    expect(transitions.slam.visible).toBe(true);
    expect(transitions.slam.scaleX).toBeGreaterThan(2);
    frames(transitions, SLAM_IMPACT_MS + 40);
    expect(log).toContain("slam:impact");
    frames(transitions, 3000);
    await done;
    expect(transitions.slam.visible).toBe(false);
  });

  test("an iris closes on the target and holds open around it", () => {
    const { fx, transitions } = setup();
    const victim = new Vector3(2.9, 0.2, 0);
    void transitions.play("iris", { target: victim, radius: 0.2 });
    frames(transitions, 900);
    expect(fx.iris.radius).toBeLessThan(0.25);
    expect(fx.iris.world?.equals(victim)).toBe(true);
  });

  test("freezeAt stops the timeline for screenshots", () => {
    const { fx, transitions } = setup();
    void transitions.play("wipe", { freezeAt: 0.3 });
    frames(transitions, 5000);
    expect(fx.wipe.progress).toBeGreaterThan(0.5);
    expect(fx.wipe.progress).toBeLessThan(1);
    expect(transitions.isPlaying("wipe")).toBe(true);
  });

  test("playing a kind again finishes the previous one (its cover included)", async () => {
    const { transitions } = setup();
    let firstCovered = false;
    const first = transitions.play("wipe", { onCover: () => (firstCovered = true) });
    frames(transitions, 100);
    void transitions.play("wipe", {});
    await first;
    expect(firstCovered).toBe(true);
  });

  test("letterbox in and out drive the bars on the timeline (and hold under freezeAt)", () => {
    const { fx, transitions } = setup();
    void transitions.play("letterboxIn", {});
    transitions.update(0.225);
    expect(fx.letterbox).toBeCloseTo(0.5, 2);
    transitions.update(0.5);
    expect(fx.letterbox).toBe(1);
    expect(fx.letterboxTarget).toBe(1);
    void transitions.play("letterboxOut", { ms: 300, freezeAt: 0.5 });
    transitions.update(1);
    expect(fx.letterbox).toBeCloseTo(0.5, 2);
  });

  test("a cut covers immediately", async () => {
    const { transitions } = setup();
    let covered = false;
    await transitions.play("cut", { onCover: () => (covered = true) });
    expect(covered).toBe(true);
  });
});
