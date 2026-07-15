/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiChatReplyActions from "../aiChatReplyActions.js";
import type * as aiChatReplyContracts from "../aiChatReplyContracts.js";
import type * as aiChatReplyData from "../aiChatReplyData.js";
import type * as aiGateway from "../aiGateway.js";
import type * as aiGenerationActions from "../aiGenerationActions.js";
import type * as aiGenerationContracts from "../aiGenerationContracts.js";
import type * as aiGenerationData from "../aiGenerationData.js";
import type * as aiVotingActions from "../aiVotingActions.js";
import type * as aiVotingContracts from "../aiVotingContracts.js";
import type * as aiVotingData from "../aiVotingData.js";
import type * as capabilities from "../capabilities.js";
import type * as chat from "../chat.js";
import type * as chatslop from "../chatslop.js";
import type * as cleanup from "../cleanup.js";
import type * as components_ from "../components.js";
import type * as crons from "../crons.js";
import type * as gameViewData from "../gameViewData.js";
import type * as gameViewValidators from "../gameViewValidators.js";
import type * as gameViews from "../gameViews.js";
import type * as leaderboards from "../leaderboards.js";
import type * as lobby from "../lobby.js";
import type * as matchslop from "../matchslop.js";
import type * as matchslopAi from "../matchslopAi.js";
import type * as matchslopContracts from "../matchslopContracts.js";
import type * as matchslopData from "../matchslopData.js";
import type * as matchslopEngine from "../matchslopEngine.js";
import type * as matchslopJobs from "../matchslopJobs.js";
import type * as matchslopRoundEngine from "../matchslopRoundEngine.js";
import type * as matchslopState from "../matchslopState.js";
import type * as matchslopValidators from "../matchslopValidators.js";
import type * as matchslopWorkflow from "../matchslopWorkflow.js";
import type * as modelCatalog from "../modelCatalog.js";
import type * as narrator from "../narrator.js";
import type * as narratorData from "../narratorData.js";
import type * as presence from "../presence.js";
import type * as reactions from "../reactions.js";
import type * as recaps from "../recaps.js";
import type * as roomInput from "../roomInput.js";
import type * as rooms from "../rooms.js";
import type * as roomsInternal from "../roomsInternal.js";
import type * as sloplash from "../sloplash.js";
import type * as sloplashEngine from "../sloplashEngine.js";
import type * as validators from "../validators.js";
import type * as winnerTaglineActions from "../winnerTaglineActions.js";
import type * as winnerTaglineContracts from "../winnerTaglineContracts.js";
import type * as winnerTaglineData from "../winnerTaglineData.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiChatReplyActions: typeof aiChatReplyActions;
  aiChatReplyContracts: typeof aiChatReplyContracts;
  aiChatReplyData: typeof aiChatReplyData;
  aiGateway: typeof aiGateway;
  aiGenerationActions: typeof aiGenerationActions;
  aiGenerationContracts: typeof aiGenerationContracts;
  aiGenerationData: typeof aiGenerationData;
  aiVotingActions: typeof aiVotingActions;
  aiVotingContracts: typeof aiVotingContracts;
  aiVotingData: typeof aiVotingData;
  capabilities: typeof capabilities;
  chat: typeof chat;
  chatslop: typeof chatslop;
  cleanup: typeof cleanup;
  components: typeof components_;
  crons: typeof crons;
  gameViewData: typeof gameViewData;
  gameViewValidators: typeof gameViewValidators;
  gameViews: typeof gameViews;
  leaderboards: typeof leaderboards;
  lobby: typeof lobby;
  matchslop: typeof matchslop;
  matchslopAi: typeof matchslopAi;
  matchslopContracts: typeof matchslopContracts;
  matchslopData: typeof matchslopData;
  matchslopEngine: typeof matchslopEngine;
  matchslopJobs: typeof matchslopJobs;
  matchslopRoundEngine: typeof matchslopRoundEngine;
  matchslopState: typeof matchslopState;
  matchslopValidators: typeof matchslopValidators;
  matchslopWorkflow: typeof matchslopWorkflow;
  modelCatalog: typeof modelCatalog;
  narrator: typeof narrator;
  narratorData: typeof narratorData;
  presence: typeof presence;
  reactions: typeof reactions;
  recaps: typeof recaps;
  roomInput: typeof roomInput;
  rooms: typeof rooms;
  roomsInternal: typeof roomsInternal;
  sloplash: typeof sloplash;
  sloplashEngine: typeof sloplashEngine;
  validators: typeof validators;
  winnerTaglineActions: typeof winnerTaglineActions;
  winnerTaglineContracts: typeof winnerTaglineContracts;
  winnerTaglineData: typeof winnerTaglineData;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  aiGenerationWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"aiGenerationWorkpool">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
