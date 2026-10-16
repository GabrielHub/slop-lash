import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Heartbeats maintain occupied rooms; this infrequent safety net recovers
// missed phase deadlines even after every tab has closed.
crons.interval("recover missed room deadlines", { minutes: 5 }, internal.engine.sweep, {});
crons.interval("delete stale rooms", { minutes: 15 }, internal.cleanup.sweep, {});

export default crons;
