"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { AI_MODELS } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { GitHubIcon } from "@/components/icons";
import { ICON_BUTTON_CLASS, useTheme } from "@/components/theme-provider";
import { TopBar } from "@/components/top-bar";
import { enter, hoverLift, listParent, pop, press, STAGGER } from "@/lib/animations";
import { originOf, pulseAmbient } from "@/lib/ambient-events";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useWarpLink } from "@/components/warp-transition";

const MotionLink = motion.create(Link);

const GLOW_CLASSES = [
  "icon-glow-punch",
  "icon-glow-teal",
  "icon-glow-gold",
  "icon-glow-teal",
  "icon-glow-punch",
  "icon-glow-gold",
  "icon-glow-teal",
];

/** Desktop only: the AI players float around the edges, clear of the centre column. */
const ICON_POSITIONS = [
  { top: "12%", left: "10%", delay: 0 },
  { top: "15%", right: "8%", delay: 0.3 },
  { top: "34%", left: "4%", delay: 1.1 },
  { top: "44%", right: "4%", delay: 0.5 },
  { top: "56%", left: "7%", delay: 0.9 },
  { top: "68%", right: "10%", delay: 0.2 },
  { top: "78%", left: "12%", delay: 0.7 },
];

const TAGLINES = [
  "Party games where AI plays too.",
  "Friendslop for when you don't have friends.",
  "You will not be funnier than ChatGPT.",
  "Party games. Friends not required.",
  "Losing to a robot has never been this fun.",
  "The AI is funnier than you. Accept it.",
  "Your jokes are mid. The AI's are worse.",
  "Comedy night, but make it dystopian.",
  "You vs. seven chatbots. Good luck.",
  "Finally, games where everyone's humor is artificial.",
  "Turing test, but for comedy.",
  "The only game where lag makes the jokes better.",
  "Come for the laughs. Stay because you have no friends.",
];

/**
 * The demo card's prompts, picked by hand: a first-time visitor should get the
 * joke at a glance, and the home page doesn't ship the whole prompt bank.
 */
const DEMO_PROMPTS = [
  "The worst thing to accidentally say out loud on a first date",
  "A terrible way to start a best man speech",
  "The worst thing to list under 'Special Skills' on a resume",
  "The worst way to find out you've been fired",
  "A suspicious thing to be caught Googling by your partner",
  "The worst thing to accidentally project on screen during a work presentation",
  "The most passive-aggressive thing to write on a coworker's going-away card",
  "The loading screen tip that is just passive-aggressively judging you",
  "A Pokemon move that's actually just a war crime",
  "The worst possible answer to 'So, what do you do for a living?'",
];

/** The demo prompts in a fresh order each visit. */
function shuffledDemoPrompts() {
  const prompts = [...DEMO_PROMPTS];
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j]!, prompts[i]!];
  }
  return prompts;
}

/** The icons pop in one by one once the title has landed. */
const ICONS_ENTER = {
  hidden: {},
  visible: { transition: { delayChildren: 0.5, staggerChildren: STAGGER.cards } },
};

/** Filled on phones (Join) and desktops (Host); the other one is the outline. */
const FILLED = "bg-punch text-accent-ink border-punch shadow-[0_0_24px_-6px_var(--punch)]";
const OUTLINE = "bg-surface/50 text-ink border-edge hover:border-edge-strong";

