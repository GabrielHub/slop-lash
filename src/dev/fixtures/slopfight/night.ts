import type { ModeView, RoomPlayer, RoomView } from "@/room/context";
import type { ArenaId } from "@/games/slopfight/arenas";
import { FIGHT_LEAD_MS, RESULT_SECONDS } from "@/games/slopfight/constants";
import { resolveModifiers, type MatchupNote } from "@/games/slopfight/modifiers";
import { sampleById } from "@/games/slopfight/samples";
import {
  scoreFight,
  totalsByPlayer,
  type FightMethod,
} from "@/games/slopfight/scoring";
import type { Champion } from "@/games/slopfight/sheet";
import type { Stroke } from "@/games/slopfight/strokes";
import {
  addResult,
  EMPTY_RECORD,
  fightLimitMs,
  fightSeed,
  podium,
  seedOrder,
  type FightRecord,
} from "@/games/slopfight/tournament";
import { FIXTURE_NOW, fixtureId, fixturePlayer, fixtureView } from "../base";
import { synthOutcome, type Bout } from "./outcomes";

// SlopFight fixtures: one per phase and state, seen by Jo (the host) unless a
// fixture says otherwise. The main story is a two-human night (Jo and Priya,
// plus two house champions) played out bout by bout, so records, standings,
// seeding and scores all come from the real tournament and scoring modules.
// A four-human room covers the lobby, a mixed Build and an absent player.
//
// Fight outcomes are synthetic (hash "fixture"): a scripted hit list turned
// into an event log and a health timeline in the stored shape. The sim is
// still being tuned, so a stage re-simulating these inputs gets its own fight;
// the phones and the result cards read these numbers.
//
// `doodles` carries the drawings in every playing fixture (the live server
// sends null until the game ends; stages read strokes from `stage.strokes`).
// The phone uses `doodles` when present instead of fetching its strokes, so
// fixtures never reach the backend.

type Mode = ModeView<"SLOPFIGHT">;
type FighterView = Mode["fighters"][number];
type FightView = Mode["fights"][number];
type Doodle = NonNullable<Mode["doodles"]>[number];
type Room = Partial<RoomView["room"]>;

// --- Players ---

export const jo = fixturePlayer("sf-jo", "Jo");
export const priya = fixturePlayer("sf-priya", "Priya");
const sam = fixturePlayer("sf-sam", "Sam");
const max = fixturePlayer("sf-max", "Maximilian");

export const DUO = [jo, priya];
export const FOUR = [jo, priya, sam, max];

export const ROOM = {
  gameType: "SLOPFIGHT",
  minPlayers: 2,
  maxPlayers: 4,
  totalRounds: 3,
} as const;
const ARENAS: ArenaId[] = ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"];
const GAME_SEED = 0x51a7f19;

const champion = (id: string): Champion => {
  const sample = sampleById(id);
  if (!sample) throw new Error(`No SlopFight sample ${id}`);
  return sample.champion;
};

export const LARRY = champion("raccoon-lawyer");
export const LARRY_UNBOUND = champion("raccoon-jetpack");
export const JELLY = champion("confident-jellyfish");
const TOASTER = champion("toaster-legs");
const SHARK = champion("land-shark");
const SPUD = champion("potato-googly");
const DRAGON = champion("dragon");

const fighterId = (game: string, slot: number) => fixtureId("slopFightFighters", `${game}-${slot}`);
const fightId = (game: string, round: number, step: number) =>
  fixtureId("slopFightFights", `${game}-${round}-${step}`);

// --- Doodles (0..1000 grid) ---

function ring(cx: number, cy: number, rx: number, ry: number, c: Stroke["c"], points = 28): Stroke {
  const p: number[] = [];
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    p.push(Math.round(cx + Math.cos(angle) * rx), Math.round(cy + Math.sin(angle) * ry));
  }
  return { c, w: 1, p };
}

const line = (c: Stroke["c"], ...p: number[]): Stroke => ({ c, w: 1, p });
const dot = (c: Stroke["c"], x: number, y: number): Stroke => ({ c, w: 1, p: [x, y] });

