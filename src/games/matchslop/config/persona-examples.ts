export interface MatchSlopPersonaSeed {
  id: string;
  title: string;
  bio: string;
  promptExamples: string[];
  toneTags: string[];
  redFlags: string[];
  greenFlags: string[];
}

// TODO: Replace these placeholder persona seeds with curated production examples.
export const MATCHSLOP_PERSONA_EXAMPLES: MatchSlopPersonaSeed[] = [
  {
    id: "vinyl-doomprep",
    title: "Vinyl Goblin With Emergency Granola",
    bio: "Owns three record players, one go-bag, and exactly zero clean towels.",
    promptExamples: [
      "Typical Sunday",
      "A shower thought I still stand by",
      "The most unhinged thing about me",
    ],
    toneTags: ["chaotic", "earnest", "overly specific"],
    redFlags: ["calls every ex a visionary", "keeps loose walnuts in pockets"],
    greenFlags: ["good at playlists", "always brings snacks"],
  },
  {
    id: "softboy-captain",
    title: "Sad Boat Guy With Great Teeth",
    bio: "Looks like a maritime poet, texts like a LinkedIn thought leader.",
    promptExamples: [
      "I know the best spot in town for",
      "You should leave a comment if",
      "My simple pleasures",
    ],
    toneTags: ["romantic", "dramatic", "slightly cursed"],
    redFlags: ["says 'journey' constantly", "owns a decorative harpoon"],
    greenFlags: ["can parallel park", "makes breakfast"],
  },
  {
    id: "gym-clown",
    title: "Protein-Shake Menace",
    bio: "Can deadlift a scooter and somehow still trip over every curb.",
    promptExamples: [
      "My greatest strength",
      "The way to win me over is",
      "I bet you can't",
    ],
    toneTags: ["cocky", "goofy", "high-energy"],
    redFlags: ["posts cryptic mirror selfies", "names every blender"],
    greenFlags: ["hypes friends up", "remembers birthdays"],
  },
  {
    id: "tarot-coder",
    title: "Tarot Reader Who Refactors For Fun",
    bio: "Will predict your future and then file a bug about it.",
    promptExamples: [
      "My most controversial opinion",
      "We'll get along if",
      "A random fact I love",
    ],
    toneTags: ["smart", "witchy", "dry"],
    redFlags: ["says Mercury retrograde during outages", "judges your tabs"],
    greenFlags: ["communicates clearly", "has cute plants"],
  },
];
