import { stableHash } from "../../lib/hash";

export interface NarratorVoice {
  id: string;
  name: string;
  trait: string;
  description: string;
}

export const NARRATOR_VOICES: NarratorVoice[] = [
  { id: "Kore", name: "Kore", trait: "Firm", description: "Confident and direct" },
  { id: "Puck", name: "Puck", trait: "Upbeat", description: "Bright and playful" },
  { id: "Charon", name: "Charon", trait: "Informative", description: "Clear and measured" },
  { id: "Fenrir", name: "Fenrir", trait: "Excitable", description: "Lively and enthusiastic" },
  { id: "Aoede", name: "Aoede", trait: "Breezy", description: "Relaxed and easygoing" },
  { id: "Sulafat", name: "Sulafat", trait: "Warm", description: "Friendly and inviting" },
];

export const VOICE_IDS = NARRATOR_VOICES.map((voice) => voice.id);

export function getNarratorVoice(voiceId: string): NarratorVoice | undefined {
  return NARRATOR_VOICES.find((voice) => voice.id === voiceId);
}

/** Resolves the Random option once per game without persisting another field. */
export function pickVoiceForSeed(seed: string): string {
  return NARRATOR_VOICES[stableHash(seed) % NARRATOR_VOICES.length].id;
}