/** Larry as Jo drew him: a raccoon in a tie with a briefcase. */
export const LARRY_STROKES: Stroke[] = [
  ring(500, 610, 170, 200, 0),
  ring(500, 330, 140, 120, 0),
  line(0, 390, 240, 360, 140, 450, 220),
  line(0, 550, 220, 640, 140, 610, 240),
  line(0, 400, 310, 600, 310, 590, 360, 410, 360, 400, 310),
  dot(0, 455, 335),
  dot(0, 545, 335),
  line(1, 500, 450, 470, 520, 500, 640, 530, 520, 500, 450),
  line(0, 400, 790, 380, 900),
  line(0, 600, 790, 620, 900),
  line(0, 340, 560, 230, 650),
  line(0, 660, 560, 760, 660),
  line(2, 720, 660, 860, 660, 860, 780, 720, 780, 720, 660),
  line(0, 670, 700, 820, 610, 900, 640),
  line(0, 820, 620, 860, 600),
];

/** Round 2's addition on its own layer: a jetpack and flames. */
export const JETPACK_STROKES: Stroke[] = [
  line(4, 250, 480, 330, 480, 330, 700, 250, 700, 250, 480),
  line(1, 260, 710, 240, 800, 290, 760, 310, 830, 320, 710),
  line(2, 275, 720, 280, 780, 300, 730),
];

/** Sam's half-finished potato for the mixed Build. */
const SPUD_STROKES: Stroke[] = [
  ring(500, 520, 260, 200, 2, 32),
  ring(430, 480, 40, 40, 0, 12),
  ring(580, 470, 50, 50, 0, 12),
  dot(0, 440, 490),
  dot(0, 575, 480),
];

/** The blank-ish canvas the Foundry turned down. */
export const SMUDGE_STROKES: Stroke[] = [dot(0, 512, 498)];

export function doodle(game: string, slot: number, layer: number, strokes: Stroke[]): Doodle[] {
  const rows: Doodle[] = [];
  for (let start = 0; start < strokes.length; start += 4) {
    rows.push({
      fighterId: fighterId(game, slot),
      layer,
      seq: rows.length,
      strokes: strokes.slice(start, start + 4),
    });
  }
  return rows;
}

// --- Fighters ---

function fighter(
  game: string,
  slot: number,
  owner: RoomPlayer | null,
  overrides: Partial<FighterView> = {},
): FighterView {
  return {
    id: fighterId(game, slot),
    slot,
    ownerId: owner?.id ?? null,
    status: "EMPTY",
    inputKind: null,
    champion: null,
    previous: null,
    text: null,
    forge: null,
    failure: null,
    forgeParts: null,
    rejection: null,
    addition: null,
    version: 0,
    record: EMPTY_RECORD,
    ...overrides,
  };
}

export const ready = (
  sheet: Champion,
  overrides: Partial<FighterView> = {},
): Partial<FighterView> => ({
  status: "READY",
  champion: sheet,
  ...overrides,
});

/**
 * A forge in flight. `parts` is the owner's progress (`forgeParts`), which the
 * view sends only to the owner: pass it only for the viewer's own fighter.
 */
export const forging = (
  kind: NonNullable<FighterView["forge"]>["kind"],
  version: number,
  ago: number,
  parts: FighterView["forgeParts"] = null,
): Partial<FighterView> => ({
  status: "FORGING",
  forge: { kind, version, startedAt: FIXTURE_NOW - ago },
  forgeParts: parts,
});

export function mode(overrides: Partial<Mode> = {}): Mode {
  return {
    kind: "SLOPFIGHT",
    arenas: ARENAS,
    round: 1,
    totalFights: 6,
    myFighterId: null,
    fighters: [],
    fights: [],
    currentFightId: null,
    standings: [],
    seeding: null,
    podium: null,
    foundryParked: false,
    doodles: [],
    ...overrides,
  };
}

export function playing(phase: string, round: number, overrides: Room = {}): Room {
  return {
    status: "PLAYING",
    phase,
    round,
    step: 0,
    phaseStartedAt: FIXTURE_NOW - 10_000,
    phaseDeadline: FIXTURE_NOW + 20_000,
    ...overrides,
  };
}

// --- A game: fighters per round, bouts in play order, played up to a cursor ---

