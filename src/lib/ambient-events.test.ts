import { describe, expect, it } from "vite-plus/test";
import { HYPE_HOLD_MS, heldEnergy } from "./ambient-events";

describe("heldEnergy", () => {
  it("keeps hype on the stage for the first seconds of a phase", () => {
    expect(heldEnergy("hype", "stage", 0)).toBe("hype");
    expect(heldEnergy("hype", "stage", HYPE_HOLD_MS - 1)).toBe("hype");
  });

  it("settles stage hype to calm once the hold is over", () => {
    expect(heldEnergy("hype", "stage", HYPE_HOLD_MS)).toBe("calm");
    expect(heldEnergy("hype", "stage", 60_000)).toBe("calm");
  });

  it("leaves other energies and the phone alone", () => {
    expect(heldEnergy("focus", "stage", 60_000)).toBe("focus");
    expect(heldEnergy("calm", "stage", 60_000)).toBe("calm");
    expect(heldEnergy("hype", "phone", 60_000)).toBe("hype");
  });
});
