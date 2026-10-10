"use client";

// An error boundary for parts of the stage that may fail on their own (a font
// that will not load, a phase scene that throws) without taking the whole
// canvas down with them: the TV keeps rendering and shows the fallback. Each
// label warns once per page load.

import { Component, type ErrorInfo, type ReactNode } from "react";

export interface StageBoundaryProps {
  /** What failed, for the console ("title font", "FIGHT scene"). */
  label: string;
  /** Rendered instead of the children after a failure. */
  fallback: ReactNode;
  /** A change of this value clears the failure and tries the children again. */
  resetKey?: unknown;
  children?: ReactNode;
}

interface StageBoundaryState {
  failed: boolean;
  resetKey: unknown;
}

const warned = new Set<string>();

export class StageBoundary extends Component<StageBoundaryProps, StageBoundaryState> {
  state: StageBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<StageBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: StageBoundaryProps, state: StageBoundaryState): Partial<StageBoundaryState> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (warned.has(this.props.label)) return;
    warned.add(this.props.label);
    console.warn(`[slopfight] ${this.props.label} failed; showing its fallback.`, error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
