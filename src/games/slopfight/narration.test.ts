import { describe, expect, test } from "vite-plus/test";
import { MOVE_NAME_MAX, NAME_MAX } from "./constants";
import {
  FIGHT_BARK_TAIL_MS,
  FIGHT_CAPTION_GAP_MS,
  FIGHT_SPEECH_GAP_MS,
  LINE_MAX,
  SpeechRequests,
  VOICE_TEMPLATES,
  Voice,
  VoiceQueue,
  cleanLine,
  fillTemplate,
  fitsLine,
  placeClip,
  scheduleLines,
  speechMs,
  timeFightLines,
  toVoiceFighter,
  type VoiceFight,
  type VoiceFighter,
  type VoiceLine,
} from "./narration";
import { SAMPLES } from "./samples";
import type { FightEvent, FightMethod, Side } from "./sim/types";

const champion = (index: number) => SAMPLES[index % SAMPLES.length]!.champion;
const fighter = (index: number, owner: string | null = `Player ${index + 1}`) =>
  toVoiceFighter(champion(index), owner);

/** The worst case: every name at its limit and no pool lines, so only templates can answer. */
function longFighter(letter: string, owner: string | null = "W".repeat(NAME_MAX)): VoiceFighter {
  return {
    name: letter.repeat(NAME_MAX),
    bodyPlan: "MULTIPED",
    traits: ["electric", "aquatic"],
    item: "rubber_chicken",
    moves: [
      { name: "M".repeat(MOVE_NAME_MAX), type: "STRIKE" },
      { name: "G".repeat(MOVE_NAME_MAX), type: "GRAPPLE" },
      { name: "T".repeat(MOVE_NAME_MAX), type: "TRICK" },
    ],
    narration: { walkOn: [], landHit: [], takeHit: [], win: [], lose: [], ringOut: [] },
    owner,
  };
}

const P: [number, number, number] = [0, 0, 0];
const hit = (
  t: number,
  side: Side,
  extra: Partial<{ big: boolean; counter: boolean; miracle: boolean; move: number }> = {},
): FightEvent => ({
  t,
  kind: "hit",
  side,
  move: extra.move ?? 0,
  type: "STRIKE",
  damage: 12,
  knockback: 4,
  big: extra.big ?? true,
  point: P,
  health: 50,
  counter: extra.counter ?? false,
  miracle: extra.miracle ?? false,
});

/** A busy fight: something happens every 300 ms, ending in a finish at `endMs`; the arena's finale starts at `finaleAt`. */
function busyFight(
  endMs: number,
  finish: "ko" | "ringout" | "timeout",
  loser: Side = "B",
  finaleAt?: number,
): FightEvent[] {
  const winner: Side = loser === "A" ? "B" : "A";
  const events: FightEvent[] = [
    { t: 0, kind: "start", side: null },
    { t: 900, kind: "contact", side: null, point: P },
  ];
  let flip = false;
  for (let t = 1_200; t < endMs - 300; t += 300) {
    const side: Side = flip ? "A" : "B";
    flip = !flip;
    const roll = (t / 300) % 7;
    if (roll === 0) events.push({ t, kind: "edge", side, point: P });
    else if (roll === 1)
      events.push({ t, kind: "whiff", side, move: 2, type: "TRICK", reason: "miss" });
    else if (roll === 2)
      events.push({
        t,
        kind: "throw",
        side,
        move: 1,
        damage: 10,
        knockback: 6,
        point: P,
        health: 40,
      });
    else if (roll === 3) events.push({ t, kind: "showboat", side });
    else events.push(hit(t, side, { counter: roll === 4, move: roll % 3 }));
  }
  if (finaleAt !== undefined && finaleAt < endMs) {
    const at = events.findIndex((event) => event.t > finaleAt);
    events.splice(at < 0 ? events.length : at, 0, { t: finaleAt, kind: "finale", side: null });
  }
  if (finish === "ko") events.push({ t: endMs, kind: "ko", side: loser });
  if (finish === "ringout") events.push({ t: endMs, kind: "ringout", side: loser, point: P });
  if (finish === "timeout") {
    events.push(
      { t: endMs, kind: "timeout", side: null },
      { t: endMs, kind: "suddenDeath", side: null },
    );
    events.push(hit(endMs + 1_800, winner));
  }
  const method: FightMethod =
    finish === "ko" ? "KO" : finish === "ringout" ? "RINGOUT" : "SUDDEN_DEATH";
  events.push({ t: events.at(-1)!.t, kind: "end", side: winner, method });
  return events;
}

