import { makeFunctionReference } from "convex/server";
import type { Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  matchSlopImageContextValidator,
  matchSlopImageReadyContextValidator,
  matchSlopPersistResultValidator,
  matchSlopPostMortemContextValidator,
  matchSlopPostMortemReadyContextValidator,
  matchSlopPostMortemValidator,
  matchSlopProfileContextValidator,
  matchSlopProfileReadyContextValidator,
  matchSlopProfileValidator,
  matchSlopReplyContextValidator,
  matchSlopReplyReadyContextValidator,
  matchSlopResponseContextValidator,
  matchSlopResponseReadyContextValidator,
  matchSlopUsageValidator,
  matchSlopVoteContextValidator,
  matchSlopVoteReadyContextValidator,
} from "./matchslopValidators";
import { makeInternalWorkflowReference } from "./workflowReference";

export type MatchSlopJobStage = "IMAGE" | "POST_MORTEM" | "PROFILE" | "REPLY" | "RESPONSE" | "VOTE";

export type Usage = Infer<typeof matchSlopUsageValidator>;

export type WorkflowJobArgs = {
  gameId: Id<"games">;
  jobId: Id<"generationJobs">;
};

export type ProfileContext = Infer<typeof matchSlopProfileContextValidator>;
export type ImageContext = Infer<typeof matchSlopImageContextValidator>;
export type ResponseContext = Infer<typeof matchSlopResponseContextValidator>;
export type VoteContext = Infer<typeof matchSlopVoteContextValidator>;
export type ReplyContext = Infer<typeof matchSlopReplyContextValidator>;
export type PostMortemContext = Infer<typeof matchSlopPostMortemContextValidator>;

export type PersistResult = Infer<typeof matchSlopPersistResultValidator>;
export type GeneratedProfile = {
  profile: Infer<typeof matchSlopProfileValidator>;
  usage: Usage;
};
export type GeneratedImage = { imageUrl: string; usage: Usage };
export type GeneratedResponse = {
  text: string;
  selectedPromptId: string | null;
  failReason: string | null;
  usage: Usage;
};
export type GeneratedVote = {
  responseId: string | null;
  failReason: string | null;
  usage: Usage;
};
export type GeneratedReply = {
  reply: string;
  outcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED";
  moodDelta: number;
  signalCategory: string | null;
  sideComment: string | null;
  nextSignal: string | null;
  usage: Usage;
};
export type GeneratedPostMortem = {
  postMortem: Infer<typeof matchSlopPostMortemValidator>;
  usage: Usage;
};

export const profilePipelineRef = makeInternalWorkflowReference<WorkflowJobArgs>(
  "matchslopWorkflow:profilePipeline",
);
export const imagePipelineRef = makeInternalWorkflowReference<WorkflowJobArgs>(
  "matchslopWorkflow:imagePipeline",
);
export const responsePipelineRef = makeInternalWorkflowReference<WorkflowJobArgs>(
  "matchslopWorkflow:responsePipeline",
);
export const votePipelineRef = makeInternalWorkflowReference<WorkflowJobArgs>(
  "matchslopWorkflow:votePipeline",
);
export const replyPipelineRef = makeInternalWorkflowReference<WorkflowJobArgs>(
  "matchslopWorkflow:replyPipeline",
);
export const postMortemPipelineRef = makeInternalWorkflowReference<WorkflowJobArgs>(
  "matchslopWorkflow:postMortemPipeline",
);

export const completeWorkflowRef = makeFunctionReference<
  "mutation",
  {
    workflowId: string;
    result:
      | { kind: "success"; returnValue: unknown }
      | { kind: "failed"; error: string }
      | { kind: "canceled" };
    context: { gameId: Id<"games">; jobId: Id<"generationJobs">; stage: MatchSlopJobStage };
  },
  null
>("matchslopEngine:completeWorkflow");

export const claimProfileRef = makeFunctionReference<"mutation", WorkflowJobArgs, ProfileContext>(
  "matchslopEngine:claimProfile",
);
export const persistProfileRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs & { profile: Infer<typeof matchSlopProfileValidator>; usage: Usage },
  PersistResult
>("matchslopEngine:persistProfile");
export const claimImageRef = makeFunctionReference<"mutation", WorkflowJobArgs, ImageContext>(
  "matchslopEngine:claimImage",
);
export const persistImageRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs & { imageUrl: string; usage: Usage },
  PersistResult
>("matchslopEngine:persistImage");
export const claimResponseRef = makeFunctionReference<"mutation", WorkflowJobArgs, ResponseContext>(
  "matchslopEngine:claimResponse",
);
export const persistResponseRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs & {
    text: string;
    selectedPromptId: string | null;
    failReason: string | null;
    usage: Usage;
  },
  PersistResult
>("matchslopEngine:persistResponse");
export const claimVoteRef = makeFunctionReference<"mutation", WorkflowJobArgs, VoteContext>(
  "matchslopEngine:claimVote",
);
export const persistVoteRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs & { responseId: string | null; failReason: string | null; usage: Usage },
  PersistResult
>("matchslopEngine:persistVote");
export const claimReplyRef = makeFunctionReference<"mutation", WorkflowJobArgs, ReplyContext>(
  "matchslopEngine:claimReply",
);
export const persistReplyRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs & {
    reply: string;
    outcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED";
    moodDelta: number;
    signalCategory: string | null;
    sideComment: string | null;
    nextSignal: string | null;
    usage: Usage;
  },
  PersistResult
>("matchslopEngine:persistReply");
export const claimPostMortemRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs,
  PostMortemContext
>("matchslopEngine:claimPostMortem");
export const persistPostMortemRef = makeFunctionReference<
  "mutation",
  WorkflowJobArgs & { postMortem: Infer<typeof matchSlopPostMortemValidator>; usage: Usage },
  PersistResult
>("matchslopEngine:persistPostMortem");

export const generateProfileRef = makeFunctionReference<
  "action",
  { context: Infer<typeof matchSlopProfileReadyContextValidator> },
  GeneratedProfile
>("matchslopAi:generateProfile");
export const generateImageRef = makeFunctionReference<
  "action",
  { context: Infer<typeof matchSlopImageReadyContextValidator> },
  GeneratedImage
>("matchslopAi:generateImage");
export const generateResponseRef = makeFunctionReference<
  "action",
  { context: Infer<typeof matchSlopResponseReadyContextValidator> },
  GeneratedResponse
>("matchslopAi:generateResponse");
export const generateVoteRef = makeFunctionReference<
  "action",
  { context: Infer<typeof matchSlopVoteReadyContextValidator> },
  GeneratedVote
>("matchslopAi:generateVote");
export const generateReplyRef = makeFunctionReference<
  "action",
  { context: Infer<typeof matchSlopReplyReadyContextValidator> },
  GeneratedReply
>("matchslopAi:generateReply");
export const generatePostMortemRef = makeFunctionReference<
  "action",
  { context: Infer<typeof matchSlopPostMortemReadyContextValidator> },
  GeneratedPostMortem
>("matchslopAi:generatePostMortem");

export const startProfilePipelineRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { started: boolean; workflowId: string | null }
>("matchslopWorkflow:startProfilePipeline");

export const enforceDeadlineRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; deadline: number; phaseGeneration: number },
  { advanced: boolean; phase: "FINAL_RESULTS" | "ROUND_RESULTS" | "VOTING" | "WRITING" | null }
>("matchslop:enforceDeadline");
