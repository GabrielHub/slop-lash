import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { findGamePayloadByStatus } from "./route-data";

describe("findGamePayloadByStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.game.findUnique.mockResolvedValue({ id: "game-1", status: "WRITING" });
  });

  it("does not cache active game payloads", async () => {
    await findGamePayloadByStatus("ROOMA", "WRITING", "v1");
    await findGamePayloadByStatus("ROOMA", "WRITING", "v1");

    expect(prismaMock.game.findUnique).toHaveBeenCalledTimes(2);
  });

  it("still caches final-results payloads", async () => {
    prismaMock.game.findUnique.mockResolvedValue({ id: "game-2", status: "FINAL_RESULTS" });

    await findGamePayloadByStatus("ROOMB", "FINAL_RESULTS", "v9");
    await findGamePayloadByStatus("ROOMB", "FINAL_RESULTS", "v9");

    expect(prismaMock.game.findUnique).toHaveBeenCalledTimes(1);
  });
});
