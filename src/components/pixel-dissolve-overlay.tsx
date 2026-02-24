"use client";

import { useEffect, useRef } from "react";
import { subscribeDissolve, type DissolveRequest } from "@/lib/dissolve-events";

const DISSOLVE_COLORS = ["var(--punch)", "var(--teal)", "var(--gold)"];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function runDissolve(container: HTMLElement, request: DissolveRequest) {
  if (prefersReducedMotion()) {
    request.onDissolveComplete?.();
    request.onSequenceComplete?.();
    return;
  }

  const { sourceRect } = request;
  const colors = request.colors ?? DISSOLVE_COLORS;
  const particleCount = request.particleCount ?? 20;

  const dissolveParticles: HTMLElement[] = [];
  const staggerDelay = 12; // ms between each particle

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement("div");
    const size = randomBetween(3, 5);
    const color = pickRandom(colors);

    // Start position: random point within the source rect
    const startX = sourceRect.left + Math.random() * sourceRect.width;
    const startY = sourceRect.top + Math.random() * sourceRect.height;

    // End position: fly all the way to the top with horizontal drift
    const endX = startX + randomBetween(-80, 80);
    const endY = -20; // just above viewport

    el.style.cssText = `
      position: fixed;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      box-shadow: 0 0 ${size * 2}px ${color}, 0 0 ${size * 5}px ${color};
      left: ${startX}px;
      top: ${startY}px;
      pointer-events: none;
      will-change: transform, opacity;
      z-index: 20;
    `;

    container.appendChild(el);
    dissolveParticles.push(el);

    // Duration scales with distance — slower, more leisurely float
    const distance = startY + 20; // distance to top
    const duration = Math.max(1000, distance * 2.5 + randomBetween(-200, 200));

    el.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${(endX - startX) * 0.3}px, ${(endY - startY) * 0.25}px) scale(0.9)`, opacity: 0.9, offset: 0.25 },
        { transform: `translate(${(endX - startX) * 0.7}px, ${(endY - startY) * 0.6}px) scale(0.6)`, opacity: 0.5, offset: 0.6 },
        {
          transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.2)`,
          opacity: 0,
        },
      ],
      {
        duration,
        delay: i * staggerDelay,
        easing: "cubic-bezier(0.1, 0.6, 0.3, 1)",
        fill: "forwards",
      }
    );
  }

  // Total duration: last particle's delay + longest possible flight
  const maxDistance = sourceRect.top + 20;
  const maxFlightDuration = Math.max(1000, maxDistance * 2.5 + 200);
  const totalDuration = (particleCount - 1) * staggerDelay + maxFlightDuration;

  setTimeout(() => {
    dissolveParticles.forEach((el) => el.remove());
    request.onDissolveComplete?.();
    request.onSequenceComplete?.();
  }, totalDuration);
}

export function PixelDissolveOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeDissolve((request) => {
      if (containerRef.current) {
        runDissolve(containerRef.current, request);
      }
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-20"
      aria-hidden="true"
    />
  );
}