interface Game {
  key: string;
  players: RoomPlayer[];
  /** Owner per slot (null for the house). */
  owners: (RoomPlayer | null)[];
  /** Each slot's champion in rounds 1, 2 and 3. */
  sheets: Champion[][];
  bouts: Bout[];
}

type Cursor =
  | { phase: "ROSTER" | "STANDINGS" | "UPGRADE" | "FOUNDRY"; round: number }
  | { phase: "FACE_OFF" | "FIGHT" | "RESULT"; round: number; step: number }
  | { phase: "FINISHED" };

const order = (bout: Pick<Bout, "round" | "step">) => bout.round * 10 + bout.step;

function cursorOrder(cursor: Cursor): number {
  if (cursor.phase === "FINISHED") return 99;
  if (cursor.phase === "FACE_OFF" || cursor.phase === "FIGHT" || cursor.phase === "RESULT") {
    return cursor.round * 10 + cursor.step;
  }
  // Standings close a round; the upgrade, foundry and roster open the next one.
  return cursor.phase === "STANDINGS" ? cursor.round * 10 + 5 : cursor.round * 10 - 1;
}

/** Whether a bout's fight row exists yet (rounds 2 and 3 appear at the standings before them). */
function created(bout: Bout, cursor: Cursor): boolean {
  if (bout.round === 1) return true;
  return cursorOrder(cursor) >= (bout.round - 1) * 10 + 5;
}

function scoredBefore(bout: Bout, cursor: Cursor): boolean {
  const at = cursorOrder(cursor);
  if (cursor.phase === "RESULT" || cursor.phase === "FINISHED") return order(bout) <= at;
  return order(bout) < at;
}

interface Played {
  mode: Mode;
  players: RoomPlayer[];
  /** Every fight scored so far, for the fixture test. */
  scored: { fight: FightView; bout: Bout }[];
}

function sheetFor(game: Game, slot: number, round: number): Champion {
  return game.sheets[slot]![Math.min(round, 3) - 1]!;
}

/**
 * The night up to `cursor`: fights created, revealed and scored as the
 * server would, records and standings from the tournament module, scores
 * from the scoring module.
 */
