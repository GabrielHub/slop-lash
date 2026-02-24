"use client";

import { GameModelUsage } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";

function formatCost(cost: number): string {
  return cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2);
}

interface AiUsageBreakdownProps {
  modelUsages: GameModelUsage[];
  totalInput: number;
  totalOutput: number;
  totalCost: number;
}

export function AiUsageBreakdown({
  modelUsages,
  totalInput,
  totalOutput,
  totalCost,
}: AiUsageBreakdownProps) {
  const totalTokens = totalInput + totalOutput;

  if (modelUsages.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge">
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-4 text-center">
          <div>
            <p className="font-mono font-bold text-lg tabular-nums text-ink">
              {totalTokens.toLocaleString()}
            </p>
            <p className="text-[11px] text-ink-dim mt-0.5">Total Tokens</p>
          </div>
          <div>
            <p className="font-mono font-bold text-lg tabular-nums text-ink">
              {totalInput.toLocaleString()}
            </p>
            <p className="text-[11px] text-ink-dim mt-0.5">Input</p>
          </div>
          <div>
            <p className="font-mono font-bold text-lg tabular-nums text-ink">
              {totalOutput.toLocaleString()}
            </p>
            <p className="text-[11px] text-ink-dim mt-0.5">Output</p>
          </div>
          <div className="col-span-3 pt-3 border-t border-edge lg:col-span-1 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-4">
            <p className="font-mono font-bold text-lg tabular-nums text-teal">
              ${formatCost(totalCost)}
            </p>
            <p className="text-[11px] text-ink-dim mt-0.5">Estimated Cost</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge">
      <div className="space-y-2">
        {modelUsages.map((mu) => {
          const model = getModelByModelId(mu.modelId);
          return (
            <div
              key={mu.modelId}
              className="flex items-center gap-3 py-1.5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {model ? (
                  <ModelIcon model={model} size={18} />
                ) : (
                  <span className="w-[18px] h-[18px] rounded-full bg-edge" />
                )}
                <span className="font-medium text-ink truncate">
                  {model?.shortName ?? mu.modelId}
                </span>
              </div>
              <span className="font-mono text-xs tabular-nums text-ink-dim shrink-0">
                {(mu.inputTokens + mu.outputTokens).toLocaleString()} tok
              </span>
              <span className="font-mono text-xs tabular-nums text-teal shrink-0 w-16 text-right">
                ${formatCost(mu.costUsd)}
              </span>
            </div>
          );
        })}

        <div className="flex items-center gap-3 pt-2 mt-1 border-t border-edge text-sm">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-[18px] h-[18px]" />
            <span className="font-bold text-ink">Total</span>
          </div>
          <span className="font-mono text-xs font-bold tabular-nums text-ink shrink-0">
            {totalTokens.toLocaleString()} tok
          </span>
          <span className="font-mono text-xs font-bold tabular-nums text-teal shrink-0 w-16 text-right">
            ${formatCost(totalCost)}
          </span>
        </div>
      </div>
    </div>
  );
}
