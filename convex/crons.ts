import { cronJobs, makeFunctionReference } from "convex/server";

const cleanupExpiredSessionsReference = makeFunctionReference<
  "mutation",
  Record<string, never>,
  unknown
>("cleanup:cleanupExpiredSessions");

const cleanupStalePresenceSessionsReference = makeFunctionReference<
  "mutation",
  Record<string, never>,
  unknown
>("cleanup:cleanupStalePresenceSessions");

const scheduleStaleRoomCleanupReference = makeFunctionReference<
  "mutation",
  Record<string, never>,
  unknown
>("cleanup:scheduleStaleRoomCleanup");

const catchUpFinalGamesReference = makeFunctionReference<
  "mutation",
  Record<string, never>,
  unknown
>("leaderboards:catchUpFinalGames");

const crons = cronJobs();

crons.interval("project completed games", { minutes: 5 }, catchUpFinalGamesReference, {});
crons.interval(
  "schedule stale room cleanup",
  { minutes: 15 },
  scheduleStaleRoomCleanupReference,
  {},
);
crons.interval(
  "delete orphaned presence sessions",
  { minutes: 15 },
  cleanupStalePresenceSessionsReference,
  {},
);
crons.interval("delete expired room sessions", { hours: 1 }, cleanupExpiredSessionsReference, {});

export default crons;