function play(game: Game, cursor: Cursor, viewer: RoomPlayer | null = game.players[0]!): Played {
  const round = cursor.phase === "FINISHED" ? 3 : cursor.round;
  const records: FightRecord[] = game.owners.map(() => EMPTY_RECORD);
  const scored: Played["scored"] = [];
  const awards = [];
  const fights: FightView[] = [];
  let currentFightId: FightView["id"] | null = null;

  for (const bout of [...game.bouts].sort((left, right) => order(left) - order(right))) {
    if (!created(bout, cursor)) continue;
    const sheets = { A: sheetFor(game, bout.a, bout.round), B: sheetFor(game, bout.b, bout.round) };
    const owners = { A: game.owners[bout.a] ?? null, B: game.owners[bout.b] ?? null };
    const limitMs = fightLimitMs(owners.A === null, owners.B === null);
    const isFinal = bout.round === 3 && bout.step === 1;
    const isThirdPlace = bout.round === 3 && bout.step === 0;
    const current =
      cursor.phase !== "FINISHED" &&
      "step" in cursor &&
      cursor.round === bout.round &&
      cursor.step === bout.step;
    const done = scoredBefore(bout, cursor);
    const revealed = done || (current && cursor.phase === "FIGHT");
    const outcome = synthOutcome(bout, sheets, limitMs);
    const bets = bout.bets.map(([player, side]) => ({ playerId: player.id, side }));
    const fightAwards = scoreFight({
      isFinal,
      winner: outcome.winner,
      method: outcome.method,
      owners: { A: owners.A?.id ?? null, B: owners.B?.id ?? null },
      bets,
    });
    // Bets are shown from the face-off on; a fight still to come has none.
    const betsShown = done || current;
    const view: FightView = {
      id: fightId(game.key, bout.round, bout.step),
      round: bout.round,
      step: bout.step,
      a: fighterId(game.key, bout.a),
      b: fighterId(game.key, bout.b),
      arena: ARENAS[bout.round - 1]!,
      limitMs,
      isFinal,
      isThirdPlace,
      matchup: "READY",
      notes: bout.notes,
      applied: resolveModifiers(sheets.A, sheets.B, ARENAS[bout.round - 1]!, bout.notes).notes.map(
        (applied) => ({
          side: applied.note.side,
          modifies: applied.note.modifies,
          reason: applied.note.reason,
          value: applied.value,
          favors: applied.favors,
          capped: applied.capped,
          dropped: applied.dropped,
        }),
      ),
      walkOn: bout.walkOn,
      hype: revealed ? bout.hype : { A: 0, B: 0 },
      bets: {
        A: betsShown ? bets.filter((bet) => bet.side === "A").map((bet) => bet.playerId) : [],
        B: betsShown ? bets.filter((bet) => bet.side === "B").map((bet) => bet.playerId) : [],
      },
      mine: betsShown ? (bets.find((bet) => bet.playerId === viewer?.id)?.side ?? null) : null,
      revealed,
      seed: revealed ? (bout.seed ?? fightSeed(GAME_SEED, bout.round, bout.step)) : null,
      startsAt: revealed ? FIXTURE_NOW - 10_000 + FIGHT_LEAD_MS : null,
      outcome: revealed ? outcome : null,
      decidedBySeed: false,
      awards: revealed ? fightAwards : null,
      sheets: cursor.phase === "FINISHED" ? sheets : null,
      recapLine: done ? bout.recapLine : null,
    };
    fights.push(view);
    if (current) currentFightId = view.id;
    if (done) {
      records[bout.a] = addResult(records[bout.a]!, outcome.winner === "A", outcome.health.A);
      records[bout.b] = addResult(records[bout.b]!, outcome.winner === "B", outcome.health.B);
      awards.push(...fightAwards);
      scored.push({ fight: view, bout });
    }
  }

  const totals = totalsByPlayer(awards);
  const players = game.players.map((player) => ({ ...player, score: totals.get(player.id) ?? 0 }));
  const fighters = game.owners.map((owner, slot) =>
    fighter(game.key, slot, owner, {
      ...ready(sheetFor(game, slot, round)),
      version: round > 1 ? round : 0,
      record: records[slot]!,
      inputKind: INPUT_KINDS[slot] ?? null,
      text: DESCRIPTIONS[slot] ?? null,
    }),
  );
  const entries = fighters.map((entry) => ({
    id: entry.id,
    slot: entry.slot,
    record: entry.record,
  }));
  const standings = seedOrder(entries, GAME_SEED).map((entry, index) => ({
    fighterId: entry.id,
    rank: index + 1,
    record: entry.record,
  }));
  const qualifiersDone = cursorOrder(cursor) >= 25;
  const third = fights.find((fight) => fight.isThirdPlace);
  const final = fights.find((fight) => fight.isFinal);
  const placed =
    third?.outcome && final?.outcome && scored.some(({ fight }) => fight.isFinal)
      ? podium(
          { a: third.a, b: third.b, winner: third.outcome.winner },
          { a: final.a, b: final.b, winner: final.outcome.winner },
        )
      : null;
  return {
    players,
    scored,
    mode: mode({
      round,
      myFighterId: fighters.find((entry) => viewer && entry.ownerId === viewer.id)?.id ?? null,
      fighters,
      fights,
      currentFightId,
      standings,
      seeding: qualifiersDone ? standings.map((entry) => entry.fighterId) : null,
      podium: placed,
    }),
  };
}

/** How each slot of the night made its champion: Jo drew, Priya described, the house invented. */
const INPUT_KINDS: FighterView["inputKind"][] = ["DRAW", "DESCRIBE", null, null];
const DESCRIPTIONS: (string | null)[] = [
  null,
  "a very confident jellyfish",
  "a retro toaster that learned to walk and chose violence",
  "a shark with human legs and box-fresh sneakers",
];

// --- The two-human night: Jo and Priya against the house ---

