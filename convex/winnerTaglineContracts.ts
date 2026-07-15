import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

export type WinnerTaglineStatus = "ROUND_RESULTS" | "FINAL_RESULTS";

export type WinnerTaglineWorkArgs = {
  jobId: Id<"generationJobs">;
  gameId: Id<"games">;
  leaderId: Id<"players">;
  gameStatus: WinnerTaglineStatus;
  phaseGeneration: number;
  attempt: number;
};

export type WinnerTaglineWorkContext = WinnerTaglineWorkArgs;

export interface WinnerTaglineScoreboardEntry {
  name: string;
  score: number;
  type: "HUMAN" | "AI";
}

export interface WinnerTaglineJokeContext {
  roundNumber: number;
  prompt: string;
  answer: string;
}

export interface WinnerTaglineGenerationContext {
  modelId: string;
  leaderId: Id<"players">;
  leaderName: string;
  isFinal: boolean;
  scoreboard: WinnerTaglineScoreboardEntry[];
  jokes: WinnerTaglineJokeContext[];
}

export interface WinnerTaglineUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type ClaimWinnerTaglineJobResult =
  | { status: "CLAIMED"; context: WinnerTaglineGenerationContext }
  | { status: "CANCELED"; reason: string }
  | { status: "IGNORED"; reason: string };

export type PersistWinnerTaglineResult =
  | { status: "SUCCEEDED"; tagline: string }
  | { status: "FAILED" | "CANCELED" | "IGNORED"; reason: string };

export interface WinnerTaglineActionResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELED" | "SKIPPED";
  tagline: string | null;
}

export type EnqueueWinnerTaglineResult =
  | { status: "ENQUEUED" | "EXISTING"; jobId: Id<"generationJobs"> }
  | { status: "SKIPPED"; reason: string };

export const claimWinnerTaglineJobRef = makeFunctionReference<
  "mutation",
  WinnerTaglineWorkArgs,
  ClaimWinnerTaglineJobResult
>("winnerTaglineData:claimWinnerTaglineJob");

export const persistWinnerTaglineRef = makeFunctionReference<
  "mutation",
  WinnerTaglineWorkArgs & {
    text: string;
    usage: WinnerTaglineUsage;
  },
  PersistWinnerTaglineResult
>("winnerTaglineData:persistWinnerTagline");

export const winnerTaglineWorkCompleteRef = makeFunctionReference<
  "mutation",
  {
    workId: string;
    context: WinnerTaglineWorkContext;
    result:
      | { kind: "success"; returnValue: unknown }
      | { kind: "failed"; error: string }
      | { kind: "canceled" };
  },
  null
>("winnerTaglineData:winnerTaglineWorkComplete");

export const executeWinnerTaglineRef = makeFunctionReference<
  "action",
  WinnerTaglineWorkArgs,
  WinnerTaglineActionResult
>("winnerTaglineActions:executeWinnerTagline");

export const enqueueWinnerTaglineJobRef = makeFunctionReference<
  "mutation",
  {
    gameId: Id<"games">;
    gameStatus: WinnerTaglineStatus;
    phaseGeneration: number;
  },
  EnqueueWinnerTaglineResult
>("winnerTaglineData:enqueueWinnerTaglineJob");
