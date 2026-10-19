// The Voice: SlopFight's announcer. Turns room beats (the arenas, a forge, the
// roster, a face-off, a fight's event log, results, upgrades, the podium) into
// caption lines, from each champion's narration pool plus templates in the
// house voice. Pure and deterministic: the same seed and the same calls give
// the same lines, so the stage's captions and the host's TTS agree.
//
// Rules: lines are at most 70 characters, never contain an em dash, and never
// repeat within a game. In a fight the Voice speaks at most about once every
// 2.5 s (the opening bark excepted); lower-priority beats become caption-only
// or are dropped, and the busy ones (counters, throws) are capped per fight so
// the first contact, the edge and the showboat still get their say.

import { seededShuffle } from "../../lib/hash";
import { getArena, type ArenaId } from "./arenas";
import type { FightEvent, FightMethod, Side } from "./sim/types";
import { BODY_PLAN_INFO, type PropTag } from "./vocab";
import {
  FIGHT_BARK_TAIL_MS,
  FIGHT_CAPTION_GAP_MS,
  FIGHT_SPEECH_GAP_MS,
  PRIORITY,
  cleanLine,
  fillTemplate,
  fitsLine,
  speechMs,
  type Vars,
  type VoiceBeat,
  type VoiceFight,
  type VoiceFighter,
  type VoiceLine,
} from "./narration/lines";
import {
  T,
  DROP_BY_ARENA,
  FINALE_SET,
  RING_OUT_SET,
  RESULT_SET,
  ROUND_WORDS,
  type TemplateSet,
} from "./narration/templates";

// Existing public entry point for stage, controller, backend helpers and tests.
export {
  LINE_MAX,
  FIGHT_SPEECH_GAP_MS,
  FIGHT_CAPTION_GAP_MS,
  FIGHT_BARK_TAIL_MS,
  PRIORITY,
  toVoiceFighter,
  cleanLine,
  fitsLine,
  speechMs,
  fillTemplate,
  type VoiceBeat,
  type VoiceLine,
  type VoiceFighter,
  type VoiceFight,
  type Vars,
} from "./narration/lines";
export { VOICE_TEMPLATES } from "./narration/templates";
export {
  scheduleLines,
  timeFightLines,
  VoiceQueue,
  placeClip,
  SpeechRequests,
  type TimedVoiceLine,
  type PlacedClip,
} from "./narration/timing";

function propWords(item: PropTag | null): string | null {
  if (!item || item === "thing") return null;
  return item.replace(/_/g, " ");
}

