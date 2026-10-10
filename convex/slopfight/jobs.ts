import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { JobHandlers } from "../jobs";
import type { ArenaId } from "../../src/games/slopfight/arenas";
import {
  DESCRIBE_TEXT_MAX,
  MATCHUP_NOTES_MAX,
  NARRATION_LINE_MAX,
  NOTE_REASON_MAX,
} from "../../src/games/slopfight/constants";
import { MatchupNoteSchema, type MatchupNote } from "../../src/games/slopfight/modifiers";
import { cleanText, type Champion } from "../../src/games/slopfight/sheet";
import { getAiTask } from "../../src/lib/ai/tasks";
import { decodeXmlEntities } from "../../src/lib/ai/xml";
import {
  abandonMatchup,
  championOf,
  fallbackWalkOn,
  HOUSE_FALLBACK_DESCRIPTIONS,
  housePick,
  loadFighters,
  loadState,
  startForge,
  startSim,
  type Fight,
} from "./data";
import type { RecapEvent, RecapOutcome } from "./ports";

// SlopFight's background AI jobs (the forge is not a job: it streams, so it
// runs as its own action in forge.ts). Each has a database half here and a
// network half in runners.ts.

export const HOUSE_KIND = "SLOPFIGHT_HOUSE";
export const MATCHUP_KIND = "SLOPFIGHT_MATCHUP";
export const RECAP_KIND = "SLOPFIGHT_RECAP";

/** The recap line's length on the result card and the recap page. */
export const RECAP_LINE_MAX = 100;
/** Events the recap call reads: the ones that make a highlight. */
const RECAP_EVENT_KINDS = new Set([
  "hit",
  "ko",
  "ringout",
  "counter",
  "throw",
  "suddenDeath",
  "edge",
]);
const RECAP_EVENTS_MAX = 60;

export type SlopfightJobs = {
  SLOPFIGHT_HOUSE: {
    input: { arenas: ArenaId[]; count: number; seed: number };
    output: { descriptions: string[] };
  };
  SLOPFIGHT_MATCHUP: {
    input: { fightId: Id<"slopFightFights">; a: Champion; b: Champion; arena: ArenaId };
    /** Null when the call failed: the fight runs with no notes. */
    output: { notes: MatchupNote[]; walkOn: string[] } | null;
  };
  SLOPFIGHT_RECAP: {
    input: {
      fightId: Id<"slopFightFights">;
      a: Champion;
      b: Champion;
      outcome: RecapOutcome;
      events: RecapEvent[];
    };
    output: { line: string | null };
  };
};

type FightPayload = { fightId: Id<"slopFightFights">; attempt?: number };

async function payloadFight(ctx: QueryCtx | MutationCtx, job: Doc<"generationJobs">) {
  const payload = job.payload as FightPayload;
  const fight = await ctx.db.get("slopFightFights", payload.fightId);
  return fight ? { fight, attempt: payload.attempt } : null;
}

async function fightChampions(ctx: QueryCtx | MutationCtx, fight: Fight) {
  // A recap can run after an upgrade or be re-queued at FINAL. It describes
  // the champions that actually fought, never their newer sheets.
  if (fight.sheets) return { a: fight.sheets.A, b: fight.sheets.B };
  const [a, b] = await Promise.all([
    ctx.db.get("slopFightFighters", fight.a),
    ctx.db.get("slopFightFighters", fight.b),
  ]);
  const sheetA = a && championOf(a);
  const sheetB = b && championOf(b);
  return sheetA && sheetB ? { a: sheetA, b: sheetB } : null;
}

/** Model notes made safe to store: valid keys and finite values, short reasons, at most four. */
export function cleanNotes(notes: readonly unknown[]): MatchupNote[] {
  const clean: MatchupNote[] = [];
  for (const raw of notes) {
    const parsed = MatchupNoteSchema.safeParse(raw);
    if (!parsed.success || !Number.isFinite(parsed.data.value)) continue;
    const reason = cleanText(decodeXmlEntities(parsed.data.reason), NOTE_REASON_MAX);
    if (!reason) continue;
    clean.push({ ...parsed.data, reason });
    if (clean.length >= MATCHUP_NOTES_MAX) break;
  }
  return clean;
}

