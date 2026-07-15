import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

export type VoteWorkArgs = {
  jobId: Id<"generationJobs">;
  gameId: Id<"games">;
  roundId: Id<"rounds">;
  promptId: Id<"prompts">;
  roundNumber: number;
  phaseGeneration: number;
  attempt: number;
};

export type VoteWorkContext = VoteWorkArgs;

export type ReactionEmoji =
  | "laugh"
  | "fire"
  | "skull"
  | "clap"
  | "puke"
  | "sleep"
  | "eyes"
  | "hundred"
  | "target"
  | "clown";

export interface RedactedVoteCandidate {
  responseId: Id<"responses">;
  text: string;
}

export type VoteGenerationContext =
  | {
      kind: "ready";
      gameType: "SLOPLASH" | "AI_CHAT_SHOWDOWN";
      modelId: string;
      playerId: Id<"players">;
      promptText: string;
      candidates: RedactedVoteCandidate[];
      alreadyVoted: boolean;
    }
  | {
      kind: "stale";
      reason: string;
    };

export interface VoteUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface VoteReaction {
  responseId: Id<"responses">;
  emoji: ReactionEmoji;
}

export type PersistVoteArgs = VoteWorkArgs & {
  responseId: Id<"responses"> | null;
  failReason: string | null;
  reactions: VoteReaction[];
  usage: VoteUsage;
};

export type PersistVoteResult =
  | { status: "INSERTED" }
  | { status: "DUPLICATE" }
  | { status: "STALE"; reason: string };

export type ClaimVoteJobResult =
  | { status: "CLAIMED" }
  | { status: "CANCELED"; reason: string }
  | { status: "IGNORED"; reason: string };

export type FinishVoteJobResult = {
  status: "SUCCEEDED" | "FAILED" | "CANCELED";
};

export interface VoteActionResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELED" | "SKIPPED";
  persistedVote: boolean;
  duplicateVote: boolean;
}

export interface EnqueueVoteJobsResult {
  enqueued: number;
  skipped: number;
  failed: number;
  canceled: number;
}

export const claimVoteJobRef = makeFunctionReference<"mutation", VoteWorkArgs, ClaimVoteJobResult>(
  "aiVotingData:claimVoteJob",
);

export const loadVoteContextRef = makeFunctionReference<
  "query",
  VoteWorkArgs,
  VoteGenerationContext
>("aiVotingData:loadVoteContext");

export const persistVoteRef = makeFunctionReference<"mutation", PersistVoteArgs, PersistVoteResult>(
  "aiVotingData:persistVote",
);

export const finishVoteJobRef = makeFunctionReference<
  "mutation",
  VoteWorkArgs,
  FinishVoteJobResult
>("aiVotingData:finishVoteJob");

export const cancelVoteJobRef = makeFunctionReference<
  "mutation",
  VoteWorkArgs & { reason: string },
  { canceled: boolean }
>("aiVotingData:cancelVoteJob");

export const voteWorkCompleteRef = makeFunctionReference<
  "mutation",
  {
    workId: string;
    context: VoteWorkContext;
    result:
      | { kind: "success"; returnValue: unknown }
      | { kind: "failed"; error: string }
      | { kind: "canceled" };
  },
  null
>("aiVotingData:voteWorkComplete");

export const generateVoteRef = makeFunctionReference<"action", VoteWorkArgs, VoteActionResult>(
  "aiVotingActions:generateVote",
);

export const enqueueQueuedVoteJobsRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; cursor?: string },
  EnqueueVoteJobsResult
>("aiVotingData:enqueueQueuedVoteJobs");

export const settleSloplashVoteQuorumRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("sloplash:settleQuorum");

export const settleChatslopVoteQuorumRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("chatslop:settleQuorum");
