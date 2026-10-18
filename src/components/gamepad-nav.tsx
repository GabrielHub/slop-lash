"use client";

import { useEffect } from "react";
import {
  GAMEPAD_INPUT_EVENT,
  nearestInDirection,
  readPads,
  type Direction,
  type Intent,
  type PadState,
} from "@/lib/gamepad";
import { KEYBOARD_FIELDS } from "@/lib/keyboard-fields";

const FOCUSABLE =
  "button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=button], [tabindex]";

/** What shows an element on screen: itself, or the label of an sr-only radio or checkbox. */
function shownBy(element: HTMLElement): HTMLElement {
  const rect = element.getBoundingClientRect();
  if (rect.width > 2 && rect.height > 2) return element;
  return element.closest("label") ?? element;
}

function targetRect(element: HTMLElement) {
  return shownBy(element).getBoundingClientRect();
}

/** What a pad can reach: enabled, tabbable, rendered, and inside any open modal. */
function focusTargets(): HTMLElement[] {
  const modal = document.querySelector<HTMLElement>("[aria-modal='true']");
  const root = modal ?? document.body;
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[inert]")) {
      return false;
    }
    // Motion makes a tappable label tabbable; its radio is the real target.
    if (element instanceof HTMLLabelElement && element.control) return false;
    if (!element.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return false;
    const rect = targetRect(element);
    return rect.width > 0 && rect.height > 0;
  });
}

/** Where the pad last put focus, so a move after that element goes away (a closed panel) starts from there. */
let lastRect: DOMRect | null = null;

function focus(element: HTMLElement) {
  element.focus({ preventScroll: true });
  const shown = shownBy(element);
  // Scroll only when an edge is off screen or under something (the host page's sticky Create bar).
  const rect = shown.getBoundingClientRect();
  lastRect = rect;
  const x = (rect.left + rect.right) / 2;
  const clear = [rect.top + 4, rect.bottom - 4].every((y) => {
    const hit = document.elementFromPoint(x, y);
    return hit !== null && shown.contains(hit);
  });
  if (clear) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  shown.scrollIntoView({ block: "center", inline: "nearest", behavior: smooth ? "smooth" : "auto" });
}

function move(direction: Direction) {
  const targets = focusTargets();
  if (targets.length === 0) return;
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const from = current && targets.includes(current) ? current : null;
  const fromRect = from ? targetRect(from) : lastRect;
  if (!fromRect) {
    // Nothing reachable has focus yet: start on the first target on screen.
    const onScreen = targets.find((element) => {
      const rect = targetRect(element);
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    focus(onScreen ?? targets[0]!);
    return;
  }
  const others = targets.filter((element) => element !== from);
  const next = nearestInDirection(fromRect, others.map(targetRect), direction);
  if (next !== -1) focus(others[next]!);
}

/** A synthetic key on document, so document listeners (menu sheet) and window ones (stage keys) both hear it. */
function sendKey(key: string, code: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
}

function act(intent: Intent) {
  document.documentElement.dataset.input = "gamepad";
  window.dispatchEvent(new Event(GAMEPAD_INPUT_EVENT));
  switch (intent) {
    case "activate": {
      const element = document.activeElement;
      // A text field just keeps focus: no on-screen keyboard; saved-password autofill or Free Play covers it.
      if (!(element instanceof HTMLElement) || element === document.body || element.matches(KEYBOARD_FIELDS)) {
        return;
      }
      element.click();
      return;
    }
    case "back":
      sendKey("Escape", "Escape");
      return;
    // The stage's own shortcuts (`useStageKey`): Enter continues or plays again, Space skips (two presses).
    case "menu":
      sendKey("Enter", "Enter");
      return;
    case "skip":
      sendKey(" ", "Space");
      return;
    default:
      move(intent);
  }
}

/**
 * Xbox (standard-mapping) pad navigation for the TV: the D-pad or left stick
 * moves focus spatially, A clicks, B is Escape, Menu is the stage's Enter and
 * RB or View its skip. Inert on phones, which never report a pad.
 *
 * Known limits: browsers feed pad input only to the focused window, and pad
 * presses (and the synthetic keys sent here) are not user gestures, so sound
 * (`src/lib/sounds.ts`) still needs one real click or key press per page load.
 */
export function useGamepadNav() {
  useEffect(() => {
    if (typeof navigator.getGamepads !== "function") return;
    let frame = 0;
    let state: PadState | null = null;

    const poll = () => {
      const pads = navigator.getGamepads();
      // The last pad went away (disconnect): stop until the next `gamepadconnected`.
      if (!pads.some(Boolean)) {
        frame = 0;
        state = null;
        return;
      }
      // Ask for the next frame first, so a throwing handler can't stall the loop with `frame` set.
      frame = requestAnimationFrame(poll);
      const next = readPads(state, pads, performance.now());
      state = next.state;
      next.intents.forEach(act);
    };
    // The browser reports a pad only after its first button press.
    const start = () => {
      if (frame === 0) frame = requestAnimationFrame(poll);
    };
    const pointer = () => delete document.documentElement.dataset.input;

    start();
    window.addEventListener("gamepadconnected", start);
    window.addEventListener("pointerdown", pointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("pointerdown", pointer);
    };
  }, []);
}

export function GamepadNav() {
  useGamepadNav();
  return null;
}