/** Starts the house champions' forges from the invented descriptions (or none: the model invents). */
async function forgeHouse(ctx: MutationCtx, game: Doc<"games">, descriptions: readonly string[]) {
  if (game.status !== "PLAYING" || game.round !== 1) return;
  const house = (await loadFighters(ctx, game._id)).filter(
    (fighter) => fighter.ownerId === null && fighter.status === "EMPTY",
  );
  const state = await loadState(ctx, game._id);
  for (const [index, fighter] of house.entries()) {
    const invented = cleanText(decodeXmlEntities(descriptions[index] ?? ""), DESCRIBE_TEXT_MAX);
    const text =
      invented || housePick(HOUSE_FALLBACK_DESCRIPTIONS, state?.seed ?? 0, fighter.slot, 1);
    await ctx.db.patch("slopFightFighters", fighter._id, { text });
    await startForge(ctx, { ...fighter, text }, "HOUSE", 0);
  }
}

/** The matchup is settled (notes or not), so the fight's sim can run. */
async function settleMatchup(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  output: SlopfightJobs["SLOPFIGHT_MATCHUP"]["output"],
) {
  const found = await payloadFight(ctx, job);
  if (!found) return;
  const { fight, attempt } = found;
  if (fight.matchup !== "PENDING" || fight.matchupAttempt !== attempt) return;
  const champions = await fightChampions(ctx, fight);
  const notes = output ? cleanNotes(output.notes) : [];
  if (!output || !champions) {
    await startSim(ctx, await abandonMatchup(ctx, fight));
    return;
  }
  const fallback = fallbackWalkOn(champions.a, champions.b);
  const walkOn = [0, 1].map(
    (index) =>
      cleanText(decodeXmlEntities(output.walkOn[index] ?? ""), NARRATION_LINE_MAX) ||
      fallback[index]!,
  );
  await ctx.db.patch("slopFightFights", fight._id, { matchup: "READY", notes, walkOn });
  await startSim(ctx, { ...fight, matchup: "READY", notes, walkOn });
}

export const slopfightJobHandlers: JobHandlers<SlopfightJobs> = {
  SLOPFIGHT_HOUSE: {
    // Round-bound: the house forges overlap BUILD and its FOUNDRY.
    phaseBound: false,
    pool: getAiTask("slopfight.house").pool,
    async prepare(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (!state || game.status !== "PLAYING" || game.round !== 1) return null;
      const count = (await loadFighters(ctx, game._id)).filter(
        (fighter) => fighter.ownerId === null && fighter.status === "EMPTY",
      ).length;
      if (count === 0) return null;
      return { arenas: state.arenas, count, seed: state.seed };
    },
    async apply(ctx, game, _job, output) {
      await forgeHouse(ctx, game, output.descriptions);
    },
    async fallback(ctx, game) {
      await forgeHouse(ctx, game, []);
    },
  },

  SLOPFIGHT_MATCHUP: {
    // Queued at ROSTER, read through the round's face-offs.
    phaseBound: false,
    pool: getAiTask("slopfight.matchup").pool,
    async prepare(ctx, game, job) {
      const found = await payloadFight(ctx, job);
      if (!found || game.status !== "PLAYING") return null;
      const { fight, attempt } = found;
      if (fight.matchup !== "PENDING" || fight.matchupAttempt !== attempt) return null;
      const champions = await fightChampions(ctx, fight);
      return champions ? { fightId: fight._id, arena: fight.arena, ...champions } : null;
    },
    async apply(ctx, _game, job, output) {
      await settleMatchup(ctx, job, output);
    },
    async fallback(ctx, _game, job) {
      await settleMatchup(ctx, job, null);
    },
  },

  SLOPFIGHT_RECAP: {
    // Background and never waited on; FINAL re-queues any that were canceled.
    phaseBound: false,
    pool: getAiTask("slopfight.recap").pool,
    async prepare(ctx, _game, job) {
      const found = await payloadFight(ctx, job);
      const fight = found?.fight;
      if (!fight?.outcome || fight.outcome.decidedBySeed || fight.recapLine) return null;
      const champions = await fightChampions(ctx, fight);
      if (!champions) return null;
      const { winner, method, endMs, health, maxHealth, events } = fight.outcome;
      return {
        fightId: fight._id,
        ...champions,
        outcome: { winner, method, endMs, health, maxHealth },
        events: (events as Array<{ t: number; kind: string; side?: unknown }>)
          .filter((event) => RECAP_EVENT_KINDS.has(event.kind))
          .slice(0, RECAP_EVENTS_MAX)
          .map(({ side, ...event }): RecapEvent =>
            side === "A" || side === "B" ? { ...event, side } : event,
          ),
      };
    },
    async apply(ctx, _game, job, output) {
      const found = await payloadFight(ctx, job);
      if (!found || found.fight.recapLine || !output.line) return;
      const line = cleanText(decodeXmlEntities(output.line), RECAP_LINE_MAX);
      if (line) await ctx.db.patch("slopFightFights", found.fight._id, { recapLine: line });
    },
  },
};
