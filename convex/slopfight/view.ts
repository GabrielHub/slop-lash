import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Foundation stub: the Backend workstream fills in the per-viewer SlopFight view.

export async function slopfightView(
  _ctx: QueryCtx,
  _game: Doc<"games">,
  _viewerId: Id<"players"> | null,
) {
  return { kind: "SLOPFIGHT" as const };
}

export type SlopfightView = Awaited<ReturnType<typeof slopfightView>>;
