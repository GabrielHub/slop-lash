// A fight's stored event log as readable lines (the recap without WebGL, and
// anything else that wants the story in words): hits with their move and
// damage, the edge, ring-outs, KOs, sudden death and the finish. Pure
// TypeScript with type-only imports, so the DOM fallback never pulls in
// three.js or the sim.

import type { Champion } from "../../sheet";
import type { FightEvent, FightMethod, Side } from "../../sim";

export type LogTone = "hit" | "big" | "edge" | "ringout" | "ko" | "end" | "info";

export interface LogLine {
  /** Sim time, ms. */
  t: number;
  /** "0:03.2" */
  time: string;
  text: string;
  tone: LogTone;
}

const METHOD_WORDS: Record<FightMethod, string> = {
  KO: "knockout",
  RINGOUT: "ring out",
  DECISION: "decision",
  SUDDEN_DEATH: "sudden death",
};

export function methodWords(method: FightMethod): string {
  return METHOD_WORDS[method];
}

/** m:ss.t from sim milliseconds. */
export function formatFightTime(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

const other = (side: Side): Side => (side === "A" ? "B" : "A");

/** Readable lines for the beats a viewer cares about (windups, whiffs and getups are left out). */
export function readableEventLog(
  events: readonly FightEvent[],
  sheets: { A: Pick<Champion, "name" | "moves"> | null; B: Pick<Champion, "name" | "moves"> | null },
): LogLine[] {
  const name = (side: Side) => sheets[side]?.name ?? (side === "A" ? "Fighter A" : "Fighter B");
  const move = (side: Side, index: number) => sheets[side]?.moves[index]?.name ?? "a move";
  const lines: LogLine[] = [];
  const push = (t: number, text: string, tone: LogTone) => lines.push({ t, time: formatFightTime(t), text, tone });
  let contact = false;
  for (const event of events) {
    switch (event.kind) {
      case "contact":
        if (!contact) push(event.t, "First contact", "info");
        contact = true;
        break;
      case "hit": {
        if (event.damage <= 0) break;
        const extras = [event.counter ? "a counter" : null, event.miracle ? "a miracle" : null, event.big ? "big hit" : null].filter(Boolean);
        const tail = extras.length > 0 ? ` (${extras.join(", ")})` : "";
        push(event.t, `${name(event.side)} hits ${name(other(event.side))} with ${move(event.side, event.move)} for ${Math.round(event.damage)}${tail}`, event.big ? "big" : "hit");
        break;
      }
      case "throw":
        if (event.damage <= 0) break;
        push(event.t, `${name(event.side)} throws ${name(other(event.side))} with ${move(event.side, event.move)} for ${Math.round(event.damage)}`, "big");
        break;
      case "dodge":
        push(event.t, `${name(event.side)} dodges`, "info");
        break;
      case "selfDamage":
        if (event.damage > 0) push(event.t, `${name(event.side)} hurts itself for ${Math.round(event.damage)}`, "hit");
        break;
      case "showboat":
        push(event.t, `${name(event.side)} showboats`, "info");
        break;
      case "edge":
        push(event.t, `${name(event.side)} is on the edge`, "edge");
        break;
      case "ringout":
        push(event.t, `${name(event.side)} is rung out`, "ringout");
        break;
      case "ko":
        push(event.t, `${name(event.side)} is knocked out`, "ko");
        break;
      case "suddenDeath":
        push(event.t, "Sudden death: next hit wins", "info");
        break;
      case "timeout":
        push(event.t, "Time! The judges decide", "info");
        break;
      case "end":
        push(event.t, `${name(event.side)} wins by ${METHOD_WORDS[event.method]}`, "end");
        break;
      default:
        break;
    }
  }
  return lines;
}