function expectHouseStyle(lines: readonly VoiceLine[]) {
  for (const line of lines) {
    expect(line.text.length, line.text).toBeLessThanOrEqual(LINE_MAX);
    expect(line.text, line.text).not.toMatch(/[—–]/);
    expect(line.text.trim()).toBe(line.text);
    expect(line.text, line.text).not.toMatch(/\{|\}|undefined|null/);
  }
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Plays a whole game through the Voice, as the stage would, and returns every line. */
function playGame(seed: string | number, roster: VoiceFighter[], dense = false): VoiceLine[] {
  const voice = new Voice(seed);
  const lines: VoiceLine[] = [];
  const add = (got: VoiceLine | VoiceLine[] | null) => {
    if (Array.isArray(got)) lines.push(...got);
    else if (got) lines.push(got);
  };
  const arenas = ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as const;
  add(voice.arenas(arenas));
  roster.forEach((entry, slot) => add(voice.forged(entry, slot)));
  const seen = { A: 0, B: 0 } as Record<string, number>;
  const appearances = new Map<string, number>();
  const pairings = [
    [
      [0, 1],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 3],
    ],
    [
      [0, 3],
      [1, 2],
    ],
  ] as const;
  const finishes = ["ko", "ringout", "timeout"] as const;
  for (let round = 1; round <= 3; round += 1) {
    if (round > 1) {
      add(voice.standings(round - 1, round === 2 ? "Player 1" : null));
      add(voice.upgrade(round - 1));
      roster.forEach((entry, slot) =>
        add(voice.upgradeReveal(entry, { ...entry, name: `Old ${slot}` }, slot, round - 1)),
      );
    }
    const [opener] = pairings[round - 1];
    add(voice.lineup(round, arenas[round - 1], { a: roster[opener[0]]!.name, b: roster[opener[1]]!.name }));
    pairings[round - 1].forEach(([left, right], index) => {
      const step = index + 1;
      const a = roster[left]!;
      const b = roster[right]!;
      const fight: VoiceFight = {
        round,
        step,
        arena: arenas[round - 1],
        a,
        b,
        appearance: { A: appearances.get(a.name) ?? 0, B: appearances.get(b.name) ?? 0 },
        walkOn: [`${a.name} cracks its knuckles.`, `${b.name} pretends not to care.`],
        isFinal: round === 3 && step === 2,
        isThirdPlace: round === 3 && step === 1,
      };
      add(voice.faceOff(fight));
      const finish = finishes[(round + step) % 3]!;
      const events = dense ? busyFight(18_000, finish, "B", 10_000) : busyFight(9_000, finish);
      add(voice.fight(fight, events));
      add(
        voice.result(fight, {
          winner: "A",
          method: finish === "ko" ? "KO" : finish === "ringout" ? "RINGOUT" : "SUDDEN_DEATH",
        }),
      );
      appearances.set(a.name, (appearances.get(a.name) ?? 0) + 1);
      appearances.set(b.name, (appearances.get(b.name) ?? 0) + 1);
      seen.A! += 1;
    });
  }
  add(voice.podium(roster[0]!, roster[1]!, roster[2]));
  return lines;
}

