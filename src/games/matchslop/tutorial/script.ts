import type { TutorialScript } from "@/tutorial/timeline";

/**
 * The MatchSlop how-to-play: a voice note from the match's best friend, who
 * has heard everyone matched at once and is vetting the group before anyone
 * texts. The date's gender is the host's choice, so she says "my friend" and
 * "they". Line ids are what the scene keys its beats on; rewording a line
 * keeps its id.
 */
export const script: TutorialScript = {
  lead: 2.4,
  lines: [
    {
      id: "intro",
      say: "[warmly] Hi. I'm their best friend. And I hear my friend matched with... all of you. At once.",
    },
    { id: "vet", say: "[sighs] Fine. Before anyone texts them, here's how this works." },
    { id: "profile", say: "This is their profile. Read it. Learn it. Love it." },
    { id: "write", chapter: "Write", say: "Every round, each of you writes a text on your phone." },
    {
      id: "opener",
      say: "Round one, you open with something from their profile. After that, you're replying to whatever they just said.",
    },
    {
      id: "vote",
      chapter: "Vote",
      say: "But they only get one text. So you all vote on which one to send.",
    },
    {
      id: "double",
      say: "Human votes count double. [deadpan] And no, you can't vote for your own.",
    },
    {
      id: "react",
      chapter: "Mood",
      say: "Then my friend reads it, and reacts. [teasing] Great... good... cute... meh... cringe... [gasps] or dealbreaker.",
    },
    { id: "meter", say: "Every reaction moves their mood." },
    { id: "date", say: "[excited] Get it up to eighty, and it's a date!" },
    {
      id: "unmatch",
      say: "Let it drop to twenty, and they unmatch... unless your next text wins them back.",
    },
    {
      id: "points",
      chapter: "Score",
      say: "Every vote for your text earns you points. Get it sent, and you score the reaction too. [laughs] Good or bad.",
    },
    {
      id: "outro",
      say: "Five rounds. I'll be watching. [whispers] And please... don't be weird.",
    },
  ],
  tail: 2.6,
};
