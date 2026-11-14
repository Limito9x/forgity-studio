import { CheckCircle2, ShieldAlert, GitBranch, Layers, Unlink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

interface ImpactReconciliationTabProps {
  node: AnalyzedCustomNodeDto;
  strategy: number; // 0 = KeepCompatible, 1 = UnpinAll
  onStrategyChange: (strategy: number) => void;
}

export function ImpactReconciliationTab({
  node,
  strategy,
  onStrategyChange,
}: ImpactReconciliationTabProps) {
  const isOverride = node.isOverride;
  const report = node.impactReport;
  const affectedPipelines = report?.affectedPipelineCount ?? 0;
  const affectedNodes = report?.affectedNodeCount ?? 0;
  const affectedEdges = report?.affectedEdgeCount ?? 0;
  const pipelineNames = report?.affectedPipelineNames ?? [];

  if (!isOverride) {
    return (
      <div className="w-full p-8 space-y-6 text-center">
        <div className="p-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4 max-w-2xl mx-auto">
          <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
              Safe to Publish — Brand New Node
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              This node key does not exist in your project yet. Publishing this script will register a new
              DAG tool definition without altering or breaking any existing pipelines.
            </p>
          </div>
          <div className="pt-2">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs">
              Zero Impact Risk
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* Overview Alert */}
      <div
        className={cn(
          "p-4 rounded-xl border flex items-start gap-3",
          affectedEdges > 0
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200"
        )}
      >
        <ShieldAlert className="size-5 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <h4 className="font-semibold text-sm">
            {affectedEdges > 0
              ? `Warning: Breaking Pin Changes Detected (${affectedEdges} wires affected)`
              : "Node Update: No Breaking Wire Disconnections"}
          </h4>
          <p className="leading-relaxed text-muted-foreground">
            {affectedEdges > 0
              ? "Updating this script will modify pin signatures that are actively connected in existing pipeline graphs. Choose how you want the engine to reconcile affected wires below."
              : "Updating this script retains full pin compatibility with existing pipeline graphs. All wires will remain safely intact."}
          </p>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="size-4 text-primary" />
            <span>Affected Pipelines</span>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight">{affectedPipelines}</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="size-4 text-primary" />
            <span>Node Instances</span>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight">{affectedNodes}</p>
        </div>

        <div
          className={cn(
            "p-4 rounded-xl border space-y-1",
            affectedEdges > 0
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-border bg-card/60"
          )}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Unlink className={cn("size-4", affectedEdges > 0 ? "text-destructive" : "text-primary")} />
            <span>Broken Connection Wires</span>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight">{affectedEdges}</p>
        </div>
      </div>

      {/* Affected Pipelines List */}
      {pipelineNames.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card/40 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pipelines Using This Node
          </h4>
          <div className="flex flex-wrap gap-2">
            {pipelineNames.map((name, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-normal">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation Strategy Radio / Cards */}
      <div className="space-y-3 pt-2">
        <div>
          <h4 className="text-sm font-semibold">Choose Wire Reconciliation Strategy</h4>
          <p className="text-xs text-muted-foreground">
            Decide how the database should handle wires attached to existing instances of this node.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Strategy 0: Keep Compatible */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onStrategyChange(0)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onStrategyChange(0);
            }}
            className={cn(
              "p-4 rounded-xl border cursor-pointer transition-all space-y-2 select-none",
              strategy === 0
                ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                : "border-border bg-card/40 hover:bg-muted/30"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                <Sparkles className="size-4 text-emerald-500" />
                Keep Compatible Pins (Recommended)
              </div>
              <input
                type="radio"
                name="strategy"
                checked={strategy === 0}
                onChange={() => onStrategyChange(0)}
                className="accent-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Preserves all existing wires where pin name and data type remain matching.
              Only invalid or removed pins will have their connection wires detached.
            </p>
          </div>

          {/* Strategy 1: Unpin All */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onStrategyChange(1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onStrategyChange(1);
            }}
            className={cn(
              "p-4 rounded-xl border cursor-pointer transition-all space-y-2 select-none",
              strategy === 1
                ? "border-destructive bg-destructive/5 ring-1 ring-destructive/40 shadow-xs"
                : "border-border bg-card/40 hover:bg-muted/30"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-xs text-destructive">
                <Unlink className="size-4" />
                Unpin All Wires (Nuclear Reset)
              </div>
              <input
                type="radio"
                name="strategy"
                checked={strategy === 1}
                onChange={() => onStrategyChange(1)}
                className="accent-destructive"
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Completely detaches all input and output wires from this node across all pipelines.
              You will need to manually rewire them in the canvas editor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
