import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

export type ResponseWorkArgs = {
  jobId: Id<"generationJobs">;
  gameId: Id<"games">;
  roundId: Id<"rounds">;
  roundNumber: number;
  phaseGeneration: number;
  attempt: number;
};

export type ResponseWorkContext = ResponseWorkArgs;

export interface ResponseHistoryEntry {
  round: number;
  prompt: string;
  yourJoke: string;
  won: boolean;
  winningJoke?: string;
}

export interface ResponsePromptContext {
  promptId: Id<"prompts">;
  text: string;
}

export type ResponseGenerationContext =
  | {
      kind: "ready";
      gameType: "SLOPLASH" | "AI_CHAT_SHOWDOWN";
      modelId: string;
      playerId: Id<"players">;
      prompts: ResponsePromptContext[];
      history: ResponseHistoryEntry[];
    }
  | {
      kind: "stale";
      reason: string;
    };

export interface ResponseUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type PersistResponseArgs = ResponseWorkArgs & {
  promptId: Id<"prompts">;
  text: string;
  failReason: string | null;
  usage: ResponseUsage;
};

export type PersistResponseResult =
  | { status: "INSERTED" }
  | { status: "DUPLICATE" }
  | { status: "STALE"; reason: string };

export type ClaimResponseJobResult =
  | { status: "CLAIMED" }
  | { status: "CANCELED"; reason: string }
  | { status: "IGNORED"; reason: string };

export type FinishResponseJobResult = {
  status: "SUCCEEDED" | "FAILED" | "CANCELED";
};

export interface ResponseActionResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELED" | "SKIPPED";
  persistedResponses: number;
  duplicateResponses: number;
}

export interface EnqueueResponseJobsResult {
  enqueued: number;
  skipped: number;
  failed: number;
  canceled: number;
}

export const claimResponseJobRef = makeFunctionReference<
  "mutation",
  ResponseWorkArgs,
  ClaimResponseJobResult
>("aiGenerationData:claimResponseJob");

export const loadResponseContextRef = makeFunctionReference<
  "query",
  ResponseWorkArgs,
  ResponseGenerationContext
>("aiGenerationData:loadResponseContext");

export const persistResponseRef = makeFunctionReference<
  "mutation",
  PersistResponseArgs,
  PersistResponseResult
>("aiGenerationData:persistResponse");

export const finishResponseJobRef = makeFunctionReference<
  "mutation",
  ResponseWorkArgs,
  FinishResponseJobResult
>("aiGenerationData:finishResponseJob");

export const cancelResponseJobRef = makeFunctionReference<
  "mutation",
  ResponseWorkArgs & { reason: string },
  { canceled: boolean }
>("aiGenerationData:cancelResponseJob");

export const responseWorkCompleteRef = makeFunctionReference<
  "mutation",
  {
    workId: string;
    context: ResponseWorkContext;
    result:
      | { kind: "success"; returnValue: unknown }
      | { kind: "failed"; error: string }
      | { kind: "canceled" };
  },
  null
>("aiGenerationData:responseWorkComplete");

export const generateResponseRef = makeFunctionReference<
  "action",
  ResponseWorkArgs,
  ResponseActionResult
>("aiGenerationActions:generateResponse");

export const enqueueQueuedResponseJobsRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; cursor?: string },
  EnqueueResponseJobsResult
>("aiGenerationData:enqueueQueuedResponseJobs");

export const settleSloplashQuorumRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("sloplash:settleQuorum");

export const settleChatslopQuorumRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("chatslop:settleQuorum");
