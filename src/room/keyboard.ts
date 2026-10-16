"use client";

import { useEffect } from "react";
import { typingIn } from "@/lib/keyboard-fields";

// Keyboard avoidance for the phone controllers. Android Chrome shrinks the
// page for the keyboard (`interactiveWidget: "resizes-content"` in the root
// layout); iOS Safari ignores that and slides the keyboard over the page, so
// the visual viewport shrinks while the layout viewport does not. While a
// field has focus this keeps two things true on both:
// - `--keyboard-inset` on <html> is how much of the layout viewport the
//   keyboard covers (0 on Android). The controller pads its bottom by it, so
//   the page can scroll its end above the keyboard, and sticky bottom bars
//   (`bottom-[var(--keyboard-inset)]`) ride on top of the keyboard.
// - The focused field's frame (`data-keyboard-frame`: the field with its Send)
//   is scrolled into what is visible: under the sticky phone bar
//   (`data-keyboard-cover`), above the keyboard and any sticky bottom bar
//   outside the frame (`data-keyboard-bar`). It runs when the field gains focus
//   and when the keyboard changes size, never while the player scrolls.

export interface Span {
  top: number;
  bottom: number;
}

/**
 * How far to scroll the page (positive scrolls down) so the frame sits inside
 * `visible`. A frame too tall to fit keeps the field's top in view instead.
 */
export function revealDelta(frame: Span, field: Span, visible: Span): number {
  if (field.top < visible.top) return field.top - visible.top;
  if (frame.bottom > visible.bottom) return Math.min(frame.bottom - visible.bottom, field.top - visible.top);
  return 0;
}

/** The layout viewport the keyboard covers, in CSS pixels; 0 when pinch-zoomed (that is not a keyboard). */
export function keyboardInset(
  layoutHeight: number,
  viewport: { height: number; offsetTop: number; scale: number },
): number {
  if (Math.abs(viewport.scale - 1) > 0.01) return 0;
  return Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop));
}

const span = (element: Element): Span => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
};

/** What the player can see of the page, in layout-viewport coordinates, around `frame`. */
function visibleSpan(frame: Element): Span {
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop ?? 0;
  let bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  for (const cover of document.querySelectorAll("[data-keyboard-cover]")) {
    top = Math.max(top, span(cover).bottom);
  }
  for (const bar of document.querySelectorAll("[data-keyboard-bar]")) {
    if (bar.contains(frame) || frame.contains(bar)) continue;
    const rect = bar.getBoundingClientRect();
    if (rect.height > 0) bottom = Math.min(bottom, rect.top);
  }
  return { top, bottom };
}

/** Keyboard avoidance for this page while it is mounted (see the top of this file). */
export function useKeyboardAvoidance(): void {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const activeField = () => (typingIn(document.activeElement) ? document.activeElement : null);
    let field = activeField();
    let inset = -1;
    let frame = 0;

    const measure = () => {
      const next = field && viewport ? keyboardInset(window.innerHeight, viewport) : 0;
      if (next === inset) return;
      inset = next;
      root.style.setProperty("--keyboard-inset", `${next}px`);
    };
    // After the browser's own scroll to the field and our padding have landed.
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        frame = requestAnimationFrame(() => {
          if (!field?.isConnected) return;
          const box = field.closest("[data-keyboard-frame]") ?? field;
          const delta = revealDelta(span(box), span(field), visibleSpan(box));
          if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
        });
      });
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!typingIn(event.target as Element | null)) return;
      field = event.target as HTMLElement;
      reveal();
    };
    // focusout fires before the next element takes focus; check once it has.
    let blur = 0;
    const onFocusOut = () => {
      window.clearTimeout(blur);
      blur = window.setTimeout(() => {
        field = activeField();
        measure();
      }, 0);
    };
    const onResize = () => {
      if (field) reveal();
      else measure();
    };

    measure();
    if (field) reveal();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onResize);
    viewport?.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(blur);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onResize);
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", measure);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
