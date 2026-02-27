export interface GeminiVoice {
  name: string;
  gender: "female" | "male";
  trait: string;
  description: string;
}

export const GEMINI_VOICES: GeminiVoice[] = [
  // Female voices
  { name: "Zephyr", gender: "female", trait: "Bright", description: "Cheerful and radiant, positive energy" },
  { name: "Kore", gender: "female", trait: "Firm", description: "Confident and commanding" },
  { name: "Aoede", gender: "female", trait: "Breezy", description: "Relaxed and natural delivery" },
  { name: "Leda", gender: "female", trait: "Youthful", description: "Energetic, full of vitality" },
  { name: "Autonoe", gender: "female", trait: "Bright", description: "Expressive with a lively presence" },
  { name: "Callirrhoe", gender: "female", trait: "Easy-going", description: "Relaxed, conversational tone" },
  { name: "Despina", gender: "female", trait: "Smooth", description: "Polished and flowing" },
  { name: "Erinome", gender: "female", trait: "Clear", description: "Precise, crisp enunciation" },
  { name: "Laomedeia", gender: "female", trait: "Upbeat", description: "Enthusiastic and cheerful" },
  { name: "Achernar", gender: "female", trait: "Soft", description: "Gentle with a soothing cadence" },
  { name: "Gacrux", gender: "female", trait: "Mature", description: "Composed and distinguished" },
  { name: "Pulcherrima", gender: "female", trait: "Forward", description: "Direct and bold delivery" },
  { name: "Vindemiatrix", gender: "female", trait: "Gentle", description: "Warm and calming" },
  { name: "Sulafat", gender: "female", trait: "Warm", description: "Inviting and friendly" },

  // Male voices
  { name: "Puck", gender: "male", trait: "Upbeat", description: "Playful with game-show energy" },
  { name: "Charon", gender: "male", trait: "Informative", description: "Steady, clear narrator" },
  { name: "Fenrir", gender: "male", trait: "Excitable", description: "Dynamic and high energy" },
  { name: "Orus", gender: "male", trait: "Firm", description: "Authoritative, strong presence" },
  { name: "Enceladus", gender: "male", trait: "Breathy", description: "Intimate and soft-spoken" },
  { name: "Iapetus", gender: "male", trait: "Clear", description: "Articulate, clean delivery" },
  { name: "Umbriel", gender: "male", trait: "Easy-going", description: "Chill, laid-back tone" },
  { name: "Algieba", gender: "male", trait: "Smooth", description: "Rich and velvety" },
  { name: "Algenib", gender: "male", trait: "Gravelly", description: "Rugged, textured voice" },
  { name: "Rasalgethi", gender: "male", trait: "Informative", description: "Measured, thoughtful pace" },
  { name: "Alnilam", gender: "male", trait: "Firm", description: "Resolute and commanding" },
  { name: "Schedar", gender: "male", trait: "Even", description: "Balanced and steady" },
  { name: "Achird", gender: "male", trait: "Friendly", description: "Approachable, warm manner" },
  { name: "Zubenelgenubi", gender: "male", trait: "Casual", description: "Natural, everyday tone" },
  { name: "Sadachbia", gender: "male", trait: "Lively", description: "Animated and spirited" },
  { name: "Sadaltager", gender: "male", trait: "Knowledgeable", description: "Assured, expert tone" },
];

export const VOICE_NAMES = GEMINI_VOICES.map((v) => v.name);

/** Pick a random voice name. */
export function pickRandomVoice(): string {
  return GEMINI_VOICES[Math.floor(Math.random() * GEMINI_VOICES.length)].name;
}

