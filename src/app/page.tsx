"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { AI_MODELS } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { useTheme } from "@/components/theme-provider";
import { getRandomPrompts } from "@/lib/prompts";
import {
  staggerContainer,
  fadeInUp,
  buttonTapPrimary,
} from "@/lib/animations";

const MotionLink = motion.create(Link);

// Glow color per icon position (cycles through theme accents)
const GLOW_CLASSES = [
  "icon-glow-punch",
  "icon-glow-teal",
  "icon-glow-gold",
  "icon-glow-teal",
  "icon-glow-punch",
  "icon-glow-gold",
  "icon-glow-punch",
  "icon-glow-teal",
  "icon-glow-gold",
];

// Desktop scattered positions
const ICON_POSITIONS = [
  { top: "13%", left: "10%", delay: 0 },
  { top: "6%", left: "46%", delay: 0.7 },
  { top: "15%", right: "8%", delay: 0.3 },
  { top: "40%", left: "4%", delay: 1.1 },
  { top: "42%", right: "4%", delay: 0.5 },
  { top: "64%", left: "6%", delay: 0.9 },
  { top: "61%", right: "9%", delay: 0.2 },
  { top: "82%", left: "28%", delay: 1.3 },
  { top: "84%", right: "26%", delay: 0.6 },
];

// Mobile positions (flanking the content on both sides)
const MOBILE_ICON_POSITIONS = [
  { top: "4%", left: "6%", delay: 0 },
  { top: "3%", right: "8%", delay: 0.5 },
  { top: "17%", right: "4%", delay: 0.3 },
  { top: "19%", left: "3%", delay: 0.8 },
  { top: "48%", left: "2%", delay: 1.0 },
  { top: "50%", right: "3%", delay: 0.4 },
  { top: "70%", left: "4%", delay: 0.7 },
  { top: "68%", right: "5%", delay: 0.2 },
  { top: "90%", left: "20%", delay: 1.2 },
];

const TAGLINES = [
  "The comedy game where AI plays too.",
  "Friendslop for when you don't have friends.",
  "You will not be funnier than ChatGPT.",
  "Party game. Friends not required.",
  "Losing to a robot has never been this fun.",
  "The AI is funnier than you. Accept it.",
  "Your jokes are mid. The AI's are worse.",
  "Comedy night, but make it dystopian.",
  "You vs. seven chatbots. Good luck.",
  "Finally, a game where everyone's humor is artificial.",
  "Turing test, but for comedy.",
  "The only game where lag makes the jokes better.",
  "Come for the laughs. Stay because you have no friends.",
];



