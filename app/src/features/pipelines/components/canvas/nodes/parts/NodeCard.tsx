import { useState, type ReactNode } from "react";
import { useNodeId } from "@xyflow/react";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNodeDiagnostics } from "@/features/pipelines/form-scope/PipelineFormScope";

interface NodeCardProps {
  nodeId?: string;
  selected?: boolean;
  status?: "idle" | "running" | "succeeded" | "failed";
  executionError?: string | null;
  borderThemeClass?: string;
  className?: string;
  children: ReactNode;
}

function ExecutionErrorBanner({ error }: { error: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(error);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const isLong = error.length > 100 || error.includes("\n");

  return (
    <div className="rounded-b-xl border-t border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive animate-in fade-in">
      <div className="flex items-start gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "leading-tight break-words font-medium",
              !isExpanded && "line-clamp-2"
            )}
          >
            {error}
          </div>

          {isExpanded && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded bg-destructive/15 p-2 font-mono text-[10px] leading-relaxed text-destructive select-text whitespace-pre-wrap break-all border border-destructive/25">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1 hover:bg-destructive/20 text-destructive transition-colors"
            title={copied ? "Copied to clipboard!" : "Copy full error"}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {isLong && (
            <button
              type="button"
              onClick={handleToggle}
              className="rounded p-1 hover:bg-destructive/20 text-destructive transition-colors"
              title={isExpanded ? "Collapse error" : "Expand full error"}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function NodeCard({
  nodeId: explicitNodeId,
  selected,
  status = "idle",
  executionError,
  borderThemeClass,
  className,
  children,
}: NodeCardProps) {
  const contextNodeId = useNodeId();
  const effectiveNodeId = explicitNodeId || contextNodeId || undefined;
  const { nodeDiagnostics, hasErrors, hasWarnings } = useNodeDiagnostics(effectiveNodeId);

  // When node is idle, check for build-time validation errors or warnings
  const isIdle = status === "idle";
  const showDiagnosticError = isIdle && hasErrors;
  const showDiagnosticWarning = isIdle && !hasErrors && hasWarnings;

  // Find primary node-level diagnostic (e.g. MissingNodeDefinition, UnselectedStructSchema, DagCycleDetected)
  const primaryDiagnostic = showDiagnosticError
    ? nodeDiagnostics.find((d) => d.severity === "Error")
    : showDiagnosticWarning
      ? nodeDiagnostics.find((d) => d.severity === "Warning")
      : null;

  return (
    <div
      className={cn(
        "group relative min-w-[300px] max-w-[380px] rounded-xl border bg-card shadow-md transition-[border-color,box-shadow] duration-150 select-none",
        selected
          ? "border-primary ring-2 ring-primary/40 shadow-primary/15"
          : "border-border/80 hover:border-primary/50",
        borderThemeClass,
        // Runtime execution statuses
        status === "running" && "border-amber-500 ring-2 ring-amber-500/40 animate-pulse",
        status === "succeeded" && "border-emerald-500/90 ring-1 ring-emerald-500/20",
        status === "failed" && "border-destructive ring-2 ring-destructive/40",
        // Build-time diagnostic statuses (when idle)
        showDiagnosticError && !selected && "border-destructive/80 ring-1 ring-destructive/30",
        showDiagnosticWarning && !selected && "border-amber-500/70",
        className
      )}
    >
      {children}

      {/* Runtime Failure Banner */}
      {status === "failed" && (
        <ExecutionErrorBanner error={executionError || "Execution failed on this node."} />
      )}

      {/* Build-Time Diagnostic Banner (only when idle and node has unaddressed issues) */}
      {isIdle && primaryDiagnostic && (
        <div
          className={cn(
            "rounded-b-xl border-t px-3 py-1.5 text-[10px] flex items-start gap-1.5 animate-in fade-in",
            primaryDiagnostic.severity === "Error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          )}
        >
          {primaryDiagnostic.severity === "Error" ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          )}
          <span className="leading-tight break-words flex-1 font-medium truncate" title={primaryDiagnostic.message}>
            {primaryDiagnostic.message}
          </span>
        </div>
      )}
    </div>
  );
}