const NIGHT: Game = {
  key: "night",
  players: DUO,
  owners: [jo, priya, null, null],
  sheets: [
    [LARRY, LARRY_UNBOUND, LARRY_UNBOUND],
    [JELLY, JELLY, JELLY],
    [TOASTER, TOASTER, TOASTER],
    [SHARK, SHARK, SHARK],
  ],
  bouts: [
    {
      round: 1,
      step: 0,
      seed: 2,
      a: 0,
      b: 2,
      hits: [
        [2_400, "A", 14, 0],
        [4_100, "B", 18, 0, true],
        [6_300, "A", 22, 1],
        [8_900, "A", 16, 0],
        [11_200, "B", 12, 2],
        [13_800, "B", 10, 1],
        [16_400, "A", 34, 0, true],
        [19_100, "A", 34, 0, true],
      ],
      finish: { method: "KO" },
      bets: [
        [jo, "A"],
        [priya, "B"],
      ],
      hype: { A: 46, B: 31 },
      notes: [
        {
          side: "B",
          modifies: "selfDamageOnHitTaken",
          value: 10,
          reason: "Electric toaster, flooded floor. Sparks.",
        },
        {
          side: "A",
          modifies: "strikePower",
          value: 1,
          reason: "Briefcase full of subpoenas: heavy",
        },
      ],
      walkOn: ["Larry is here, and he has paperwork.", "Sir Toastington is warmed up."],
      recapLine: "Larry served the toaster papers, then a briefcase to the face.",
    },
    {
      round: 1,
      step: 1,
      seed: 32,
      a: 1,
      b: 3,
      hits: [
        [1_900, "B", 16, 1],
        [3_600, "A", 12, 0],
        [5_800, "A", 14, 1],
        [8_200, "B", 22, 0, true],
        [10_700, "B", 15, 1],
      ],
      finish: { method: "RINGOUT", loser: "A", t: 12_600 },
      bets: [
        [jo, "B"],
        [priya, "A"],
      ],
      hype: { A: 52, B: 18 },
      notes: [
        { side: "B", modifies: "speed", value: 15, reason: "Aquatic shark on a flooded floor" },
        { side: "A", modifies: "grappleImmune", value: 1, reason: "Jellyfish: nothing to grab" },
      ],
      walkOn: ["Jelly Supreme floats in. It knows it looks good.", "Fresh kicks, fresh teeth."],
      recapLine: "Gary chomped the jellyfish straight into the floodwater.",
    },
    {
      round: 2,
      step: 0,
      seed: 32,
      a: 2,
      b: 3,
      hits: [
        [2_200, "A", 20, 0],
        [4_800, "B", 26, 0, true],
        [7_400, "A", 18, 2],
        [10_100, "B", 14, 1],
        [12_600, "A", 24, 0, true],
        [15_300, "B", 21, 1],
        [17_400, "A", 23, 0],
      ],
      finish: { method: "DECISION" },
      bets: [
        [jo, "A"],
        [priya, "B"],
      ],
      hype: { A: 22, B: 25 },
      notes: [
        {
          side: "A",
          modifies: "knockbackDealt",
          value: 20,
          reason: "Toast launch off a slick counter",
        },
      ],
      walkOn: ["It has two slots and no mercy.", "Gary walks in. Nobody asked how."],
      recapLine: "Toastington out-toasted the shark on points. Nobody is sure how.",
    },
    {
      round: 2,
      step: 1,
      a: 0,
      b: 1,
      hits: [
        [2_000, "A", 18, 0],
        [3_900, "B", 16, 0],
        [6_100, "B", 14, 1],
        [8_800, "A", 20, 0, true],
        [11_500, "B", 19, 0, true],
        [14_200, "B", 13, 2],
        [17_900, "B", 18, 0],
        [21_300, "A", 12, 1],
      ],
      finish: { method: "DECISION" },
      bets: [
        [jo, "A"],
        [priya, "B"],
      ],
      hype: { A: 0, B: 0 },
      notes: [
        { side: "A", modifies: "reach", value: 1, reason: "Jetpack lunge covers the counter" },
        { side: "B", modifies: "hurtbox", value: -20, reason: "Tiny target on a big counter" },
      ],
      walkOn: ["The appeal has arrived. Loudly.", "Ninety-five percent water. All confidence."],
      recapLine: "Jelly Supreme floated past the jetpack and won on smugness alone.",
    },
    {
      round: 3,
      step: 0,
      a: 1,
      b: 2,
      hits: [
        [2_600, "A", 18, 0],
        [5_200, "B", 24, 0, true],
        [7_700, "A", 22, 1],
        [10_400, "A", 30, 0, true],
        [13_000, "A", 28, 0],
        [15_800, "A", 22, 1, true],
      ],
      finish: { method: "KO" },
      bets: [
        [jo, "A"],
        [priya, "A"],
      ],
      hype: { A: 30, B: 12 },
      notes: [
        {
          side: "A",
          modifies: "pushImmune",
          value: 1,
          reason: "Floats on the wind like it owns it",
        },
      ],
      walkOn: ["Jelly Supreme drifts up to the roof.", "Sir Toastington, slightly singed."],
      recapLine: "The jellyfish stung the toaster into early retirement.",
    },
    {
      round: 3,
      step: 1,
      seed: 5,
      a: 3,
      b: 0,
      hits: [
        [2_100, "A", 20, 1],
        [4_400, "B", 22, 0],
        [6_900, "A", 26, 0, true],
        [9_300, "B", 18, 1],
        [12_100, "B", 24, 0, true],
        [15_600, "A", 16, 1],
      ],
      finish: { method: "RINGOUT", loser: "A", t: 18_200 },
      bets: [
        [jo, "B"],
        [priya, "A"],
      ],
      hype: { A: 40, B: 0 },
      notes: [
        { side: "B", modifies: "reach", value: 1, reason: "Jetpack plus rooftop wind" },
        {
          side: "A",
          modifies: "staggerResist",
          value: 15,
          reason: "Heavy shark plants its sneakers",
        },
      ],
      walkOn: ["Gary is back. Fresh kicks, fresh grudge.", "Larry Unbound, appealing at altitude."],
      recapLine: "Larry rocketed Gary off the roof and won the whole thing.",
    },
  ],
};

