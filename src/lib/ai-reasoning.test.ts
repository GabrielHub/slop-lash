import { describe, expect, test } from "vite-plus/test";
import { MINIMAL_REASONING } from "./ai-reasoning";

describe("reasoning policy", () => {
  test("keeps reasoning on at the lowest portable effort", () => {
    expect(MINIMAL_REASONING).toEqual({ reasoning: "minimal" });
  });
});
