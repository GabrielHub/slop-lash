// Real I/O delay stands in for a cold transformed action module. It must not
// move with the fake scheduler clock used by the regression test.
import { setTimeout } from "node:timers/promises";

await setTimeout(25);
export const value = "loaded";
