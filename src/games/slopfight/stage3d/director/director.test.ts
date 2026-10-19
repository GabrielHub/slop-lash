import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, test } from "vite-plus/test";
import type { ArenaId } from "../../arenas";
import type { ArenaNodes } from "../arena/nodes";
import { StageEvents } from "../events";
import { PostFx } from "../look/post-fx";
import { HIT_STOP_FRAMES, StageClock, slowMoLengthMs } from "./clock";
import { Director, MIN_SHOT_SECONDS } from "./director";
import { SHOT_IDS, SHOTS } from "./shots";

const FRAME = 1 / 60;

function run(director: Director, seconds: number) {
  for (let t = 0; t < seconds; t += FRAME) director.update(FRAME);
}

const finite = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

describe("Director rules", () => {
  test("a request inside the minimum shot length waits, then cuts", () => {
    const director = new Director({ drift: 0 });
    director.setBase("fight_wide");
    run(director, 0.5);
    expect(director.request("fight_close", { priority: 1 })).toBe("queued");
    expect(director.shot).toBe("fight_wide");
    run(director, MIN_SHOT_SECONDS - 0.5 + 0.05);
    expect(director.shot).toBe("fight_close");
  });

  test("a waiting request expires after its ttl", () => {
    const director = new Director({ drift: 0 });
    director.setBase("fight_wide");
    run(director, 0.1);
    director.request("edge_drama", { ttl: 0.2 });
    run(director, MIN_SHOT_SECONDS);
    expect(director.shot).toBe("fight_wide");
  });

  test("force cuts immediately", () => {
    const director = new Director({ drift: 0 });
    director.setBase("fight_wide");
    run(director, 0.2);
    expect(director.request("face_off_low", { force: true })).toBe("cut");
    expect(director.shot).toBe("face_off_low");
  });

  test("a transient shot returns to the base after its hold", () => {
    const director = new Director({ drift: 0 });
    director.setBase("fight_wide");
    run(director, MIN_SHOT_SECONDS + 0.1);
    expect(director.request("impact_pop", { hold: 0.8, priority: 3 })).toBe("cut");
    run(director, 0.5);
    expect(director.request("fight_close", { priority: 1 })).toBe("ignored");
    run(director, MIN_SHOT_SECONDS);
    expect(director.shot).toBe("fight_wide");
  });

  test("never cuts twice inside the minimum shot length", () => {
    const director = new Director({ drift: 0 });
    const cuts: number[] = [];
    const events = new StageEvents();
    let t = 0;
    events.on("cut", () => cuts.push(t));
    const watched = new Director({ drift: 0, events });
    watched.setBase("fight_wide");
    const ids = ["fight_close", "edge_drama", "impact_pop", "ragdoll_follow"] as const;
    for (let frame = 0; frame < 600; frame += 1) {
      t = frame * FRAME;
      if (frame % 7 === 0) watched.request(ids[frame % ids.length]!, { priority: frame % 3 });
      watched.update(FRAME);
    }
    for (let i = 1; i < cuts.length; i += 1) {
      expect(cuts[i]! - cuts[i - 1]!).toBeGreaterThanOrEqual(MIN_SHOT_SECONDS - FRAME * 1.5);
    }
    expect(cuts.length).toBeGreaterThan(3);
    expect(director.shot).toBe("crane_establish");
  });

  test("letterbox follows the shot", () => {
    const fx = new PostFx();
    const director = new Director({ drift: 0, fx });
    director.setBase("face_off_low", { side: "B" });
    expect(fx.letterboxTarget).toBe(1);
    director.setBase("fight_wide");
    expect(fx.letterboxTarget).toBe(0);
  });

  test("match cut keeps the target where it was on screen", () => {
    const director = new Director({ drift: 0 });
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    director.setBase("roster");
    run(director, 2);
    director.apply(camera);
    const fighter = new Vector3(-0.75, 0.5, -0.4);
    const before = fighter.clone().project(camera);
    director.matchCut("face_off_low", { side: "A", targets: [fighter, new Vector3(1.4, 0.5, 0)] }, fighter, camera, 0.7);
    director.update(FRAME);
    director.apply(camera);
    const after = fighter.clone().project(camera);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });
});

