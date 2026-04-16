"use client";

import type { MockMatchSlopSharedState } from "./mock-matchslop-state";

type MockMatchSlopDebugPanelProps = {
  clientLabel: string;
  scenarioSlug: string;
  sharedState: MockMatchSlopSharedState;
};

export function MockMatchSlopDebugPanel({
  clientLabel,
  scenarioSlug,
  sharedState,
}: MockMatchSlopDebugPanelProps) {
  const debugSnapshot = {
    clientLabel,
    scenarioSlug,
    status: sharedState.game.status,
    currentRound: sharedState.game.currentRound,
    totalRounds: sharedState.game.totalRounds,
    version: sharedState.game.version,
    revision: sharedState.revision,
    outcome:
      (sharedState.game.modeState as { outcome?: string } | null)?.outcome ?? null,
    votingPromptIndex: sharedState.game.votingPromptIndex,
    votingRevealing: sharedState.game.votingRevealing,
    phaseDeadline: sharedState.game.phaseDeadline,
    lastAction: sharedState.lastAction,
    updatedAt: sharedState.updatedAt,
    actionLog: sharedState.actionLog,
  };

  return (
    <details
      open
      data-testid="mock-matchslop-debug-panel"
      className="pointer-events-auto rounded-2xl border border-edge bg-base/95 p-3 text-left shadow-lg backdrop-blur-md"
    >
      <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-[0.2em] text-ink-dim">
        Debug {clientLabel}
      </summary>
      <pre
        data-testid="mock-matchslop-debug-json"
        className="mt-3 max-h-64 overflow-auto rounded-xl border border-edge/70 bg-base px-3 py-2 text-[11px] leading-5 text-ink"
      >
        {JSON.stringify(debugSnapshot, null, 2)}
      </pre>
    </details>
  );
}
