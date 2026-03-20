import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
  createGateway: vi.fn(() => vi.fn()),
}));

import { aiVoteNWay } from "./ai";

describe("aiVoteNWay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("classifies gateway failures caused by our abort timeout as timeout", async () => {
    const timeoutError = new Error("MatchSlop vote for player-1 timed out after 10000ms");
    timeoutError.name = "TimeoutError";

    const gatewayError = new Error(
      "Invalid error response format: Gateway request failed: MatchSlop vote for player-1 timed out after 10000ms",
    );
    gatewayError.name = "GatewayResponseError";

    const controller = new AbortController();
    controller.abort(timeoutError);
    generateTextMock.mockRejectedValue(gatewayError);

    const result = await aiVoteNWay(
      "minimax/minimax-m2.7",
      "prompt",
      [
        { id: "resp-a", label: "A", text: "A joke" },
        { id: "resp-b", label: "B", text: "B joke" },
      ],
      1,
      { abortSignal: controller.signal },
    );

    expect(result).toEqual({
      chosenResponseId: "resp-b",
      usage: {
        modelId: "minimax/minimax-m2.7",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      },
      failReason: "timeout",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[chatslop:aiVoteNWay] minimax/minimax-m2.7 FAILED"),
      expect.objectContaining({
        failReason: "timeout",
        abortSignal: expect.objectContaining({
          aborted: true,
        }),
      }),
    );
  });
});