describe("Director and the clock's debt", () => {
  /** A clock on a fake wall and a director that repays it, ticked together like the canvas does. */
  function rig() {
    let wall = 5_000_000;
    const events = new StageEvents();
    const resyncs: number[] = [];
    events.on("resync", ({ droppedMs }) => resyncs.push(droppedMs));
    const clock = new StageClock({ wallNow: () => wall, onResync: (droppedMs) => events.emit("resync", { droppedMs }) });
    const director = new Director({ drift: 0, events, clock });
    const step = (seconds: number) => {
      for (let t = 0; t < seconds - 1e-9; t += FRAME) {
        wall += FRAME * 1000;
        clock.tick(FRAME);
        director.update(FRAME);
      }
    };
    return { clock, director, resyncs, step };
  }

  test("the cut back from a big hit repays the hit stop and slow-motion debt", () => {
    const { clock, director, resyncs, step } = rig();
    director.setBase("fight_wide");
    step(MIN_SHOT_SECONDS + 0.1);
    // services.impact({ big: true }) plus the scene's impact_pop request.
    clock.hitStop();
    clock.slowMo();
    expect(director.request("impact_pop", { hold: 0.9, priority: 3 })).toBe("cut");
    step(0.5);
    expect(director.shot).toBe("impact_pop");
    expect(clock.debtMs).toBeGreaterThan(100);
    step(MIN_SHOT_SECONDS);
    expect(director.shot).toBe("fight_wide");
    expect(clock.settled).toBe(true);
    expect(clock.debtMs).toBe(0);
    expect(clock.now).toBe(clock.serverNow());
    expect(resyncs).toHaveLength(1);
    const expected = HIT_STOP_FRAMES * FRAME * 1000 + slowMoLengthMs() * 0.4;
    expect(resyncs[0]!).toBeGreaterThan(expected * 0.75);
    expect(resyncs[0]!).toBeLessThan(slowMoLengthMs() + HIT_STOP_FRAMES * FRAME * 1000);
  });

  test("a cut inside a hit stop or slow motion leaves the debt for the next cut", () => {
    const { clock, director, resyncs, step } = rig();
    director.setBase("fight_wide");
    clock.slowMo();
    step(0.3);
    const debt = clock.debtMs;
    expect(debt).toBeGreaterThan(0);
    director.request("fight_close", { force: true });
    expect(clock.debtMs).toBe(debt);
    expect(resyncs).toHaveLength(0);
    step(slowMoLengthMs() / 1000);
    expect(clock.slowMotion).toBe(false);
    director.request("edge_drama", { force: true });
    expect(clock.debtMs).toBe(0);
    expect(resyncs).toHaveLength(1);
  });

  test("a match cut never jumps time", () => {
    const { clock, director, step } = rig();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    director.setBase("roster");
    clock.hitStop();
    step(1);
    expect(clock.settled).toBe(true);
    const debt = clock.debtMs;
    expect(debt).toBeGreaterThan(0);
    director.apply(camera);
    director.matchCut("face_off_low", { side: "A" }, new Vector3(-0.75, 0.5, -0.4), camera);
    expect(clock.debtMs).toBe(debt);
  });
});

describe("shots", () => {
  test("every shot solves to a finite pose with and without targets", () => {
    for (const id of SHOT_IDS) {
      for (const targets of [[], [new Vector3(-1.4, 0, 0), new Vector3(1.4, 0, 0)], [new Vector3(2.8, 0.2, 0.3)]]) {
        const director = new Director({ drift: 1 });
        director.setBase(id, { targets });
        for (let i = 0; i < 90; i += 1) {
          const pose = director.update(FRAME);
          expect(finite(pose.position), `${id} position`).toBe(true);
          expect(finite(pose.target), `${id} target`).toBe(true);
          expect(pose.position.distanceTo(pose.target), `${id} distance`).toBeGreaterThan(0.2);
          expect(pose.fov).toBeGreaterThan(10);
          expect(pose.fov).toBeLessThan(80);
        }
      }
    }
  });

  test("edge_drama looks down over a shallow drop and stays low over a deep one", () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    const fighter = new Vector3(2.65, 0.5, 0.6);
    const solve = (arena: ArenaId) => {
      // No anchors in the set: the default Cam_Edge_* anchors, as in a stand-in set.
      const director = new Director({ drift: 0 });
      director.setNodes({ arena, cameras: {} } as unknown as ArenaNodes);
      director.setBase("edge_drama", { targets: [fighter] });
      run(director, 2);
      director.apply(camera);
      return { pose: director.output, feet: fighter.clone().setY(0).project(camera) };
    };
    const garage = solve("FLOODED_GARAGE");
    expect(garage.pose.position.y).toBeCloseTo(0.95, 1);
    expect(garage.pose.target.y).toBeLessThan(garage.pose.position.y);
    expect(Math.abs(garage.feet.x)).toBeLessThan(1);
    expect(Math.abs(garage.feet.y)).toBeLessThan(1);
    for (const arena of ["ROOFTOP", "KITCHEN_COUNTER"] as const) {
      expect(solve(arena).pose.position.y, arena).toBeLessThan(0.6);
    }
  });

  test("hero shots carry depth of field; the rest do not", () => {
    const hero = SHOT_IDS.filter((id) => SHOTS[id].dof > 0).toSorted();
    expect(hero).toEqual(["face_off_low", "podium", "replay", "slowmo_orbit", "winner_pose"]);
  });

  test("ragdoll_follow descends with a fighter below the rooftop", () => {
    const director = new Director({ drift: 0 });
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    const fighter = new Vector3(0.5, -20, -4.5);
    director.setBase("ragdoll_follow", { targets: [fighter] });
    run(director, 1);
    director.apply(camera);
    expect(director.output.position.y).toBeCloseTo(fighter.y + 1.35, 2);
    expect(director.output.position.distanceTo(fighter)).toBeLessThan(4);
    const projected = fighter.clone().project(camera);
    expect(Math.abs(projected.x)).toBeLessThan(1);
    expect(Math.abs(projected.y)).toBeLessThan(1);
  });

  test("fight_wide keeps both fighters in frame wherever they are", () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    for (const [a, b] of [
      [new Vector3(-2.8, 0, -2.8), new Vector3(2.8, 0, 2.8)],
      [new Vector3(-0.2, 0, 0), new Vector3(0.2, 0, 0)],
      [new Vector3(2.5, 0, -2.5), new Vector3(2.9, 0.5, -1.5)],
    ] as const) {
      const director = new Director({ drift: 0 });
      director.setBase("fight_wide", { targets: [a, b] });
      run(director, 3);
      director.apply(camera);
      for (const point of [a, b, a.clone().setY(1), b.clone().setY(1)]) {
        const ndc = point.clone().project(camera);
        expect(Math.abs(ndc.x)).toBeLessThan(1);
        expect(Math.abs(ndc.y)).toBeLessThan(1);
      }
    }
  });
});
