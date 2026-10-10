"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Types `text` out, for AI lines. The full text is laid out invisibly
 * underneath, so nothing reflows as it types, and screen readers get it all at
 * once. If `text` grows (a streamed line), typing carries on from where it is.
 * Reduced motion shows it immediately.
 */
export function TypeOn({
  text,
  cps = 40,
  delay = 0,
  caret = true,
  className = "",
}: {
  text: string;
  /** Characters per second. */
  cps?: number;
  /** Seconds before the first character. */
  delay?: number;
  /** A blinking caret while typing. */
  caret?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const typedRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = typedRef.current;
    if (!node) return;
    const setCaret = (on: boolean) => {
      if (caretRef.current) caretRef.current.style.visibility = on ? "visible" : "hidden";
    };
    if (reduced) {
      node.textContent = text;
      setCaret(false);
      return;
    }
    const typed = node.textContent ?? "";
    const from = typed && text.startsWith(typed) ? typed.length : 0;
    if (from >= text.length) {
      node.textContent = text;
      setCaret(false);
      return;
    }
    let raf = 0;
    let begin: number | null = null;
    const tick = (now: number) => {
      begin ??= now + (from === 0 ? delay * 1000 : 0);
      const count = Math.min(text.length, from + Math.floor(((now - begin) / 1000) * cps));
      if (count >= from) node.textContent = text.slice(0, count);
      setCaret(count < text.length);
      if (count < text.length) raf = requestAnimationFrame(tick);
    };
    setCaret(true);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, cps, delay, reduced]);

  return (
    <span className={`grid ${className}`}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {text}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1">
        <span ref={typedRef} />
        {caret && (
          <span
            ref={caretRef}
            className="ml-[0.06em] inline-block h-[0.95em] w-[0.08em] translate-y-[0.12em] bg-current animate-blink-cursor"
            style={{ visibility: "hidden" }}
          />
        )}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
