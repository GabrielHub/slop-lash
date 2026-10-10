// The fight scenes' bridge to The Voice (ui3d/voice.ts on `services.voice`):
// build the VoiceFight the narration reads from the feed.

import { toVoiceFighter, type VoiceFight } from "../../narration";
import type { StageServices } from "../services";
import type { VoiceService } from "../ui3d/voice";
import { ownersOf, playerName, sheetsOf, type FightFeed, type FightRow } from "./feed";

export function voiceOf(services: StageServices): VoiceService {
  return services.voice;
}

/** The fight as The Voice reads it (null until both champions are known). */
export function voiceFightOf(feed: FightFeed, fight: FightRow): VoiceFight | null {
  const sheets = sheetsOf(feed, fight);
  if (!sheets.A || !sheets.B) return null;
  const owners = ownersOf(feed, fight);
  const index = feed.fights.findIndex((other) => other.id === fight.id);
  const before = index >= 0 ? feed.fights.slice(0, index) : [];
  const appearances = (id: string) => before.filter((other) => other.a === id || other.b === id).length;
  return {
    round: fight.round,
    step: fight.step,
    arena: fight.arena,
    a: toVoiceFighter(sheets.A, playerName(feed, owners.A)),
    b: toVoiceFighter(sheets.B, playerName(feed, owners.B)),
    appearance: { A: appearances(fight.a), B: appearances(fight.b) },
    walkOn: fight.walkOn ?? undefined,
    isFinal: fight.isFinal,
    isThirdPlace: fight.isThirdPlace,
  };
}
