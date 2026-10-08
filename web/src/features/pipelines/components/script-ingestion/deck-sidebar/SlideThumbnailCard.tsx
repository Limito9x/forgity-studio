import { FileCode, AlertTriangle, X, RotateCcw, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnalyzedCustomNodeDto } from "@/gen/model";
import { ExecutorIcon } from "@/features/runners/components/ExecutorIcon";

interface SlideThumbnailCardProps {
  node: AnalyzedCustomNodeDto;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

export function SlideThumbnailCard({
  node,
  index,
  isSelected,
  onClick,
  onRemove,
}: SlideThumbnailCardProps) {
  const getExecutorIcon = (executor: string) => {
    return <ExecutorIcon executor={executor} className="size-3" />;
  };

  const inputPins = node.inputs ?? [];
  const outputPins = node.outputs ?? [];
  const affectedEdges = node.impactReport?.affectedEdgeCount ?? 0;
  const isOverride = node.isOverride;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex flex-col p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 select-none",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
          : "border-border/70 bg-card/60 hover:bg-muted/40 hover:border-border"
      )}
    >
      {/* Top Header: Index & Status Badge */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-[11px] font-mono font-semibold text-muted-foreground/80">
          #{index + 1}
        </span>
        <div className="flex items-center gap-1">
          {isOverride ? (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-0.5"
            >
              <RotateCcw className="size-2.5" />
              MOD
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-0.5"
            >
              <CheckCircle2 className="size-2.5" />
              NEW
            </Badge>
          )}

          {/* Remove Button on hover */}
          <button
            type="button"
            className="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(e);
            }}
            title="Remove from batch"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Main File Name & Executor */}
      <div className="flex items-start gap-2 mb-2">
        <FileCode className="size-4 shrink-0 text-muted-foreground mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate leading-tight" title={node.fileName}>
            {node.suggestedLabel || node.fileName}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
            {node.fileName}
          </p>
        </div>
      </div>

      {/* Mini Node Visualizer / Pin Dots Container */}
      <div className="mt-auto pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        {/* Input Pin Dots */}
        <div className="flex items-center gap-1" title={`${inputPins.length} inputs`}>
          <div className="flex items-center -space-x-0.5">
            {inputPins.slice(0, 4).map((p, i) => (
              <span
                key={i}
                className="size-2 rounded-full bg-emerald-500 ring-1 ring-background"
                title={`Input: ${p.label || p.id}`}
              />
            ))}
          </div>
          {inputPins.length > 4 && (
            <span className="text-[9px] text-muted-foreground">+{inputPins.length - 4}</span>
          )}
          <span className="text-[10px] font-sans ml-1 text-muted-foreground">in</span>
        </div>

        {/* Executor Icon */}
        <div className="flex items-center gap-1">
          {getExecutorIcon(node.executor)}
          <span className="text-[10px] capitalize text-muted-foreground/80">{node.executor}</span>
        </div>

        {/* Output Pin Dots */}
        <div className="flex items-center gap-1" title={`${outputPins.length} outputs`}>
          <span className="text-[10px] font-sans mr-1 text-muted-foreground">out</span>
          <div className="flex items-center -space-x-0.5">
            {outputPins.slice(0, 4).map((p, i) => (
              <span
                key={i}
                className="size-2 rounded-full bg-amber-500 ring-1 ring-background"
                title={`Output: ${p.label || p.id}`}
              />
            ))}
          </div>
          {outputPins.length > 4 && (
            <span className="text-[9px] text-muted-foreground">+{outputPins.length - 4}</span>
          )}
        </div>
      </div>

      {/* Broken Edge Warning Pill */}
      {affectedEdges > 0 && (
        <div className="mt-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-medium">
          <AlertTriangle className="size-3 shrink-0" />
          <span className="truncate">{affectedEdges} wires affected</span>
        </div>
      )}
    </div>
  );
}
