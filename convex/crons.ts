import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Catches what scheduled timers cannot: lost deadlines, players who walked
// away mid-phase, and hosts who need replacing.
crons.interval("maintain live rooms", { seconds: 15 }, internal.engine.sweep, {});
crons.interval("delete stale rooms", { minutes: 15 }, internal.cleanup.sweep, {});

export default crons;
