"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** The artboard every tutorial and preview frame is drawn on, in px; players scale it to the screen. */
export const BOARD = { width: 1920, height: 1080 } as const;

/** Scales the 1920x1080 board to fit its container, letterboxed and centred. */
export function Board({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () =>
      setScale(
        Math.min(element.clientWidth / BOARD.width, element.clientHeight / BOARD.height) || 0,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} data-tutorial-box className="absolute inset-0 overflow-hidden">
      <div
        data-tutorial-board
        className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{
          width: BOARD.width,
          height: BOARD.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
