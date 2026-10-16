import type { GameType } from "@/games/core/types";
import { script as matchslopScript } from "@/games/matchslop/tutorial/script";
import { timing as matchslopTiming } from "@/games/matchslop/tutorial/timing";
import { practice as quizslopPractice } from "@/games/quizslop/tutorial/practice";
import { script as quizslopScript } from "@/games/quizslop/tutorial/script";
import { timing as quizslopTiming } from "@/games/quizslop/tutorial/timing";
import { script as slopfightScript } from "@/games/slopfight/tutorial/script";
import { timing as slopfightTiming } from "@/games/slopfight/tutorial/timing";
import { script as sloplashScript } from "@/games/sloplash/tutorial/script";
import { timing as sloplashTiming } from "@/games/sloplash/tutorial/timing";
import type { TutorialEntry } from "./spec";

/**
 * Every game's tutorial. Scripts and timings are small and load anywhere (a
 * phone shows the chapters and captions); scenes load only where they draw.
 */
export const TUTORIALS: Record<GameType, TutorialEntry> = {
  SLOPLASH: {
    game: "SLOPLASH",
    ambient: "pixels",
    script: sloplashScript,
    timing: sloplashTiming,
    load: () => import("@/games/sloplash/tutorial/scene").then((module) => module.scene),
  },
  MATCHSLOP: {
    game: "MATCHSLOP",
    ambient: "bubbles",
    script: matchslopScript,
    timing: matchslopTiming,
    load: () => import("@/games/matchslop/tutorial/scene").then((module) => module.scene),
  },
  QUIZSLOP: {
    game: "QUIZSLOP",
    ambient: "confetti",
    script: quizslopScript,
    timing: quizslopTiming,
    practice: quizslopPractice,
    load: () => import("@/games/quizslop/tutorial/scene").then((module) => module.scene),
  },
  SLOPFIGHT: {
    game: "SLOPFIGHT",
    ambient: "confetti",
    script: slopfightScript,
    timing: slopfightTiming,
    load: () => import("@/games/slopfight/tutorial/scene").then((module) => module.scene),
  },
};
