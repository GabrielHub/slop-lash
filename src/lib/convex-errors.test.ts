import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";
import { getConvexErrorMessage } from "./convex-errors";

describe("getConvexErrorMessage", () => {
  it("prefers public ConvexError data", () => {
    expect(getConvexErrorMessage(new ConvexError("Room is full"), "Fallback")).toBe("Room is full");
  });

  it("removes the Convex transport prefix and server trace", () => {
    expect(
      getConvexErrorMessage(
        new Error(
          "[CONVEX M(lobby:start)] Uncaught ConvexError: Need 2 more players\n    at handler",
        ),
        "Fallback",
      ),
    ).toBe("Need 2 more players");
  });

  it("falls back for non-errors", () => {
    expect(getConvexErrorMessage(null, "Something went wrong")).toBe("Something went wrong");
  });
});
