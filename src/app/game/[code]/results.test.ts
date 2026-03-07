import { describe, expect, it } from "vitest";

import { analyzePromptOutcome } from "./results";

describe("analyzePromptOutcome", () => {
  it("uses the weighted winner when marking ai-beats-human", () => {
    const outcome = analyzePromptOutcome({
      id: "prompt-1",
      roundId: "round-1",
      text: "Prompt",
      assignments: [],
      responses: [
        {
          id: "human-response",
          promptId: "prompt-1",
          playerId: "human-player",
          text: "human joke",
          pointsEarned: 250,
          failReason: null,
          reactions: [],
          player: {
            id: "human-player",
            name: "Human",
            type: "HUMAN",
            modelId: null,
            idleRounds: 0,
            humorRating: 1,
            winStreak: 0,
            participationStatus: "ACTIVE",
            lastSeen: new Date().toISOString(),
          },
        },
        {
          id: "ai-response",
          promptId: "prompt-1",
          playerId: "ai-player",
          text: "ai joke",
          pointsEarned: 400,
          failReason: null,
          reactions: [],
          player: {
            id: "ai-player",
            name: "AI",
            type: "AI",
            modelId: "openai/gpt-5.2-chat",
            idleRounds: 0,
            humorRating: 1,
            winStreak: 0,
            participationStatus: "ACTIVE",
            lastSeen: new Date().toISOString(),
          },
        },
      ],
      votes: [
        {
          id: "vote-1",
          promptId: "prompt-1",
          voterId: "human-voter",
          responseId: "ai-response",
          failReason: null,
          voter: { id: "human-voter", type: "HUMAN" },
        },
        {
          id: "vote-2",
          promptId: "prompt-1",
          voterId: "ai-voter-1",
          responseId: "human-response",
          failReason: null,
          voter: { id: "ai-voter-1", type: "AI" },
        },
        {
          id: "vote-3",
          promptId: "prompt-1",
          voterId: "ai-voter-2",
          responseId: "human-response",
          failReason: null,
          voter: { id: "ai-voter-2", type: "AI" },
        },
      ],
    });

    expect(outcome.winnerResponseId).toBe("ai-response");
    expect(outcome.aiBeatsHuman).toBe(true);
    expect(outcome.isUnanimous).toBe(false);
  });
});
