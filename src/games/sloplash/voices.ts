export interface NarratorVoice {
  id: string;
  name: string;
  trait: string;
  description: string;
}

export const NARRATOR_VOICES: NarratorVoice[] = [
  { id: "alloy", name: "Alloy", trait: "Versatile", description: "Balanced and adaptable" },
  { id: "echo", name: "Echo", trait: "Smooth", description: "Steady and conversational" },
  {
    id: "fable",
    name: "Fable",
    trait: "Expressive",
    description: "Animated storytelling delivery",
  },
  { id: "onyx", name: "Onyx", trait: "Deep", description: "Rich and authoritative" },
  { id: "nova", name: "Nova", trait: "Warm", description: "Friendly and energetic" },
  { id: "shimmer", name: "Shimmer", trait: "Clear", description: "Bright and crisp" },
];

export const VOICE_IDS = NARRATOR_VOICES.map((voice) => voice.id);

export function getNarratorVoice(voiceId: string): NarratorVoice | undefined {
  return NARRATOR_VOICES.find((voice) => voice.id === voiceId);
}

/** Resolves the Random option once per game without persisting another field. */
export function pickVoiceForSeed(seed: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return NARRATOR_VOICES[(hash >>> 0) % NARRATOR_VOICES.length].id;
}
