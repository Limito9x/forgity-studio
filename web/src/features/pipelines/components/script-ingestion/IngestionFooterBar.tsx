import { useMemo } from "react";
import { RotateCcw, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

interface IngestionFooterBarProps {
  analyzedNodes: AnalyzedCustomNodeDto[];
  isPublishing: boolean;
  onPublish: () => void;
  onReset: () => void;
}

export function IngestionFooterBar({
  analyzedNodes,
  isPublishing,
  onPublish,
  onReset,
}: IngestionFooterBarProps) {
  const stats = useMemo(() => {
    let newCount = 0;
    let modCount = 0;
    let totalBrokenWires = 0;

    analyzedNodes.forEach((n) => {
      if (n.isOverride) modCount++;
      else newCount++;
      totalBrokenWires += n.impactReport?.affectedEdgeCount ?? 0;
    });

    return { newCount, modCount, totalBrokenWires, total: analyzedNodes.length };
  }, [analyzedNodes]);

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-md px-6 py-3 shrink-0 flex items-center justify-between gap-4">
      {/* Left Summary */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {stats.total} script{stats.total > 1 ? "s" : ""} analyzed:
          </span>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
            {stats.newCount} New
          </Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 font-mono text-[10px]">
            {stats.modCount} Modified
          </Badge>
        </div>

        {stats.totalBrokenWires > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-destructive font-medium border-l border-border pl-3">
            <AlertTriangle className="size-3.5" />
            <span>{stats.totalBrokenWires} connection wires will detach</span>
          </div>
        )}
      </div>

      {/* Right Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onPress={onReset}
          isDisabled={isPublishing}
          className="h-8 text-xs gap-1.5"
        >
          <RotateCcw className="size-3.5" />
          Reset All
        </Button>

        <Button
          size="sm"
          onPress={onPublish}
          isDisabled={analyzedNodes.length === 0 || isPublishing}
          className="h-8 text-xs gap-1.5 min-w-[140px] font-semibold"
        >
          {isPublishing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Publish All ({stats.total})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
