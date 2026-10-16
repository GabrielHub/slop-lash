import type { TutorialLive } from "@/tutorial/live";
import type { TutorialEntry } from "@/tutorial/spec";
import { cuesFor } from "@/tutorial/timeline";

const NAMES = ["Riley", "Dev", "Quinn", "Noor", "Kai", "Lena", "Theo"];

/**
 * A pretend lobby for `?live=N`: N players (the last one an AI), whose
 * practice answers lock in one by one through the answer window, and one of
 * whom never answers. It previews a scene's live path without a room.
 */
export function livePreview(entry: TutorialEntry, count: number, t: number): TutorialLive {
  const size = Math.min(Math.max(count, 1), NAMES.length + 1);
  const practice = entry.practice;
  const opens = practice ? cuesFor(entry.timing).word(practice.opens.line, practice.opens.word) : 0;
  const players = Array.from({ length: size }, (_, index) => {
    const isAi = size > 1 && index === size - 1;
    const silent = size >= 4 && index === size - 2;
    const choice =
      practice && index % 3 === 2
        ? (practice.answer + 2) % practice.choices.length
        : (practice?.answer ?? 0);
    const locked = practice !== undefined && !isAi && !silent && t >= opens + 0.9 + index * 1.1;
    return {
      id: `preview-${index}`,
      name: isAi ? "Haiku" : NAMES[index],
      isAi,
      pick: locked ? choice : null,
    };
  });
  return { players };
}
