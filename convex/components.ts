import { Presence } from "@convex-dev/presence";
import { WorkflowManager } from "@convex-dev/workflow";
import { Workpool } from "@convex-dev/workpool";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";

export const roomPresence = new Presence<Id<"games">, Id<"playerSessions">>(components.presence);

export const aiGenerationWorkpool = new Workpool(components.aiGenerationWorkpool, {
  maxParallelism: 5,
  retryActionsByDefault: false,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 500,
    base: 2,
  },
});

export const gameWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 5,
    retryActionsByDefault: false,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 500,
      base: 2,
    },
  },
});