function fighterVars(x: VoiceFighter, y: VoiceFighter | null, pick: number): Vars {
  return {
    x: x.name,
    y: y?.name,
    plan: BODY_PLAN_INFO[x.bodyPlan].label.toLowerCase(),
    trait: x.traits.length ? x.traits[pick % x.traits.length] : null,
    item: propWords(x.item),
    owner: x.owner,
  };
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// The Voice
// ---------------------------------------------------------------------------

export interface Choice {
  /** Pool lines (already literal), tried first in this order. */
  pool?: readonly (string | null | undefined)[];
  sets: readonly TemplateSet[];
  vars: Vars;
}

/**
 * One per game. Lines are cached by key, so asking for the same beat twice
 * (a re-render, a remount of a caption) returns the same line, and a text
 * is never used twice in the game while another candidate fits.
 */
export class Voice {
  private readonly seed: string;
  private readonly used = new Set<string>();
  private readonly turns = new Map<string, number>();
  private readonly lines = new Map<string, VoiceLine>();
  private readonly plans = new Map<string, VoiceLine[]>();

  constructor(seed: string | number) {
    this.seed = String(seed);
  }

  /** Candidates in preference order: pool lines, then this beat's templates in seeded rotation. */
  private candidates(choice: Choice): string[] {
    const out: string[] = [];
    for (const line of choice.pool ?? []) {
      if (line) out.push(cleanLine(line));
    }
    for (const set of choice.sets) {
      const order = seededShuffle(T[set], `${this.seed}:${set}`);
      const turn = this.turns.get(set) ?? 0;
      for (let index = 0; index < order.length; index += 1) {
        const text = fillTemplate(order[(turn + index) % order.length]!, choice.vars);
        if (text) out.push(text);
      }
    }
    return out.filter(fitsLine);
  }

  private pick(choice: Choice): string | null {
    const options = this.candidates(choice);
    // Never repeat a line in a game: when every candidate has been said, say nothing.
    return options.find((text) => !this.used.has(normal(text))) ?? null;
  }

  private commit(text: string, sets: readonly TemplateSet[]): void {
    this.used.add(normal(text));
    for (const set of sets) this.turns.set(set, (this.turns.get(set) ?? 0) + 1);
  }

  private line(
    key: string,
    beat: VoiceBeat,
    choice: Choice,
    extra: Partial<Pick<VoiceLine, "side" | "speak" | "priority">> = {},
  ): VoiceLine | null {
    const cached = this.lines.get(key);
    if (cached) return cached;
    const text = this.pick(choice);
    if (!text) return null;
    this.commit(text, choice.sets);
    const made: VoiceLine = {
      key,
      text,
      speak: extra.speak ?? true,
      priority: extra.priority ?? PRIORITY.phase,
      beat,
      ...(extra.side ? { side: extra.side } : {}),
    };
    this.lines.set(key, made);
    return made;
  }

  /** Build opens: tonight's three arenas, then the brief. */
  arenas(arenas: readonly ArenaId[]): VoiceLine[] {
    const [one, two, three] = arenas.map((id) => getArena(id).name);
    return [
      this.line("arenas", "arenas", {
        sets: ["arenas"],
        vars: { arena1: one, arena2: two, arena3: three },
      }),
      this.line("build", "build", { sets: ["build"], vars: {} }),
    ].filter((line): line is VoiceLine => line !== null);
  }

  /** A champion's forge finished at Build (version 0). */
  forged(fighter: VoiceFighter, slot: number): VoiceLine | null {
    const house = fighter.owner === null;
    return this.line(`forged:${slot}:0`, "forged", {
      sets: house ? ["forgedHouse", "forged"] : ["forged"],
      vars: fighterVars(fighter, null, slot),
    });
  }

  /** An upgrade forge finished: the old champion and the new one. */
  upgradeReveal(
    fighter: VoiceFighter,
    previous: VoiceFighter,
    slot: number,
    round: number,
  ): VoiceLine | null {
    return this.line(`forged:${slot}:${round}`, "upgradeReveal", {
      sets: ["upgradeReveal"],
      vars: {
        ...fighterVars(fighter, null, round),
        prev: previous.name === fighter.name ? null : previous.name,
      },
    });
  }

  /**
   * The line-up: one line for the round, as the four walk out together. The
   * champions were each introduced as they were forged; this says where the
   * round is and who opens it (round one also says to bet).
   */
  lineup(round: number, arena: ArenaId, first: { a: string; b: string } | null): VoiceLine | null {
    return this.line(
      `lineup:${round}`,
      "roster",
      {
        sets: round >= 3 ? ["lineupFinal"] : round === 1 ? ["lineupFirst"] : ["lineup"],
        vars: {
          n: ROUND_WORDS[round] ?? String(round),
          arena: getArena(arena).spokenName,
          a: first?.a ?? null,
          b: first?.b ?? null,
        },
      },
      { priority: PRIORITY.roster },
    );
  }

  /** The face-off: who versus who (the Final and third place get their own), then the matchup walk-ons. */
  faceOff(fight: VoiceFight): VoiceLine[] {
    const id = `${fight.round}:${fight.step}`;
    const set: TemplateSet = fight.isFinal
      ? "final"
      : fight.isThirdPlace
        ? "thirdPlace"
        : "faceOff";
    const lines = [
      this.line(
        `faceoff:${id}`,
        fight.isFinal ? "final" : fight.isThirdPlace ? "thirdPlace" : "faceOff",
        {
          sets: [set],
          vars: { a: fight.a.name, b: fight.b.name, arena: getArena(fight.arena).spokenName },
        },
      ),
    ];
    (["A", "B"] as const).forEach((side, index) => {
      const walkOn = fight.walkOn?.[index];
      if (!walkOn) return;
      lines.push(
        this.line(
          `walkon:${id}:${side}`,
          "walkOn",
          { pool: [walkOn], sets: [], vars: {} },
          { side },
        ),
      );
    });
    return lines.filter((line): line is VoiceLine => line !== null);
  }

  /**
   * The fight's opening call ("Fight!"). It does not depend on the outcome,
   * so the stage can hand it to the narrator at the face-off as a prefetch
   * and its voice is ready the moment the fight starts; the fight's plan
   * reuses this exact line (same key, same text).
   */
  fightStart(fight: Pick<VoiceFight, "round" | "step">): VoiceLine | null {
    const line = this.line(
      `fight:${fight.round}:${fight.step}:start`,
      "start",
      { sets: ["start"], vars: {} },
      { priority: PRIORITY.start },
    );
    return line && { ...line, atMs: 0 };
  }

  /**
   * The fight's narration, planned up front from its event log (known when
   * FIGHT starts), each line timed to its event. Higher-priority beats win;
   * spoken lines are at least FIGHT_SPEECH_GAP_MS apart (the opening bark only
   * as long as it takes to say) and never overlap; a beat that loses its slot
   * can still be a caption if there is room, and a few beats (the first
   * contact, an edge, a showboat) may slide a little later to find one.
   */
  fight(fight: VoiceFight, events: readonly FightEvent[]): VoiceLine[] {
    const planKey = `fight:${fight.round}:${fight.step}`;
    const cached = this.plans.get(planKey);
    if (cached) return cached;

    const beats = fightBeats(fight, events);
    const order = beats
      .map((beat, index) => ({ beat, index }))
      .sort(
        (p, q) => q.beat.priority - p.beat.priority || p.beat.at - q.beat.at || p.index - q.index,
      );
    const accepted: Array<{
      at: number;
      end: number;
      speak: boolean;
      line: VoiceLine;
      index: number;
    }> = [];
    const taken = new Map<VoiceBeat, number>();
    const lastEvent = events.at(-1)?.t ?? Infinity;

    for (const { beat, index } of order) {
      const cap = MAX_PER_FIGHT[beat.beat];
      if (cap !== undefined && (taken.get(beat.beat) ?? 0) >= cap) continue;
      const opening = beat.beat === "start" ? this.fightStart(fight) : null;
      const text = opening ? opening.text : this.pick(beat.choice);
      if (!text) continue;
      const span = opening
        ? speechMs(text) + FIGHT_BARK_TAIL_MS
        : Math.max(FIGHT_SPEECH_GAP_MS, speechMs(text));
      const clearOfSpeech = (at: number) =>
        accepted.every(
          (other) => !other.speak || (at >= other.at ? at >= other.end : other.at >= at + span),
        );
      const clearOfCaptions = (at: number) =>
        accepted.every((other) => Math.abs(other.at - at) >= FIGHT_CAPTION_GAP_MS);
      // On time if possible; a beat with slack may slide to just after a line in its way.
      const times = [beat.at];
      if (beat.slack) {
        for (const other of accepted) {
          for (const at of [other.end, other.at + FIGHT_CAPTION_GAP_MS]) {
            if (at > beat.at && at <= beat.at + beat.slack && at <= lastEvent) times.push(at);
          }
        }
        times.sort((p, q) => p - q);
      }
      const spread = (time: number) =>
        cap === undefined ||
        accepted.every(
          (other) => other.line.beat !== beat.beat || Math.abs(other.at - time) >= SAME_BEAT_GAP_MS,
        );
      let at = times.find((time) => spread(time) && clearOfSpeech(time) && clearOfCaptions(time));
      const speak = at !== undefined;
      if (at === undefined && beat.captionable)
        at = times.find((time) => spread(time) && clearOfCaptions(time));
      if (at === undefined) continue;
      if (!opening) this.commit(text, beat.choice.sets);
      taken.set(beat.beat, (taken.get(beat.beat) ?? 0) + 1);
      accepted.push({
        at,
        end: at + span,
        speak,
        index,
        line: {
          key: opening ? opening.key : `${planKey}:${index}`,
          text,
          speak,
          priority: beat.priority,
          beat: beat.beat,
          ...(beat.side ? { side: beat.side } : {}),
          atMs: at,
        },
      });
    }

    const plan = accepted
      .sort((p, q) => p.at - q.at || p.index - q.index)
      .map((entry) => entry.line);
    this.plans.set(planKey, plan);
    return plan;
  }

  /** The result: the winner's pool line, the loser's, or a template for the method. */
  result(
    fight: VoiceFight,
    outcome: { winner: Side; method: FightMethod },
    record?: { winsBefore: number; lossesBefore: number },
  ): VoiceLine | null {
    const winner = outcome.winner === "A" ? fight.a : fight.b;
    const loser = outcome.winner === "A" ? fight.b : fight.a;
    const wins = record?.winsBefore ?? 0;
    const losses = record?.lossesBefore ?? 0;
    return this.line(
      `result:${fight.round}:${fight.step}`,
      "result",
      {
        pool: [winner.narration.win[wins], loser.narration.lose[losses]],
        sets: [RESULT_SET[outcome.method], "result"],
        vars: fighterVars(winner, loser, fight.step),
      },
      { side: outcome.winner },
    );
  }

  /** Between rounds: who leads (a player's name), or null for a dead heat. */
  standings(round: number, leader: string | null): VoiceLine | null {
    return this.line(`standings:${round}`, "standings", {
      sets: leader ? ["standings"] : ["standingsTie"],
      vars: { leader, n: ROUND_WORDS[round] ?? String(round) },
    });
  }

  /** The upgrade phase opens. */
  upgrade(round: number): VoiceLine | null {
    return this.line(`upgrade:${round}`, "upgrade", {
      sets: ["upgrade"],
      vars: { n: ROUND_WORDS[round] ?? String(round) },
    });
  }

  /** The podium, read third to first, then the champion's own victory line. */
  podium(first: VoiceFighter, second: VoiceFighter, third?: VoiceFighter): VoiceLine[] {
    return [
      third
        ? this.line("podium:3", "podium", { sets: ["podiumThird"], vars: { x: third.name } })
        : null,
      this.line("podium:2", "podium", { sets: ["podiumSecond"], vars: { x: second.name } }),
      this.line("podium:1", "podium", { sets: ["podiumFirst"], vars: { x: first.name } }),
      this.line(
        "podium:1:pool",
        "podium",
        { pool: [first.narration.win[1], first.narration.win[0]], sets: [], vars: {} },
        { priority: PRIORITY.roster },
      ),
    ].filter((line): line is VoiceLine => line !== null);
  }
}

// ---------------------------------------------------------------------------
// Fight beats
// ---------------------------------------------------------------------------

export interface FightBeat {
  at: number;
  beat: VoiceBeat;
  priority: number;
  side?: Side;
  choice: Choice;
  /** Whether a beat that loses its spoken slot may still show as a caption. */
  captionable: boolean;
  /** How much later (ms) the line may land to find room; 0 means on its moment or not at all. */
  slack: number;
}

/** Lines land just after their event: after the hit stop, or after the drop and its landing. */
const LEAD_MS: Partial<Record<VoiceBeat, number>> = {
  bigHit: 250,
  miracle: 250,
  counter: 150,
  // A broken Trick is called after the hit that broke it lands.
  broken: 250,
  throw: 300,
  ko: 700,
  ringOut: 1_000,
};

/** Lines per fight by beat, counted as they are placed (so a capped beat that loses its slot leaves room for a later one). */
const MAX_PER_FIGHT: Partial<Record<VoiceBeat, number>> = {
  miracle: 2,
  edge: 2,
  throw: 3,
  counter: 2,
  whiff: 2,
  showboat: 1,
  selfDamage: 1,
  immune: 1,
  slipped: 1,
  broken: 1,
};

/** Capped beats also keep this far apart, so their few lines spread over the fight. */
const SAME_BEAT_GAP_MS = 4_000;

/** States that last a moment, so their line can come a beat late. */
const SLACK_MS: Partial<Record<VoiceBeat, number>> = {
  firstContact: 1_500,
  edge: 700,
  showboat: 700,
};

const FIRST_TOUCH: ReadonlySet<FightEvent["kind"]> = new Set(["contact", "hit", "grab", "throw"]);

/** Every narratable beat in a fight's event log, with its candidates and priority. */
export function fightBeats(fight: VoiceFight, events: readonly FightEvent[]): FightBeat[] {
  const of = (side: Side) => (side === "A" ? fight.a : fight.b);
  const other = (side: Side): Side => (side === "A" ? "B" : "A");
  const appearance = fight.appearance ?? { A: 0, B: 0 };
  const beats: FightBeat[] = [];
  let contact = false;
  /** This event is the first touch and is narrated as itself: it carries the first contact's weight. */
  let firstTouch = false;
  let ordinal = 0;

  const add = (
    t: number,
    beat: VoiceBeat,
    side: Side | undefined,
    choice: Choice,
    captionable = true,
  ) => {
    const priority = PRIORITY[beat as keyof typeof PRIORITY] ?? PRIORITY.whiff;
    const slack = SLACK_MS[beat] ?? 0;
    beats.push({
      at: t + (LEAD_MS[beat] ?? 0),
      beat,
      priority: firstTouch ? Math.max(priority, PRIORITY.firstContact) : priority,
      ...(side ? { side } : {}),
      choice,
      captionable,
      slack: firstTouch ? Math.max(slack, SLACK_MS.firstContact ?? 0) : slack,
    });
  };
  const rotate = (lines: readonly string[], turn: number) =>
    lines.length ? lines[turn % lines.length] : null;

  const pair = (side: Side, extra: Vars = {}): Vars => ({
    ...fighterVars(of(side), of(other(side)), ordinal),
    drop: DROP_BY_ARENA[fight.arena],
    ...extra,
  });
  const moveName = (side: Side, move: number) => of(side).moves[move]?.name ?? null;

  for (const event of events) {
    ordinal += 1;
    // The first touch of any kind is the first contact (some fights land a hit
    // before their first "contact" event). A first touch that is a beat of its
    // own (a big hit, a throw) is called as that beat, with the first contact's
    // priority, instead of a generic "First contact!".
    firstTouch = false;
    if (!contact && FIRST_TOUCH.has(event.kind)) {
      contact = true;
      const ownBeat =
        event.kind === "throw" || (event.kind === "hit" && (event.big || event.miracle));
      if (ownBeat) firstTouch = true;
      else
        add(event.t, "firstContact", undefined, {
          sets: ["firstContact"],
          vars: { a: fight.a.name, b: fight.b.name },
        });
    }
    switch (event.kind) {
      case "start":
        add(event.t, "start", undefined, { sets: ["start"], vars: {} }, false);
        break;
      case "hit": {
        if (!event.big && !event.miracle) break;
        const attacker = of(event.side);
        const target = of(other(event.side));
        const vars = pair(event.side, { move: moveName(event.side, event.move) });
        if (event.miracle)
          add(event.t, "miracle", event.side, { sets: ["miracle", "bigHit"], vars });
        else if (event.counter)
          add(event.t, "counter", event.side, { sets: ["counter", "bigHit"], vars });
        else {
          // The champions' own lines first: the hitter's landHit, else the target's
          // takeHit (rotated by appearance). A pool line is said once a game, so
          // whichever big hits get narrated use them up first, then templates.
          const pool = [
            rotate(attacker.narration.landHit, appearance[event.side]),
            rotate(target.narration.takeHit, appearance[other(event.side)]),
          ];
          add(event.t, "bigHit", event.side, { pool, sets: ["bigHit"], vars });
        }
        break;
      }
      case "throw":
        add(event.t, "throw", event.side, {
          sets: ["throw"],
          vars: pair(event.side, { move: moveName(event.side, event.move) }),
        });
        break;
      case "whiff":
        if (event.reason === "immune") {
          add(event.t, "immune", event.side, { sets: ["immune"], vars: pair(event.side) });
        } else if (event.reason === "slipped") {
          // A slither wriggled out of the grab: about the grabber and the escape.
          add(event.t, "slipped", event.side, { sets: ["slipped"], vars: pair(event.side) });
        } else if (event.reason === "broken") {
          // The side is the Trick's owner; the Strike that broke it is its own beat.
          add(event.t, "broken", event.side, {
            sets: ["broken"],
            vars: pair(event.side, { move: moveName(event.side, event.move) }),
          });
        } else if (event.reason === "dodged" || event.reason === "miss") {
          add(event.t, "whiff", event.side, {
            sets: ["whiff"],
            vars: pair(event.side, { move: moveName(event.side, event.move) }),
          });
        }
        break;
      case "edge":
        add(event.t, "edge", event.side, { sets: ["edge"], vars: pair(event.side) });
        break;
      case "ringout": {
        const victim = of(event.side);
        add(
          event.t,
          "ringOut",
          event.side,
          {
            pool: [rotate(victim.narration.ringOut, appearance[event.side])],
            sets: [RING_OUT_SET[fight.arena], "ringOut"],
            vars: pair(event.side),
          },
          false,
        );
        break;
      }
      case "ko":
        add(event.t, "ko", event.side, { sets: ["ko"], vars: pair(event.side) }, false);
        break;
      case "selfDamage":
        add(event.t, "selfDamage", event.side, { sets: ["selfDamage"], vars: pair(event.side) });
        break;
      case "showboat":
        add(event.t, "showboat", event.side, { sets: ["showboat"], vars: pair(event.side) });
        break;
      case "finale":
        add(event.t, "finale", undefined, {
          sets: [FINALE_SET[fight.arena]],
          vars: { a: fight.a.name, b: fight.b.name },
        });
        break;
      case "suddenDeath":
        add(event.t, "suddenDeath", undefined, { sets: ["suddenDeath"], vars: {} }, false);
        break;
      case "timeout":
        add(event.t, "timeout", undefined, { sets: ["timeout"], vars: {} }, false);
        break;
      default:
        break;
    }
  }
  return beats;
}
