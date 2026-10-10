/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiGateway from "../aiGateway.js";
import type * as capabilities from "../capabilities.js";
import type * as cleanup from "../cleanup.js";
import type * as components_ from "../components.js";
import type * as crons from "../crons.js";
import type * as engine from "../engine.js";
import type * as freePlay from "../freePlay.js";
import type * as jobRunner from "../jobRunner.js";
import type * as jobs from "../jobs.js";
import type * as leaderboards from "../leaderboards.js";
import type * as matchslop_mode from "../matchslop/mode.js";
import type * as matchslop_play from "../matchslop/play.js";
import type * as matchslop_runners from "../matchslop/runners.js";
import type * as matchslop_tables from "../matchslop/tables.js";
import type * as matchslop_view from "../matchslop/view.js";
import type * as modes from "../modes.js";
import type * as narrator from "../narrator.js";
import type * as narratorData from "../narratorData.js";
import type * as presence from "../presence.js";
import type * as quizslop_mode from "../quizslop/mode.js";
import type * as quizslop_play from "../quizslop/play.js";
import type * as quizslop_tables from "../quizslop/tables.js";
import type * as quizslop_view from "../quizslop/view.js";
import type * as roomInput from "../roomInput.js";
import type * as rooms from "../rooms.js";
import type * as roster from "../roster.js";
import type * as rounds from "../rounds.js";
import type * as slopfight_data from "../slopfight/data.js";
import type * as slopfight_fightData from "../slopfight/fightData.js";
import type * as slopfight_fightSim from "../slopfight/fightSim.js";
import type * as slopfight_forge from "../slopfight/forge.js";
import type * as slopfight_forgeData from "../slopfight/forgeData.js";
import type * as slopfight_jobs from "../slopfight/jobs.js";
import type * as slopfight_mode from "../slopfight/mode.js";
import type * as slopfight_outcome from "../slopfight/outcome.js";
import type * as slopfight_play from "../slopfight/play.js";
import type * as slopfight_ports from "../slopfight/ports.js";
import type * as slopfight_runners from "../slopfight/runners.js";
import type * as slopfight_stage from "../slopfight/stage.js";
import type * as slopfight_tables from "../slopfight/tables.js";
import type * as slopfight_view from "../slopfight/view.js";
import type * as sloplash_mode from "../sloplash/mode.js";
import type * as sloplash_play from "../sloplash/play.js";
import type * as sloplash_runners from "../sloplash/runners.js";
import type * as sloplash_tables from "../sloplash/tables.js";
import type * as sloplash_view from "../sloplash/view.js";
import type * as validators from "../validators.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiGateway: typeof aiGateway;
  capabilities: typeof capabilities;
  cleanup: typeof cleanup;
  components: typeof components_;
  crons: typeof crons;
  engine: typeof engine;
  freePlay: typeof freePlay;
  jobRunner: typeof jobRunner;
  jobs: typeof jobs;
  leaderboards: typeof leaderboards;
  "matchslop/mode": typeof matchslop_mode;
  "matchslop/play": typeof matchslop_play;
  "matchslop/runners": typeof matchslop_runners;
  "matchslop/tables": typeof matchslop_tables;
  "matchslop/view": typeof matchslop_view;
  modes: typeof modes;
  narrator: typeof narrator;
  narratorData: typeof narratorData;
  presence: typeof presence;
  "quizslop/mode": typeof quizslop_mode;
  "quizslop/play": typeof quizslop_play;
  "quizslop/tables": typeof quizslop_tables;
  "quizslop/view": typeof quizslop_view;
  roomInput: typeof roomInput;
  rooms: typeof rooms;
  roster: typeof roster;
  rounds: typeof rounds;
  "slopfight/data": typeof slopfight_data;
  "slopfight/fightData": typeof slopfight_fightData;
  "slopfight/fightSim": typeof slopfight_fightSim;
  "slopfight/forge": typeof slopfight_forge;
  "slopfight/forgeData": typeof slopfight_forgeData;
  "slopfight/jobs": typeof slopfight_jobs;
  "slopfight/mode": typeof slopfight_mode;
  "slopfight/outcome": typeof slopfight_outcome;
  "slopfight/play": typeof slopfight_play;
  "slopfight/ports": typeof slopfight_ports;
  "slopfight/runners": typeof slopfight_runners;
  "slopfight/stage": typeof slopfight_stage;
  "slopfight/tables": typeof slopfight_tables;
  "slopfight/view": typeof slopfight_view;
  "sloplash/mode": typeof sloplash_mode;
  "sloplash/play": typeof sloplash_play;
  "sloplash/runners": typeof sloplash_runners;
  "sloplash/tables": typeof sloplash_tables;
  "sloplash/view": typeof sloplash_view;
  validators: typeof validators;
  views: typeof views;
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
  aiCriticalWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"aiCriticalWorkpool">;
};