export const NIGHT_DOODLES = doodle("night", 0, 0, LARRY_STROKES);

export function nightView(
  cursor: Cursor,
  room: Room,
  options: {
    viewer?: RoomPlayer | null;
    fighters?: (fighters: FighterView[]) => FighterView[];
    fights?: (fights: FightView[]) => FightView[];
    extra?: Partial<Mode>;
  } = {},
): RoomView {
  const viewer = options.viewer === undefined ? jo : options.viewer;
  const played = play(NIGHT, cursor, viewer);
  const finished = cursor.phase === "FINISHED";
  const fighters = options.fighters ? options.fighters(played.mode.fighters) : played.mode.fighters;
  const fights = options.fights ? options.fights(played.mode.fights) : played.mode.fights;
  return fixtureView(
    played.players,
    { ...ROOM, ...room },
    {
      ...played.mode,
      fighters,
      fights,
      doodles: finished ? NIGHT_DOODLES : [...NIGHT_DOODLES],
      ...options.extra,
    },
    { viewer },
  );
}

/** Patches one fighter (by slot) in a list. */
export const patch =
  (slot: number, overrides: Partial<FighterView>) =>
  (fighters: FighterView[]): FighterView[] =>
    fighters.map((entry) => (entry.slot === slot ? { ...entry, ...overrides } : entry));

export const patches =
  (...steps: ((fighters: FighterView[]) => FighterView[])[]) =>
  (fighters: FighterView[]) =>
    steps.reduce((list, step) => step(list), fighters);

// --- Build ---

const BUILD_ROOM = playing("BUILD", 1, {
  phaseStartedAt: FIXTURE_NOW - 38_000,
  phaseDeadline: FIXTURE_NOW + 52_000,
});

/** Build-phase fighters: nothing forged yet except the house, which forges at once. */
function buildFighters(
  game: string,
  owners: (RoomPlayer | null)[],
  house: Champion[],
): FighterView[] {
  let houseIndex = 0;
  return owners.map((owner, slot) => {
    if (owner) return fighter(game, slot, owner);
    const sheet = house[houseIndex++]!;
    return fighter(
      game,
      slot,
      null,
      houseIndex === 1
        ? ready(sheet, { text: DESCRIPTIONS[slot] ?? null })
        : forging("HOUSE", 0, 9_000),
    );
  });
}

