import { memo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Boxes, Cpu } from "lucide-react";

interface NodeConfigBatchPanelProps {
  isBatch: boolean;
  maxConcurrency: number;
  iterablePin: string;
  skipOnError: boolean;
  availablePins: Array<{ id: string; label?: string }>;
  onUpdateBatch: (updates: {
    isBatch?: boolean;
    maxConcurrency?: number;
    iterablePin?: string;
    skipOnError?: boolean;
  }) => void;
  isReadOnly?: boolean;
}

export const NodeConfigBatchPanel = memo(function NodeConfigBatchPanel({
  isBatch,
  maxConcurrency,
  iterablePin,
  skipOnError,
  availablePins,
  onUpdateBatch,
  isReadOnly = false,
}: NodeConfigBatchPanelProps) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <Boxes className="h-4 w-4" />
          <span>Parallel Batch Execution</span>
        </div>
        <Switch
          isSelected={isBatch}
          onChange={(val) => onUpdateBatch({ isBatch: val })}
          isDisabled={isReadOnly}
        />
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {isBatch
          ? "Executes this component across all items in the array input concurrently via tokio Semaphore."
          : "Executes normally as a single unit (1:1)."}
      </p>

      {isBatch && (
        <div className="space-y-3 pt-1 border-t border-amber-500/20 text-xs">
          {/* Iterable Pin Selection */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-foreground flex items-center gap-1">
              <span>Iterable Array Pin</span>
              <span className="text-amber-500">*</span>
            </Label>
            <select
              value={iterablePin}
              onChange={(e) => onUpdateBatch({ iterablePin: e.target.value })}
              disabled={isReadOnly}
              className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Select array input --</option>
              {availablePins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.id} ({p.id})
                </option>
              ))}
            </select>
          </div>

          {/* Max Concurrency Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-foreground flex items-center gap-1">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                <span>Max Concurrency</span>
              </span>
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                {maxConcurrency} {maxConcurrency === 1 ? "worker" : "workers"}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={maxConcurrency}
              onChange={(e) => onUpdateBatch({ maxConcurrency: parseInt(e.target.value, 10) || 1 })}
              disabled={isReadOnly}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-muted rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
              <span>1 (Sequential)</span>
              <span>2 (Balanced)</span>
              <span>4 (High VRAM)</span>
              <span>8 (Max)</span>
            </div>
          </div>

          {/* Skip on Error */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              isSelected={skipOnError}
              onChange={(val) => onUpdateBatch({ skipOnError: val })}
              isDisabled={isReadOnly}
              className="mt-0.5"
            />
            <div className="text-[11px] leading-tight cursor-pointer" onClick={() => !isReadOnly && onUpdateBatch({ skipOnError: !skipOnError })}>
              <span className="font-medium text-foreground">Skip on error</span>
              <p className="text-[10px] text-muted-foreground">
                Continues processing other items if one item crashes/fails.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

