import type { ControllerGameState } from "@/lib/controller-types";

export interface MatchSlopControllerShellFixture {
  gameState: ControllerGameState;
  isHost: boolean;
  advance(): Promise<void> | void;
  castVote(promptId: string, responseId: string | null): Promise<void> | void;
  end(): Promise<void> | void;
  managePersona(action: "generate" | "skip"): Promise<void> | void;
  start(): Promise<void> | void;
  submitResponse(
    promptId: string,
    text: string,
    selectedPromptId: string | null,
  ): Promise<void> | void;
}
