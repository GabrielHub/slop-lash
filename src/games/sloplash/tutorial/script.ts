import type { TutorialScript } from "@/tutorial/timeline";

/**
 * The SlopLash how-to-play voice-over: a fast, gleeful game-show MC. Line ids
 * are what the scene keys its beats on; rewording a line keeps its id.
 */
export const script: TutorialScript = {
  lead: 2.4,
  lines: [
    {
      id: "intro",
      say: "[excited] Welcome to SlopLash! The game where you and your friends try to out-funny the AI.",
    },
    { id: "robots", say: "Some of these players might be robots. [laughs] Don't let them win." },
    { id: "prompts", chapter: "Write", say: "Every round, your phone gets two prompts." },
    { id: "type", say: "Type the funniest answer you can think of, and hit Send." },
    { id: "short", say: "Keep it short. Eighty characters, tops.", pause: 0.3 },
    { id: "rival", say: "But somebody else got the same prompt... so make yours funnier." },
    {
      id: "faceoff",
      chapter: "Vote",
      say: "Then the answers go head to head, right here on the big screen.",
    },
    { id: "tap", say: "Everyone else votes for the one they like more. One tap. That's it." },
    { id: "self", say: "[deadpan] And no, you can't vote for yourself. Nice try." },
    { id: "react", say: "If something makes you laugh, throw it a reaction." },
    { id: "points", chapter: "Score", say: "Every vote you get is worth a hundred points." },
    { id: "sweep", say: "Sweep every vote, and you get a fifty percent bonus." },
    { id: "double", say: "And each round, the points double! So it's never too late." },
    {
      id: "outro",
      say: "Most points at the end wins. [excited] Grab your phones, and let's get sloppy!",
    },
  ],
  tail: 2.6,
};
