// The forge's model-facing schema: the contract's ForgeResultSchema with the
// text-length descriptions in words instead of characters (modelText and
// cleanText trim long text) and the sums marked as rescaled by code
// (balanceChampion). The sums stay in: a crisp target thinks shorter than
// "rate them against each other" in a same-time A/B. Same types, enums and
// property order, so a reply parses exactly as before; only the words the
// decoder shows the model change. Part of the cached prompt prefix: bump
// FORGE_PROMPT_VERSION when it changes.

import { z } from "zod";
import { MOVE_COUNT, POWER_SUM, STAT_SUM } from "../constants";
import { ForgeChampionSchema, ForgeResultSchema, MoveSchema } from "../sheet";

const LINE_WORDS = 8;

const lines = (count: number, what: string) =>
  z.array(z.string()).describe(`Exactly ${count} lines ${what}, each at most ${LINE_WORDS} words`);

const ModelMoveSchema = MoveSchema.extend({
  name: z.string().describe("Move name, one to four words"),
  power: MoveSchema.shape.power.describe(`1-5; the three powers sum to ${POWER_SUM}; code rescales`),
});

const ModelChampionSchema = ForgeChampionSchema.extend({
  stats: ForgeChampionSchema.shape.stats.describe(`Each 1-5, summing to ${STAT_SUM}; code rescales`),
  moves: z.array(ModelMoveSchema).describe(ForgeChampionSchema.shape.moves.description ?? `Exactly ${MOVE_COUNT} moves`),
  name: z.string().describe("One to three words"),
  bio: z.string().describe("One sentence of about 15 words"),
  narration: z.object({
    walkOn: lines(2, "for its walk-on"),
    landHit: lines(3, "for when it lands a hit"),
    takeHit: lines(2, "for when it takes a hit"),
    win: lines(2, "for when it wins"),
    lose: lines(2, "for when it loses"),
    ringOut: lines(2, "for when it is rung out"),
  }),
});

export const FORGE_SCHEMA = ForgeResultSchema.extend({
  champion: ModelChampionSchema.nullable().describe(
    ForgeResultSchema.shape.champion.description ?? "Null exactly when the verdict is REJECT",
  ),
});
