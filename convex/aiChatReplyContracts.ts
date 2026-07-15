import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

export type ChatReplyWorkArgs = {
  jobId: Id<"generationJobs">;
  gameId: Id<"games">;
  triggerMessageId: Id<"chatMessages">;
  phaseGeneration: number;
  attempt: number;
};

export type ChatReplyWorkContext = ChatReplyWorkArgs;

export interface ChatReplyMessageContext {
  authorName: string;
  content: string;
}

export interface ChatReplyScoreboardEntry {
  name: string;
  score: number;
  type: "HUMAN" | "AI";
}

export interface ChatReplyGenerationContext {
  modelId: string;
  responderId: Id<"players">;
  responderName: string;
  gameStatus: "WRITING" | "VOTING" | "ROUND_RESULTS";
  currentRound: number;
  totalRounds: number;
  scoreboard: ChatReplyScoreboardEntry[];
  messages: ChatReplyMessageContext[];
  triggerContent: string;
}

export interface ChatReplyUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type ClaimChatReplyJobResult =
  | { status: "CLAIMED"; context: ChatReplyGenerationContext }
  | { status: "CANCELED"; reason: string }
  | { status: "IGNORED"; reason: string };

export type PersistChatReplyResult =
  | { status: "SUCCEEDED"; messageId: Id<"chatMessages"> }
  | { status: "FAILED" | "CANCELED" | "IGNORED"; reason: string };

export interface ChatReplyActionResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELED" | "SKIPPED";
  messageId: Id<"chatMessages"> | null;
}

export const claimChatReplyJobRef = makeFunctionReference<
  "mutation",
  ChatReplyWorkArgs,
  ClaimChatReplyJobResult
>("aiChatReplyData:claimChatReplyJob");

export const persistChatReplyRef = makeFunctionReference<
  "mutation",
  ChatReplyWorkArgs & {
    responderId: Id<"players">;
    text: string;
    usage: ChatReplyUsage;
  },
  PersistChatReplyResult
>("aiChatReplyData:persistChatReply");

export const chatReplyWorkCompleteRef = makeFunctionReference<
  "mutation",
  {
    workId: string;
    context: ChatReplyWorkContext;
    result:
      | { kind: "success"; returnValue: unknown }
      | { kind: "failed"; error: string }
      | { kind: "canceled" };
  },
  null
>("aiChatReplyData:chatReplyWorkComplete");

export const executeChatReplyRef = makeFunctionReference<
  "action",
  ChatReplyWorkArgs,
  ChatReplyActionResult
>("aiChatReplyActions:executeChatReply");