describe("templates", () => {
  test("every template set has a line that fits with every name at its limit", () => {
    const vars = {
      x: "X".repeat(NAME_MAX),
      y: "Y".repeat(NAME_MAX),
      a: "A".repeat(NAME_MAX),
      b: "B".repeat(NAME_MAX),
      prev: "P".repeat(NAME_MAX),
      move: "M".repeat(MOVE_NAME_MAX),
      plan: "quadruped",
      trait: "indestructible",
      item: "rubber chicken",
      owner: "O".repeat(NAME_MAX),
      leader: "L".repeat(NAME_MAX),
      arena: "the Kitchen Counter",
      arena1: "Flooded Garage",
      arena2: "Kitchen Counter",
      arena3: "Rooftop",
      drop: "the kitchen floor",
      n: "three",
    };
    for (const [set, templates] of Object.entries(VOICE_TEMPLATES)) {
      const fitting = templates
        .map((template) => fillTemplate(template, vars))
        .filter((text) => text && fitsLine(text));
      expect(fitting.length, set).toBeGreaterThan(0);
    }
  });

  test("no template is written with a dash or runs over with short names", () => {
    for (const templates of Object.values(VOICE_TEMPLATES)) {
      for (const template of templates) {
        expect(template).not.toMatch(/[—–]/);
        const short = fillTemplate(template, {
          x: "Bo",
          y: "Al",
          a: "Bo",
          b: "Al",
          prev: "Old",
          move: "Bonk",
          plan: "biped",
          trait: "loud",
          item: "pan",
          owner: "Gab",
          leader: "Gab",
          arena: "the Rooftop",
          arena1: "A",
          arena2: "B",
          arena3: "C",
          drop: "the street",
          n: "one",
        });
        expect(short && fitsLine(short), template).toBeTruthy();
      }
    }
  });

  test("a missing slot skips the template instead of leaving a hole", () => {
    expect(fillTemplate("{x} brought a {item}.", { x: "Bo", item: null })).toBeNull();
    expect(fillTemplate("{Trait} and proud.", { trait: "loud" })).toBe("Loud and proud.");
  });

  test("'the {move}' drops its 'the' before a name that reads wrong with one", () => {
    const line = (move: string) => fillTemplate("The {move}! Devastating.", { move });
    expect(line("Piston Punch")).toBe("The Piston Punch! Devastating.");
    expect(line("Under the Fridge")).toBe("Under the Fridge! Devastating.");
    expect(line("the big bonk")).toBe("The big bonk! Devastating.");
    expect(fillTemplate("{x} lands the {move}!", { x: "Bo", move: "Piston Punch" })).toBe(
      "Bo lands the Piston Punch!",
    );
    expect(fillTemplate("{x} lands the {move}!", { x: "Bo", move: "A Light Slap" })).toBe(
      "Bo lands A Light Slap!",
    );
    expect(fillTemplate("{x} lands the {move}!", { x: "Bo", move: "Larry's Lawsuit" })).toBe(
      "Bo lands Larry's Lawsuit!",
    );
    expect(fillTemplate("{x} lands the {move}!", { x: "Bo", move: "Uppercut" })).toBe(
      "Bo lands the Uppercut!",
    );
  });

  test("a slot after 'a' takes 'an' before a vowel", () => {
    expect(fillTemplate("{x} has a {item}.", { x: "Bo", item: "umbrella" })).toBe(
      "Bo has an umbrella.",
    );
    expect(fillTemplate("{x} has a {item}.", { x: "Bo", item: "mop" })).toBe("Bo has a mop.");
    expect(fillTemplate("A {plan} with {trait} energy.", { plan: "ape", trait: "loud" })).toBe(
      "An ape with loud energy.",
    );
  });

  test("pool lines lose their em dashes", () => {
    expect(cleanLine("I came — I saw – I fell")).toBe("I came, I saw, I fell");
    expect(cleanLine("  spaced   out  ")).toBe("spaced out");
  });
});

