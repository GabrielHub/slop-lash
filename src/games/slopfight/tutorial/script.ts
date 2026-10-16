import type { TutorialScript } from "@/tutorial/timeline";

/**
 * The SlopFight how-to-play: a fight-night promo, read by The Voice, the
 * game's deadpan prizefight announcer, who is fond of everyone. Line ids are
 * what the scene keys its beats on; rewording a line keeps its id.
 */
export const script: TutorialScript = {
  lead: 2.6,
  lines: [
    {
      id: "intro",
      say: "[deadpan] Tonight. Live from this living room. Four champions. One trophy. Ladies and gentlemen... this is SlopFight.",
    },
    {
      id: "build",
      chapter: "Build",
      say: "Every champion starts on your phone. Draw it, or just describe it.",
    },
    {
      id: "ideas",
      say: "A shark in a tuxedo. A toaster with anger issues. [deadpan] We don't judge.",
    },
    {
      id: "foundry",
      say: "Send it to the Foundry, and it comes back a real fighter. A name, a body, and three moves.",
    },
    {
      id: "stats",
      say: "Big ones hit hard. Long ones reach far. Chaotic ones... do whatever they want.",
    },
    {
      id: "fight",
      chapter: "Fight",
      say: "Three arenas. Six fights. Short on fighters? The house brings its own.",
    },
    {
      id: "bet",
      say: "Before every fight, bet on who wins. During the fight, smash the hype button. [deadpan] It doesn't help. It feels amazing.",
    },
    { id: "finish", say: "Knock them out, or knock them off the edge, for bonus points." },
    {
      id: "upgrade",
      chapter: "Upgrade",
      say: "Between rounds, add one thing. A hat. A jetpack. A second head.",
    },
    {
      id: "win",
      chapter: "Win",
      say: "Win the final, and you are the champion. Everyone else... [warmly] we are very proud of you.",
    },
    { id: "outro", say: "[shouting] Now get drawing!" },
  ],
  tail: 2.6,
};
