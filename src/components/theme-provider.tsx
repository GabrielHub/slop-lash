"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { DUR, EASE, press } from "@/lib/animations";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
  mounted: boolean;
}>({
  theme: "dark",
  toggle: () => {},
  mounted: false,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read from the DOM attribute set by the anti-FOUC script first
    const attr = document.documentElement.getAttribute("data-theme");
    let initial: Theme = "dark";
    if (attr === "light" || attr === "dark") {
      initial = attr;
    } else {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") {
        initial = stored;
      } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        initial = "light";
      }
    }
    // Hydration-aware: must sync browser state after SSR
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return <ThemeContext value={{ theme, toggle, mounted }}>{children}</ThemeContext>;
}

/** A round 44px icon-only button; the top bar uses it for the back arrow too. */
export const ICON_BUTTON_CLASS =
  "grid size-11 shrink-0 place-items-center rounded-full text-ink-dim transition-colors hover:bg-surface/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-punch/60 cursor-pointer";

/** Inline sun/moon button that flips the theme. It sits in a top bar or menu row. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle, mounted } = useTheme();
  const reduceMotion = useReducedMotion();

  // The stored theme is unknown until mount, so render an inert slot of the same size.
  if (!mounted) {
    return <span className={`${ICON_BUTTON_CLASS} ${className}`} aria-hidden="true" />;
  }

  const spin = reduceMotion ? 0 : 90;
  return (
    <motion.button
      type="button"
      onClick={toggle}
      className={`${ICON_BUTTON_CLASS} ${className}`}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      {...press}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="grid place-items-center"
          initial={{ rotate: -spin, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: spin, opacity: 0 }}
          transition={{ duration: DUR.fast, ease: EASE.out }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