export function buildView(
  jos: Partial<FighterView>,
  options: {
    priya?: Partial<FighterView>;
    doodles?: Doodle[];
    room?: Room;
    viewer?: RoomPlayer;
  } = {},
): RoomView {
  const fighters = buildFighters("night", NIGHT.owners, [TOASTER, SHARK]).map((entry) => {
    if (entry.slot === 0) return { ...entry, ...jos };
    if (entry.slot === 1)
      return {
        ...entry,
        ...(options.priya ?? { status: "DRAWING" as const, inputKind: "DRAW" as const }),
      };
    return entry;
  });
  const viewer = options.viewer ?? jo;
  return fixtureView(
    DUO,
    { ...ROOM, ...BUILD_ROOM, ...options.room },
    mode({
      myFighterId: fighters.find((entry) => entry.ownerId === viewer.id)?.id ?? null,
      fighters,
      doodles: options.doodles ?? [],
    }),
    { viewer },
  );
}

const FOUR_OWNERS = [jo, priya, sam, max];

export function fourBuild(): RoomView {
  const players = FOUR.map((player) => (player === max ? { ...player, online: false } : player));
  const fighters = [
    fighter("four", 0, jo, { status: "DRAWING", inputKind: "DRAW" }),
    fighter("four", 1, priya, ready(JELLY)),
    fighter("four", 2, sam, { status: "DRAWING", inputKind: "DRAW" }),
    fighter("four", 3, max, { status: "DESCRIBING", inputKind: "DESCRIBE" }),
  ];
  return fixtureView(
    players,
    { ...ROOM, ...BUILD_ROOM },
    mode({
      myFighterId: fighters[0]!.id,
      fighters,
      doodles: [
        ...doodle("four", 0, 0, LARRY_STROKES.slice(0, 7)),
        ...doodle("four", 2, 0, SPUD_STROKES),
      ],
    }),
  );
}

/** Four humans at the first face-off; Maximilian left mid-game and never bets. */
export function fourFaceOff(): RoomView {
  const players = FOUR.map((player) => (player === max ? { ...player, online: false } : player));
  const sheets = [LARRY, JELLY, SPUD, DRAGON];
  const fighters = FOUR_OWNERS.map((owner, slot) =>
    fighter("four", slot, owner, ready(sheets[slot]!)),
  );
  const notes: MatchupNote[] = [
    { side: "B", modifies: "grappleImmune", value: 1, reason: "Jellyfish: nothing to grab" },
    { side: "A", modifies: "strikePower", value: 1, reason: "Briefcase versus jelly: squish" },
  ];
  const fights: FightView[] = [
    [0, 1, 0],
    [2, 3, 1],
  ].map(([a, b, step]) => ({
    id: fightId("four", 1, step!),
    round: 1,
    step: step!,
    a: fighterId("four", a!),
    b: fighterId("four", b!),
    arena: ARENAS[0]!,
    limitMs: 30_000,
    isFinal: false,
    isThirdPlace: false,
    matchup: step === 0 ? "READY" : "PENDING",
    notes: step === 0 ? notes : [],
    applied:
      step === 0
        ? resolveModifiers(LARRY, JELLY, ARENAS[0]!, notes).notes.map((applied) => ({
            side: applied.note.side,
            modifies: applied.note.modifies,
            reason: applied.note.reason,
            value: applied.value,
            favors: applied.favors,
            capped: applied.capped,
            dropped: applied.dropped,
          }))
        : [],
    walkOn:
      step === 0 ? ["Larry has read the terms. All of them.", "Jelly Supreme floats in."] : null,
    hype: { A: 0, B: 0 },
    bets: step === 0 ? { A: [sam.id], B: [priya.id] } : { A: [], B: [] },
    mine: null,
    revealed: false,
    seed: null,
    startsAt: null,
    outcome: null,
    decidedBySeed: false,
    awards: null,
    sheets: null,
    recapLine: null,
  }));
  return fixtureView(
    players,
    {
      ...ROOM,
      ...playing("FACE_OFF", 1, {
        phaseStartedAt: FIXTURE_NOW - 6_000,
        phaseDeadline: FIXTURE_NOW + 9_000,
      }),
    },
    mode({ myFighterId: fighters[0]!.id, fighters, fights, currentFightId: fights[0]!.id }),
    { viewer: sam },
  );
}

