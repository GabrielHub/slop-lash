const PROMPT_BANK: string[] = [
  "The worst thing to say on a first date",
  "A terrible name for a pet goldfish",
  "Something you'd never want to hear your dentist say",
  "The worst superpower to have",
  "A bad reason to call 911",
  "Something you shouldn't yell in a library",
  "The worst flavor of ice cream",
  "A terrible motto for a dating app",
  "Something that would make a bad password",
  "The worst thing to put on a resume",
  "A bad name for a children's TV show",
  "Something you'd never want your parents to find",
  "The worst thing to whisper to someone",
  "A terrible name for a band",
  "Something you shouldn't do at a funeral",
  "The worst advice you could give a teenager",
  "A bad slogan for a restaurant",
  "Something that would ruin a wedding",
  "The worst thing to find in your soup",
  "A terrible excuse for being late",
  "Something you shouldn't put in a time capsule",
  "The worst pickup line ever",
  "A bad theme for a birthday party",
  "Something you'd never want to hear from your pilot",
  "The worst gift to give your boss",
  "A terrible name for a hospital",
  "Something you shouldn't do in an elevator",
  "The worst thing to write in a greeting card",
  "A bad idea for a new Olympic sport",
  "Something that would make a terrible alarm sound",
  "The worst thing to say during a job interview",
  "A terrible invention nobody asked for",
  "Something you shouldn't bring to a potluck",
  "The worst life hack ever",
  "A bad name for a self-help book",
  "Something you'd never want your neighbor to see",
  "The worst thing to automate with AI",
  "A terrible prompt for an AI to answer",
  "Something you shouldn't say to your Uber driver",
  "The worst thing to 3D print",
  "A bad idea for a mobile app",
  "Something you shouldn't put on a billboard",
  "The worst thing to bring to show and tell",
  "A terrible name for a yoga pose",
  "Something that would make a bad national anthem",
  "The worst thing to find in your pocket",
  "A bad reason to break up with someone",
  "Something you shouldn't do during a Zoom meeting",
  "The worst thing to say when meeting the President",
  "A terrible fortune cookie message",
  "Something you'd never want to see on a menu",
  "The worst thing to say while getting a tattoo",
  "A bad name for a perfume",
  "Something you shouldn't do at a theme park",
  "The worst thing to accidentally send to your boss",
  "A terrible name for a superhero",
  "Something you shouldn't bring on an airplane",
  "The worst thing to say to your hairdresser",
  "A bad idea for a reality TV show",
];

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getRandomPrompts(count: number): string[] {
  return shuffle(PROMPT_BANK).slice(0, count);
}