export default function Home() {
  const { mounted } = useTheme();
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [tagline] = useState(
    () => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]
  );

  useEffect(() => {
    const prompts = getRandomPrompts(10);
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
    <main className="min-h-svh flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Background gradient blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[120px] bg-punch opacity-[0.07]" />
        <div className="absolute bottom-[25%] right-[20%] w-[350px] h-[350px] rounded-full blur-[90px] bg-teal opacity-[0.05]" />
        <div className="absolute top-[60%] left-[12%] w-[250px] h-[250px] rounded-full blur-[70px] bg-gold opacity-[0.04]" />
      </div>

      {/* Floating AI Model Icons — Desktop */}
      {mounted && (
        <div
          className="absolute inset-0 hidden md:block pointer-events-none"
          aria-hidden="true"
        >
          {AI_MODELS.map((model, i) => {
            const pos = ICON_POSITIONS[i];
            if (!pos) return null;
            return (
              <motion.div
                key={model.id}
                className={`absolute w-11 h-11 rounded-xl bg-surface/80 backdrop-blur-sm border border-edge/50 flex items-center justify-center animate-gentle-float ${GLOW_CLASSES[i]}`}
                style={{
                  top: pos.top,
                  left: pos.left,
                  right: pos.right,
                  animationDelay: `${pos.delay}s`,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.4 + i * 0.07,
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
              >
                <ModelIcon model={model} size={22} />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Floating AI Model Icons — Mobile */}
      {mounted && (
        <div
          className="absolute inset-0 md:hidden pointer-events-none"
          aria-hidden="true"
        >
          {AI_MODELS.map((model, i) => {
            const pos = MOBILE_ICON_POSITIONS[i];
            if (!pos) return null;
            return (
              <motion.div
                key={model.id}
                className={`absolute w-9 h-9 rounded-lg bg-surface/60 backdrop-blur-sm border border-edge/30 flex items-center justify-center animate-gentle-float ${GLOW_CLASSES[i]}`}
                style={{
                  top: pos.top,
                  left: pos.left,
                  right: pos.right,
                  animationDelay: `${pos.delay}s`,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.75, scale: 1 }}
                transition={{
                  delay: 0.4 + i * 0.07,
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
              >
                <ModelIcon model={model} size={16} />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Main content */}
      <motion.div
        className="text-center max-w-md w-full relative z-10"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Title with glow */}
        <motion.h1
          className="font-display text-7xl sm:text-8xl font-extrabold tracking-tight text-punch mb-3 title-glow"
          variants={fadeInUp}
        >
          SLOP
          <br />
          LASH
        </motion.h1>

        {/* Divider accent */}
        <motion.div
          className="flex items-center justify-center gap-3 mb-4"
          variants={fadeInUp}
        >
          <div className="h-0.5 w-10 bg-edge-strong rounded-full" />
          <div className="h-1.5 w-1.5 rounded-full bg-gold" />
          <div className="h-0.5 w-10 bg-edge-strong rounded-full" />
        </motion.div>

        {/* Tagline */}
        <motion.p
          className="text-lg text-ink-dim font-medium mb-8"
          variants={fadeInUp}
          suppressHydrationWarning
        >
          {tagline}
        </motion.p>

        {/* Prompt showcase card */}
        <motion.div className="mb-10 mx-auto max-w-sm" variants={fadeInUp}>
          <div className="relative bg-surface/40 backdrop-blur-md border border-edge/60 rounded-2xl px-6 py-5 shadow-[0_0_24px_-4px_rgba(0,0,0,0.15)]">
            <div className="min-h-14 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {currentPrompt && (
                  <motion.p
                    key={currentPrompt}
                    className="text-ink font-display font-bold text-lg leading-snug"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    &ldquo;{currentPrompt}&rdquo;
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {/* Speech bubble tail */}
            <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-surface/40 backdrop-blur-md border-r border-b border-edge/60 rotate-45" />
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          variants={fadeInUp}
        >
          <MotionLink
            href="/host"
            className="block bg-punch/70 backdrop-blur-md hover:bg-punch/85 text-white font-display font-bold py-4 px-8 rounded-xl text-xl border border-punch/30 transition-colors text-center sm:flex-1 shadow-[0_0_20px_-4px_var(--punch)]"
            {...buttonTapPrimary}
          >
            Host a Game
          </MotionLink>
          <MotionLink
            href="/join"
            className="block bg-surface/40 backdrop-blur-md hover:bg-surface/60 text-ink font-display font-bold py-4 px-8 rounded-xl text-xl border-2 border-edge/60 hover:border-edge-strong transition-colors text-center sm:flex-1 shadow-[0_0_24px_-4px_rgba(0,0,0,0.15)]"
            {...buttonTapPrimary}
          >
            Join a Game
          </MotionLink>
        </motion.div>

        {/* Leaderboard link */}
        <motion.div className="mt-6 text-center" variants={fadeInUp}>
          <MotionLink
            href="/leaderboard"
            className="inline-flex items-center gap-2 text-sm text-ink-dim hover:text-ink transition-colors font-medium"
            {...buttonTapPrimary}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            View Leaderboard
          </MotionLink>
        </motion.div>

      </motion.div>

      {/* Floating GitHub icon */}
      {mounted && (
        <motion.a
          href="https://github.com/GabrielHub/slop-lash"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on GitHub"
          className="absolute bottom-6 right-6 md:bottom-8 md:right-8 w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl bg-surface/80 backdrop-blur-sm border border-edge/50 flex items-center justify-center text-ink-dim hover:text-ink animate-wiggle icon-glow-teal z-10 hover:border-edge-strong transition-colors"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{
            delay: 0.4 + AI_MODELS.length * 0.07,
            type: "spring",
            stiffness: 300,
            damping: 20,
          }}
        >
          <svg
            className="w-4 h-4 md:w-[22px] md:h-[22px]"
            viewBox="0 0 24 24"
            fill="currentColor"
            fillRule="evenodd"
          >
            <path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z" />
          </svg>
        </motion.a>
      )}
    </main>
  );
}