describe("the Voice through a whole game", () => {
  const roster = [0, 1, 2, 3].map((index) =>
    fighter(index, index === 3 ? null : `Player ${index + 1}`),
  );

  test("every line fits the house style", () => {
    expectHouseStyle(playGame("style", roster, true));
    expectHouseStyle(
      playGame(
        "long",
        ["A", "B", "C", "D"].map((letter) => longFighter(letter)),
        true,
      ),
    );
  });

  test("no line repeats within a game", () => {
    for (const seed of ["one", "two", 3, 4]) {
      for (const cast of [roster, ["A", "B", "C", "D"].map((letter) => longFighter(letter))]) {
        const texts = playGame(seed, cast, true).map((line) => normal(line.text));
        expect(new Set(texts).size).toBe(texts.length);
      }
    }
  });

  test("every beat gets a line, even with long names and empty pools", () => {
    const cast = ["A", "B", "C", "D"].map((letter) => longFighter(letter));
    const beats = new Set(playGame("beats", cast, true).map((line) => line.beat));
    for (const beat of [
      "arenas",
      "build",
      "forged",
      "upgradeReveal",
      "roster",
      "faceOff",
      "final",
      "thirdPlace",
      "walkOn",
      "start",
      "ko",
      "ringOut",
      "finale",
      "suddenDeath",
      "result",
      "standings",
      "upgrade",
      "podium",
    ] as const) {
      expect(beats.has(beat), beat).toBe(true);
    }
  });

  test("the same seed says the same things; another seed says other things", () => {
    const first = playGame("same", roster).map((line) => `${line.key}|${line.text}|${line.speak}`);
    expect(
      playGame("same", roster).map((line) => `${line.key}|${line.text}|${line.speak}`),
    ).toEqual(first);
    const other = playGame("different", roster).map((line) => `${line.key}|${line.text}`);
    expect(other).not.toEqual(first.map((entry) => entry.split("|").slice(0, 2).join("|")));
  });

  test("keys are unique and asking again returns the same line", () => {
    const voice = new Voice("again");
    const fight: VoiceFight = { round: 1, step: 1, arena: "ROOFTOP", a: roster[0]!, b: roster[1]! };
    const events = busyFight(9_000, "ko");
    expect(voice.fight(fight, events)).toBe(voice.fight(fight, events));
    expect(voice.lineup(1, "ROOFTOP", null)).toEqual(voice.lineup(1, "ROOFTOP", null));
    expect(voice.faceOff(fight)).toEqual(voice.faceOff(fight));
    const keys = playGame("keys", roster, true).map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("champion pools", () => {
  const raccoon = fighter(0);
  const jelly = fighter(1);

  test("the line-up is one line per round: round one says to bet, round three names the Final", () => {
    for (const seed of ["lineup-a", "lineup-b", "lineup-c"]) {
      const voice = new Voice(seed);
      const first = { a: raccoon.name, b: jelly.name };
      expect(voice.lineup(1, "ROOFTOP", first)!.text).toMatch(/bet|phones/i);
      expect(voice.lineup(2, "KITCHEN_COUNTER", first)!.key).toBe("lineup:2");
      expect(voice.lineup(3, "FLOODED_GARAGE", first)!.text).toMatch(/final/i);
    }
  });

  test("a fight uses the hitter's landHit, then the target's takeHit, and the ring-out line", () => {
    const voice = new Voice("pool-fight");
    const fight: VoiceFight = { round: 1, step: 1, arena: "FLOODED_GARAGE", a: raccoon, b: jelly };
    const events: FightEvent[] = [
      { t: 0, kind: "start", side: null },
      hit(3_000, "A"),
      hit(7_000, "A"),
      { t: 12_000, kind: "ringout", side: "B", point: P },
    ];
    const texts = voice.fight(fight, events).map((line) => line.text);
    expect(texts).toContain(cleanLine(raccoon.narration.landHit[0]!));
    expect(texts).toContain(cleanLine(jelly.narration.takeHit[0]!));
    expect(texts).toContain(cleanLine(jelly.narration.ringOut[0]!));
  });

  test("the result prefers the winner's own line, rotated by its record", () => {
    const voice = new Voice("pool-result");
    const fight: VoiceFight = { round: 2, step: 1, arena: "ROOFTOP", a: raccoon, b: jelly };
    const line = voice.result(
      fight,
      { winner: "B", method: "KO" },
      { winsBefore: 1, lossesBefore: 0 },
    );
    expect(line!.text).toBe(cleanLine(jelly.narration.win[1]!));
    expect(line!.side).toBe("B");
  });

  test("a pool line already said is not said again", () => {
    const voice = new Voice("pool-repeat");
    const fight: VoiceFight = { round: 1, step: 1, arena: "FLOODED_GARAGE", a: raccoon, b: jelly };
    const walkOn = raccoon.narration.walkOn[0]!;
    voice.faceOff({ ...fight, walkOn: [walkOn, "Other words."] });
    const lines = voice.faceOff({ ...fight, step: 2, walkOn: [walkOn, "Fresh words."] });
    expect(lines.map((line) => line.text)).not.toContain(cleanLine(walkOn));
    expect(lines.map((line) => line.text)).toContain("Fresh words.");
  });
});

describe("fight pacing", () => {
  const fight: VoiceFight = {
    round: 1,
    step: 1,
    arena: "KITCHEN_COUNTER",
    a: fighter(4),
    b: fighter(5),
  };

  test("spoken lines never talk over each other and captions keep their distance", () => {
    for (const finish of ["ko", "ringout", "timeout"] as const) {
      const plan = new Voice(`pace-${finish}`).fight(fight, busyFight(20_000, finish));
      const spoken = plan.filter((line) => line.speak);
      for (let index = 1; index < spoken.length; index += 1) {
        const previous = spoken[index - 1]!;
        const gap = spoken[index]!.atMs! - previous.atMs!;
        // The opening bark holds the floor only as long as it takes to say.
        const floor =
          previous.beat === "start"
            ? speechMs(previous.text) + FIGHT_BARK_TAIL_MS
            : Math.max(FIGHT_SPEECH_GAP_MS, speechMs(previous.text));
        expect(gap).toBeGreaterThanOrEqual(floor);
      }
      for (let index = 1; index < plan.length; index += 1) {
        expect(plan[index]!.atMs! - plan[index - 1]!.atMs!).toBeGreaterThanOrEqual(
          FIGHT_CAPTION_GAP_MS,
        );
      }
      expectHouseStyle(plan);
    }
  });

  test("the finish is always spoken and the start is called", () => {
    const ko = new Voice("finish").fight(fight, busyFight(15_000, "ko"));
    expect(ko.find((line) => line.beat === "ko")?.speak).toBe(true);
    expect(ko[0]?.beat).toBe("start");
    const ringOut = new Voice("finish").fight(fight, busyFight(15_000, "ringout"));
    const out = ringOut.find((line) => line.beat === "ringOut");
    expect(out?.speak).toBe(true);
    expect(out?.atMs).toBeGreaterThan(15_000);
    const decided = new Voice("finish").fight(fight, busyFight(15_000, "timeout"));
    expect(
      decided.find((line) => line.beat === "suddenDeath" || line.beat === "timeout")?.speak,
    ).toBe(true);
  });

  test("the arena's finale is called as it starts, in that arena's words", () => {
    const sets = {
      FLOODED_GARAGE: "finaleFlood",
      KITCHEN_COUNTER: "finaleTilt",
      ROOFTOP: "finaleStorm",
    } as const;
    for (const [arena, set] of Object.entries(sets)) {
      const plan = new Voice(`finale-${arena}`).fight(
        { ...fight, arena: arena as keyof typeof sets },
        busyFight(26_000, "ringout", "B", 20_000),
      );
      const lines = plan.filter((line) => line.beat === "finale");
      expect(lines, arena).toHaveLength(1);
      expect(lines[0]).toMatchObject({ atMs: 20_000, speak: true });
      expect(VOICE_TEMPLATES[set]).toContain(lines[0]!.text);
      expectHouseStyle(plan);
    }
  });

  test("a busy fight keeps the big moments and drops the small stuff", () => {
    const events = busyFight(20_000, "ko");
    const plan = new Voice("busy").fight(fight, events);
    const spoken = plan.filter((line) => line.speak);
    expect(spoken.length).toBeLessThanOrEqual(Math.ceil(20_000 / FIGHT_SPEECH_GAP_MS) + 1);
    expect(plan.length).toBeLessThan(events.length / 3);
    const meanPriority = (lines: VoiceLine[]) =>
      lines.reduce((sum, line) => sum + line.priority, 0) / lines.length;
    const captions = plan.filter((line) => !line.speak);
    if (captions.length)
      expect(meanPriority(spoken)).toBeGreaterThanOrEqual(meanPriority(captions));
    expect(plan.every((line) => line.beat !== "whiff" || !line.speak || line.priority >= 15)).toBe(
      true,
    );
  });

  test("a slither slipping a grab and a broken Trick get their own lines, once a fight each", () => {
    const events: FightEvent[] = [
      { t: 0, kind: "start", side: null },
      { t: 1_000, kind: "contact", side: null, point: P },
      { t: 6_000, kind: "whiff", side: "A", move: 1, type: "GRAPPLE", reason: "slipped" },
      { t: 11_000, kind: "whiff", side: "B", move: 2, type: "TRICK", reason: "broken" },
      { t: 16_000, kind: "whiff", side: "A", move: 1, type: "GRAPPLE", reason: "slipped" },
      { t: 21_000, kind: "whiff", side: "B", move: 2, type: "TRICK", reason: "broken" },
      { t: 25_000, kind: "ko", side: "B" },
      { t: 25_000, kind: "end", side: "A", method: "KO" },
    ];
    for (const seed of ["slip-1", "slip-2", "slip-3"]) {
      const plan = new Voice(seed).fight(fight, events);
      const slipped = plan.filter((line) => line.beat === "slipped");
      const broken = plan.filter((line) => line.beat === "broken");
      // Capped at one each, like an immune grab, and said on a quiet moment.
      expect(slipped, seed).toHaveLength(1);
      expect(broken, seed).toHaveLength(1);
      expect(slipped[0]).toMatchObject({ side: "A", atMs: 6_000, speak: true });
      // The broken Trick is called just after the hit that broke it.
      expect(broken[0]).toMatchObject({ side: "B", atMs: 11_250, speak: true });
      // About the grabber and the slither; about the Trick's owner, its move and the hitter.
      const filled = (set: "slipped" | "broken", vars: Record<string, string>) =>
        VOICE_TEMPLATES[set].map((template) => fillTemplate(template, vars));
      expect(filled("slipped", { x: fight.a.name, y: fight.b.name })).toContain(slipped[0]!.text);
      expect(
        filled("broken", { x: fight.b.name, y: fight.a.name, move: fight.b.moves[2]!.name }),
      ).toContain(broken[0]!.text);
      expectHouseStyle(plan);
    }
  });

  test("a broken Trick yields to the big hit that broke it", () => {
    const plan = new Voice("broken-hit").fight(fight, [
      { t: 0, kind: "start", side: null },
      { t: 1_000, kind: "contact", side: null, point: P },
      hit(6_000, "A"),
      { t: 6_000, kind: "whiff", side: "B", move: 2, type: "TRICK", reason: "broken" },
      { t: 15_000, kind: "ko", side: "B" },
    ]);
    expect(plan.find((line) => line.beat === "bigHit")?.speak).toBe(true);
    expect(plan.some((line) => line.beat === "broken")).toBe(false);
  });

  test("lines are timed after their event: hits after the hit stop, ring-outs after the drop", () => {
    const plan = new Voice("lead").fight(fight, [
      { t: 0, kind: "start", side: null },
      hit(5_000, "A"),
      { t: 11_000, kind: "ringout", side: "B", point: P },
    ]);
    const big = plan.find((line) => line.beat === "bigHit")!;
    expect(big.atMs).toBeGreaterThan(5_000);
    expect(big.atMs).toBeLessThan(5_600);
    expect(plan.find((line) => line.beat === "ringOut")!.atMs).toBeGreaterThan(11_000);
  });

  /** Real sim density: a counter hit about every 2 s, throws, two edges and a showboat. */
  function realisticFight(): FightEvent[] {
    const events: FightEvent[] = [
      { t: 0, kind: "start", side: null },
      { t: 1_133, kind: "contact", side: null, point: P },
    ];
    for (let t = 1_467; t < 29_000; t += 2_100)
      events.push(hit(t, t % 2 ? "A" : "B", { counter: true }));
    for (let t = 3_300; t < 29_000; t += 3_000) {
      events.push({
        t,
        kind: "throw",
        side: t % 2 ? "B" : "A",
        move: 1,
        damage: 10,
        knockback: 6,
        point: P,
        health: 40,
      });
    }
    events.push(
      { t: 11_617, kind: "edge", side: "B", point: P },
      { t: 16_200, kind: "edge", side: "B", point: P },
      { t: 18_150, kind: "showboat", side: "A" },
      hit(24_000, "A", { miracle: true }),
      { t: 30_000, kind: "timeout", side: null },
    );
    events.sort((p, q) => p.t - q.t);
    events.push({ t: 30_000, kind: "end", side: "A", method: "DECISION" });
    return events;
  }

  test("counters and throws cannot crowd out the first contact, the edge and the showboat", () => {
    for (const seed of ["crowd-1", "crowd-2", "crowd-3"]) {
      const plan = new Voice(seed).fight(fight, realisticFight());
      const count = (beat: VoiceLine["beat"]) => plan.filter((line) => line.beat === beat).length;
      const contact = plan.find((line) => line.beat === "firstContact");
      expect(contact?.speak, seed).toBe(true);
      expect(contact!.atMs).toBeLessThanOrEqual(1_133 + 1_500);
      expect(count("edge"), seed).toBeGreaterThanOrEqual(1);
      expect(count("showboat"), seed).toBe(1);
      expect(count("counter"), seed).toBeLessThanOrEqual(2);
      expect(count("throw"), seed).toBeLessThanOrEqual(3);
      expect(plan.find((line) => line.beat === "timeout")?.speak).toBe(true);
    }
  });

  test("the first hit is the first contact when no contact event comes first", () => {
    const plan = new Voice("touch").fight(fight, [
      { t: 0, kind: "start", side: null },
      hit(4_000, "A", { big: false }),
      { t: 9_000, kind: "ko", side: "B" },
    ]);
    expect(plan.map((line) => line.beat)).toEqual(["start", "firstContact", "ko"]);
  });

  test("a big hit that loses its moment leaves the champion's own line for the next one", () => {
    const raccoon = fighter(0);
    const voice = new Voice("pool-slot");
    const plan = voice.fight({ ...fight, a: raccoon }, [
      { t: 0, kind: "start", side: null },
      { t: 1_300, kind: "contact", side: null, point: P },
      hit(1_400, "A"),
      hit(8_000, "A"),
      { t: 15_000, kind: "ko", side: "B" },
    ]);
    const landHit = plan.find((line) => line.text === cleanLine(raccoon.narration.landHit[0]!));
    expect(landHit?.atMs).toBeGreaterThan(8_000);
  });

  test("the opening call can be had at the face-off and the plan reuses it", () => {
    const voice = new Voice("opening");
    const early = voice.fightStart(fight)!;
    expect(early.beat).toBe("start");
    expect(early.speak).toBe(true);
    const plan = voice.fight(fight, busyFight(9_000, "ko"));
    expect(plan[0]).toEqual(early);
    expect(voice.fightStart(fight)).toEqual(early);
    const cold = new Voice("opening").fight(fight, busyFight(9_000, "ko"));
    expect(cold[0]!.key).toBe(early.key);
  });

  test("fight lines map onto the room clock", () => {
    const plan = new Voice("clock").fight(fight, busyFight(9_000, "ko"));
    const timed = timeFightLines(plan, 1_000_000);
    expect(timed.map((line) => line.at)).toEqual(plan.map((line) => 1_000_000 + line.atMs!));
  });
});

describe("live pacing", () => {
  const line = (key: string, priority: number, text = "A short line."): VoiceLine => ({
    key,
    text,
    speak: true,
    priority,
    beat: "forged",
  });

  test("the queue says the most important line first and waits for the last one to finish", () => {
    const queue = new VoiceQueue({ gapMs: 2_500, staleMs: 10_000 });
    queue.push([line("a", 10), line("b", 50), line("c", 30)], 0);
    expect(queue.next(0)?.key).toBe("b");
    expect(queue.next(1_000)).toBeNull();
    expect(queue.next(2_500)?.key).toBe("c");
    expect(queue.next(5_000)?.key).toBe("a");
    expect(queue.next(9_000)).toBeNull();
  });

  test("a long line holds the floor for as long as it takes to say", () => {
    const queue = new VoiceQueue({ gapMs: 1_000 });
    const long = line("long", 50, "x".repeat(LINE_MAX));
    queue.push([long, line("next", 10)], 0);
    queue.next(0);
    expect(queue.next(speechMs(long.text) - 1)).toBeNull();
    expect(queue.next(speechMs(long.text))?.key).toBe("next");
  });

  test("stale lines are dropped and a key is only queued once", () => {
    const queue = new VoiceQueue({ gapMs: 2_500, staleMs: 4_000 });
    queue.push([line("first", 90), line("old", 10)], 0);
    queue.push(line("first", 90), 100);
    expect(queue.next(0)?.key).toBe("first");
    expect(queue.next(5_000)).toBeNull();
    expect(queue.size).toBe(0);
  });

  test("clearing drops the waiting lines but keeps the floor and the keys", () => {
    const queue = new VoiceQueue({ gapMs: 2_500, staleMs: 10_000 });
    queue.push([line("said", 90), line("waiting", 10)], 0);
    expect(queue.next(0)?.key).toBe("said");
    queue.clear();
    expect(queue.size).toBe(0);
    queue.push([line("waiting", 10), line("fresh", 10)], 500);
    expect(queue.next(1_000)).toBeNull();
    expect(queue.next(2_500)?.key).toBe("fresh");
  });

  test("a batch of phase lines is laid end to end", () => {
    const lines = [line("a", 1, "One."), line("b", 1, "Two, a little longer."), line("c", 1)];
    const timed = scheduleLines(lines, 10_000, 300);
    expect(timed[0]!.at).toBe(10_000);
    expect(timed[1]!.at).toBe(10_000 + speechMs("One.") + 300);
    expect(timed[2]!.at).toBe(timed[1]!.at + speechMs("Two, a little longer.") + 300);
  });
});

describe("speech requests", () => {
  const line = (key: string, priority = 50, text = `Line ${key}.`): VoiceLine => ({
    key,
    text,
    speak: true,
    priority,
    beat: "faceOff",
  });

  function harness({ concurrency = 1, lateMs = 1_500 } = {}) {
    let now = 0;
    const calls: string[] = [];
    const replies = new Map<
      string,
      { resolve: (value: string) => void; reject: (error: Error) => void }
    >();
    const requests = new SpeechRequests<string>({
      fetch: (asked) => {
        calls.push(asked.key);
        return new Promise<string>((resolve, reject) =>
          replies.set(asked.key, { resolve, reject }),
        );
      },
      now: () => now,
      concurrency,
      lateMs,
    });
    const flush = () => new Promise((done) => setTimeout(done, 0));
    return {
      requests,
      calls,
      setNow: (ms: number) => {
        now = ms;
      },
      reply: async (key: string, value = `audio:${key}`) => {
        replies.get(key)!.resolve(value);
        await flush();
      },
      fail: async (key: string) => {
        replies.get(key)!.reject(new Error("no voice"));
        await flush();
      },
    };
  }

  test("asks for each line once, the soonest first, a few at a time", async () => {
    const h = harness();
    const late = h.requests.get(line("late"), 9_000);
    const soon = h.requests.get(line("soon"), 2_000);
    const again = h.requests.get(line("soon"), 2_000);
    expect(again).toBe(soon);
    expect(h.calls).toEqual(["late"]);
    await h.reply("late");
    expect(await late).toBe("audio:late");
    expect(h.calls).toEqual(["late", "soon"]);
    await h.reply("soon");
    expect(await soon).toBe("audio:soon");
  });

  test("a prefetch is fetched early and claimed later without a second request", async () => {
    const h = harness();
    const prefetched = h.requests.get(line("fight"));
    await h.reply("fight");
    expect(await prefetched).toBe("audio:fight");
    h.setNow(20_000);
    expect(await h.requests.get(line("fight"), 21_500)).toBe("audio:fight");
    expect(h.calls).toEqual(["fight"]);
  });

  test("claiming a queued prefetch with its moment moves it up the queue", async () => {
    const h = harness();
    void h.requests.get(line("busy"), 1_000);
    void h.requests.get(line("other"), 5_000);
    const opening = h.requests.get(line("opening"));
    void h.requests.get(line("opening"), 3_000);
    await h.reply("busy");
    expect(h.calls).toEqual(["busy", "opening"]);
    await h.reply("opening");
    expect(await opening).toBe("audio:opening");
  });

  test("a request still waiting past its moment is dropped; a failed one can be asked again", async () => {
    const h = harness({ lateMs: 1_500 });
    void h.requests.get(line("first"), 0);
    const stale = h.requests.get(line("stale"), 1_000);
    h.setNow(3_000);
    await h.reply("first");
    expect(await stale).toBeNull();
    expect(h.calls).toEqual(["first"]);

    const failing = h.requests.get(line("flaky"), 10_000);
    await h.fail("flaky");
    expect(await failing).toBeNull();
    void h.requests.get(line("flaky"), 10_000);
    expect(h.calls).toEqual(["first", "flaky", "flaky"]);
  });

  test("clear drops what has not been sent", async () => {
    const h = harness();
    void h.requests.get(line("sent"), 1_000);
    const queued = h.requests.get(line("queued"), 2_000);
    h.requests.clear();
    expect(await queued).toBeNull();
    expect(h.requests.pending).toBe(1);
    await h.reply("sent");
    expect(h.requests.pending).toBe(0);
    expect(h.calls).toEqual(["sent"]);
  });
});

describe("placing voiced clips", () => {
  const clip = (id: string, start: number, end: number, priority = 50) => ({
    id,
    start,
    end,
    priority,
  });

  test("a clip plays at its moment when the Voice is free", () => {
    expect(placeClip([], { want: 10, duration: 2, priority: 50 }, 5)).toEqual({
      start: 10,
      bump: [],
    });
    expect(placeClip([], { want: 4, duration: 2, priority: 50 }, 5)?.start).toBeCloseTo(5.03);
  });

  test("a clip waits for the one already speaking, within the lateness limit", () => {
    const busy = [clip("a", 9, 10.5)];
    expect(placeClip(busy, { want: 10, duration: 2, priority: 50 }, 9.5)?.start).toBeCloseTo(10.62);
    expect(placeClip([clip("a", 9, 13)], { want: 10, duration: 2, priority: 50 }, 9.5)).toBeNull();
  });

  test("a more important clip bumps one that has not started; a playing one is never cut", () => {
    const queued = [clip("small", 10.5, 12, 20)];
    expect(placeClip(queued, { want: 10, duration: 2, priority: 100 }, 9)).toEqual({
      start: 10,
      bump: ["small"],
    });
    const playing = [clip("small", 9, 10.8, 20)];
    expect(placeClip(playing, { want: 10, duration: 2, priority: 100 }, 9.5)).toEqual({
      start: 10.92,
      bump: [],
    });
  });

  test("a clip that arrives too late is dropped", () => {
    expect(placeClip([], { want: 10, duration: 2, priority: 50 }, 12)).toBeNull();
  });
});
