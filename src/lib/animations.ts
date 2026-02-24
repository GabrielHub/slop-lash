import type { Transition, Variants } from "motion/react";

// --- Transition Presets ---

export const springDefault: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

export const springGentle: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 25,
};

export const springBouncy: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 15,
};

export const tweenFade: Transition = {
  duration: 0.3,
  ease: "easeOut",
};

// --- Variant Sets ---

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: springDefault },
  exit: { opacity: 0, y: -8, transition: tweenFade },
};

export const floatIn: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springGentle },
  exit: { opacity: 0, y: -10, scale: 0.98, transition: tweenFade },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: springDefault },
  exit: { opacity: 0, scale: 0.96, transition: tweenFade },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: springBouncy },
  exit: { opacity: 0, scale: 0.8, transition: tweenFade },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: springDefault },
  exit: { opacity: 0, x: -20, transition: tweenFade },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: springDefault },
  exit: { opacity: 0, x: 20, transition: tweenFade },
};

export const phaseTransition: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 350, damping: 28 },
  },
  exit: { opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.2 } },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

// --- Collapse/Expand ---

export const collapseExpand: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto", transition: { duration: 0.2 } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2 } },
};

// --- Interactive Presets ---

export const buttonTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: springDefault,
} as const;

export const buttonTapPrimary = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.97 },
  transition: springDefault,
} as const;

export const voteCardTap = {
  whileHover: { scale: 1.015, y: -2 },
  whileTap: { scale: 0.985 },
  transition: springDefault,
} as const;