// --- Fight-phase rooms ---

export const faceOffRoom = (round: number, step: number) =>
  playing("FACE_OFF", round, {
    step,
    phaseStartedAt: FIXTURE_NOW - 6_000,
    phaseDeadline: FIXTURE_NOW + 9_000,
  });
export const fightRoom = (round: number, step: number) =>
  playing("FIGHT", round, { step, phaseStartedAt: FIXTURE_NOW - 10_000, phaseDeadline: null });
// Settled past the instant replay's latest start (about 1.5 s in), so the first
// load is stable; replay the fixture (R) to see the replay itself.
const RESULT_SETTLED_MS = 3_000;
export const resultRoom = (round: number, step: number) =>
  playing("RESULT", round, {
    step,
    phaseStartedAt: FIXTURE_NOW - RESULT_SETTLED_MS,
    phaseDeadline: FIXTURE_NOW - RESULT_SETTLED_MS + RESULT_SECONDS * 1_000,
  });

export function withoutBets(round: number, step: number) {
  return (fights: FightView[]) =>
    fights.map((fight) =>
      fight.round === round && fight.step === step
        ? {
            ...fight,
            bets: { A: [], B: [] },
            mine: null,
            matchup: "PENDING" as const,
            notes: [],
            applied: [],
            walkOn: null,
          }
        : fight,
    );
}

export function onlyBets(
  round: number,
  step: number,
  A: RoomPlayer[],
  B: RoomPlayer[],
  viewer: RoomPlayer = jo,
) {
  return (fights: FightView[]) =>
    fights.map((fight) =>
      fight.round === round && fight.step === step
        ? {
            ...fight,
            bets: { A: A.map((player) => player.id), B: B.map((player) => player.id) },
            mine: A.includes(viewer) ? ("A" as const) : B.includes(viewer) ? ("B" as const) : null,
          }
        : fight,
    );
}

/** FIGHT with the sim still running on the server: no outcome yet. */
export function simPending(round: number, step: number) {
  return (fights: FightView[]) =>
    fights.map((fight) =>
      fight.round === round && fight.step === step
        ? {
            ...fight,
            outcome: null,
            startsAt: null,
            seed: null,
            awards: null,
            hype: { A: 3, B: 1 },
          }
        : fight,
    );
}

/** The sim failed twice: the seed picked the winner and there is nothing to play. */
export function bySeed(round: number, step: number) {
  return (fights: FightView[]) =>
    fights.map((fight) => {
      if (fight.round !== round || fight.step !== step || !fight.outcome) return fight;
      const outcome = fight.outcome;
      return {
        ...fight,
        decidedBySeed: true,
        outcome: {
          ...outcome,
          method: "DECISION" as FightMethod,
          endMs: 0,
          health: outcome.maxHealth,
          events: [],
          healthTimeline: [],
          hash: "seed",
          decidedBySeed: true,
        },
      };
    });
}

// --- Upgrade ---

export const UPGRADE_ROOM = playing("UPGRADE", 2, {
  phaseStartedAt: FIXTURE_NOW - 9_000,
  phaseDeadline: FIXTURE_NOW + 21_000,
});

/** Round 2's upgrade: everyone still on their round-1 sheet at version 0. */
export function upgradeFighters(jos: Partial<FighterView>, priyas: Partial<FighterView> = {}) {
  return (fighters: FighterView[]) =>
    fighters.map((entry) => {
      const base = {
        ...entry,
        champion: sheetFor(NIGHT, entry.slot, 1),
        version: 0,
        previous: null,
      };
      if (entry.slot === 0) return { ...base, ...jos };
      if (entry.slot === 1) return { ...base, ...priyas };
      return { ...base, ...forging("HOUSE_UPGRADE", 2, 4_000) };
    });
}

export const UPGRADE_CURSOR: Cursor = { phase: "UPGRADE", round: 2 };

/** The night's data, for the fixture test. */
export const slopfightFixtureData = {
  night: NIGHT,
  players: { jo, priya, sam, max },
  playNight: (cursor: Cursor) => play(NIGHT, cursor),
};
