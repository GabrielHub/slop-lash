import { describe, expect, test } from "vite-plus/test";
import { arenaFromModeView, stageInputFromView, toStagePhase } from "./stage-input";

describe("stage input", () => {
  test("maps room status and phase", () => {
    expect(toStagePhase("LOBBY", "")).toBe("LOBBY");
    expect(toStagePhase("FINISHED", "RESULT")).toBe("FINISHED");
    expect(toStagePhase("PLAYING", "FACE_OFF")).toBe("FACE_OFF");
    expect(toStagePhase("PLAYING", "SOMETHING_NEW")).toBe("BUILD");
  });

  test("the arena comes from the fight, then the round, then the first arena, then the default", () => {
    expect(arenaFromModeView({ kind: "SLOPFIGHT" }, 1).arena).toBe("FLOODED_GARAGE");
    const arenas = ["ROOFTOP", "KITCHEN_COUNTER", "FLOODED_GARAGE"];
    expect(arenaFromModeView({ arenas }, 0).arena).toBe("ROOFTOP");
    expect(arenaFromModeView({ arenas }, 2).arena).toBe("KITCHEN_COUNTER");
    expect(arenaFromModeView({ arenas, currentFight: { arena: "FLOODED_GARAGE" } }, 1).arena).toBe(
      "FLOODED_GARAGE",
    );
    const fights = [
      { id: "f1", arena: "ROOFTOP" },
      { id: "f2", arena: "KITCHEN_COUNTER" },
    ];
    expect(arenaFromModeView({ arenas, fights, currentFightId: "f2" }, 1).arena).toBe("KITCHEN_COUNTER");
    expect(arenaFromModeView({ arenas: ["NOPE"] }, 1)).toEqual({
      arena: "FLOODED_GARAGE",
      order: ["FLOODED_GARAGE"],
    });
  });

  test("builds a phase key that changes with the generation", () => {
    const view = {
      room: { code: "ABCD", status: "PLAYING", phase: "FIGHT", step: 1, round: 2, phaseGeneration: 9 },
      mode: { arenas: ["KITCHEN_COUNTER", "ROOFTOP", "FLOODED_GARAGE"] },
    };
    const input = stageInputFromView(view, 120, true);
    expect(input.phaseKey).toBe("FIGHT:2:1:9");
    expect(input.arena).toBe("ROOFTOP");
    expect(input.arenaOrder).toHaveLength(3);
    expect(input.clockOffsetMs).toBe(120);
  });
});
