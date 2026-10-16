"use client";

import { useEffect, useRef } from "react";
import { getAmbient, subscribeAmbient } from "@/lib/ambient-events";
import { typingIn } from "@/lib/keyboard-fields";
import { AmbientEngine } from "./engine";

/**
 * The one background behind every page: a fixed canvas under all content,
 * themed per game through the ambient bus (`setAmbient`, `pulseAmbient`) and
 * the CSS variables on <html>. Each scene's static stage lighting is a CSS
 * gradient layer under the canvas, crossfaded with the scene.
 */
export function Ambient() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const crispRef = useRef<HTMLCanvasElement>(null);
  const softRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const crisp = crispRef.current;
    const soft = softRef.current;
    if (!wrapper || !crisp || !soft) return;
    const engine = new AmbientEngine(wrapper, crisp, soft);
    engine.setState(getAmbient());

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    engine.setReduced(reduced.matches);
    engine.setHidden(document.hidden);
    engine.setTyping(typingIn(document.activeElement));

    const unsubscribe = subscribeAmbient(
      (state) => engine.setState(state),
      (pulse) => engine.pulse(pulse),
    );
    const theme = new MutationObserver(() => engine.refreshPalette());
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-game"],
    });

    let resizeFrame = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => engine.resize());
    };
    const onReduced = () => engine.setReduced(reduced.matches);
    const onVisibility = () => engine.setHidden(document.hidden);
    const onFocusIn = (event: FocusEvent) => {
      if (typingIn(event.target as Element | null)) engine.setTyping(true);
    };
    // focusout fires before the next element takes focus; check once it has.
    const onFocusOut = () => {
      window.setTimeout(() => engine.setTyping(typingIn(document.activeElement)), 0);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "mouse") engine.setPointer(event.clientX, event.clientY);
    };

    reduced.addEventListener("change", onReduced);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("pointermove", onPointer, { passive: true });
    engine.sync();

    return () => {
      unsubscribe();
      theme.disconnect();
      cancelAnimationFrame(resizeFrame);
      reduced.removeEventListener("change", onReduced);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pointermove", onPointer);
      engine.destroy();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="ambient" data-scene="stars" aria-hidden="true">
      <div className="ambient-glow" data-for="stars" />
      <div className="ambient-glow" data-for="pixels" />
      <div className="ambient-glow" data-for="bubbles" />
      <div className="ambient-glow" data-for="confetti">
        <div className="ambient-spotlight" />
      </div>
      <div className="ambient-warm" />
      <div className="ambient-grain" />
      <canvas ref={softRef} className="ambient-soft" />
      <canvas ref={crispRef} />
    </div>
  );
}