export default function Home() {
  const { mounted } = useTheme();
  const { triggerElement } = usePixelDissolve();
  const warp = useWarpLink();
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [tagline] = useState(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);

  useEffect(() => {
    const prompts = shuffledDemoPrompts();
    let index = -1;

    const advance = () => {
      index = (index + 1) % prompts.length;
      setCurrentPrompt(prompts[index]);
    };

    const initialTimeout = setTimeout(advance, 0);
    const interval = setInterval(advance, 3500);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-svh flex flex-col relative overflow-hidden" data-warp-root>
      <TopBar
        actions={
          <a
            href="https://github.com/GabrielHub/slop-lash"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
            className={ICON_BUTTON_CLASS}
          >
            <GitHubIcon />
          </a>
        }
      />

      {mounted && (
        <motion.div
          className="absolute inset-0 hidden lg:block pointer-events-none"
          aria-hidden="true"
          variants={ICONS_ENTER}
          initial="hidden"
          animate="visible"
        >
          {AI_MODELS.map((model, i) => {
            const pos = ICON_POSITIONS[i];
            if (!pos) return null;
            return (
              <motion.div
                key={model.id}
                className={`absolute size-12 rounded-xl bg-surface/90 border border-edge/60 flex items-center justify-center animate-gentle-float pointer-events-auto cursor-pointer ${GLOW_CLASSES[i]}`}
                style={{
                  top: pos.top,
                  left: pos.left,
                  right: pos.right,
                  animationDelay: `${pos.delay}s`,
                }}
                variants={pop}
                data-warp-pull
                onClick={(e) => {
                  pulseAmbient({ kind: "cheer", origin: originOf(e.currentTarget) });
                  triggerElement(e.currentTarget);
                }}
              >
                <ModelIcon model={model} size={24} />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <motion.div
          className="text-center max-w-md w-full relative z-10"
          variants={listParent(5, STAGGER.cards)}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            className="font-display text-[3.25rem] leading-[0.95] sm:text-7xl font-extrabold tracking-tight text-punch title-glow"
            variants={enter}
            data-warp-fade
          >
            SLOPBOX
            <br />
            PARTY PACK
          </motion.h1>

          <motion.p
            className="mt-4 text-lg text-ink-dim font-medium text-balance"
            variants={enter}
            data-warp-fade
            suppressHydrationWarning
          >
            {tagline}
          </motion.p>

          <motion.div className="mt-8 mx-auto max-w-sm" variants={enter} data-warp-fade>
            <div className="relative bg-surface/70 border border-edge/70 rounded-2xl px-6 py-3 shadow-[0_0_24px_-6px_color-mix(in_srgb,var(--ink)_14%,transparent)]">
              <div className="h-[4.75rem] flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {currentPrompt && (
                    <motion.p
                      key={currentPrompt}
                      className="text-ink font-display font-bold text-lg leading-snug line-clamp-3 text-balance text-center"
                      variants={enter}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      &ldquo;{currentPrompt}&rdquo;
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 size-3.5 bg-surface/70 border-r border-b border-edge/70 rotate-45" />
            </div>
          </motion.div>

          <motion.div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4" variants={enter}>
            <MotionLink
              href="/host"
              onClick={warp}
              data-warp-fade
              className={`flex h-14 sm:h-16 items-center justify-center rounded-xl border-2 px-8 font-display text-xl font-bold transition-colors sm:flex-1 ${OUTLINE} sm:bg-punch sm:text-accent-ink sm:border-punch sm:shadow-[0_0_24px_-6px_var(--punch)] sm:hover:border-punch`}
              {...hoverLift}
            >
              Host a game
            </MotionLink>
            <MotionLink
              href="/join"
              onClick={warp}
              data-warp-fade
              className={`order-first sm:order-none flex h-14 sm:h-16 items-center justify-center rounded-xl border-2 px-8 font-display text-xl font-bold transition-colors sm:flex-1 ${FILLED} sm:bg-surface/50 sm:text-ink sm:border-edge sm:shadow-none sm:hover:border-edge-strong`}
              {...hoverLift}
            >
              Join a game
            </MotionLink>
          </motion.div>

          <motion.div className="mt-6" variants={enter}>
            <MotionLink
              href="/leaderboard"
              onClick={warp}
              data-warp-fade
              className="inline-flex h-11 items-center gap-2 px-3 text-sm text-ink-dim hover:text-ink transition-colors font-medium"
              {...press}
            >
              <span className="size-1.5 rounded-full bg-gold" />
              Leaderboard
            </MotionLink>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
