import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  Crosshair,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineDiagnostic } from "@/features/pipelines/hooks/usePipelineGraph";
import type { ValidationStatus } from "@/features/pipelines/form-scope/PipelineFormScope";

interface CanvasDiagnosticsPanelProps {
  diagnostics: PipelineDiagnostic[];
  errorCount: number;
  warningCount: number;
  validationStatus: ValidationStatus;
  isStale: boolean;
  isValidating: boolean;
  onRevalidate: () => void;
  onFocusNode: (nodeId: string) => void;
  onClose: () => void;
}

export function CanvasDiagnosticsPanel({
  diagnostics,
  errorCount,
  warningCount,
  isStale,
  isValidating,
  onRevalidate,
  onFocusNode,
  onClose,
}: CanvasDiagnosticsPanelProps) {
  const hasIssues = diagnostics.length > 0;

  return (
    <div className="absolute top-16 right-4 z-40 w-96 max-h-[calc(100vh-140px)] rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-muted/40">
        <div className="flex items-center gap-2">
          {errorCount > 0 ? (
            <ShieldAlert className="h-4 w-4 text-destructive" />
          ) : warningCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          )}
          <span className="text-xs font-semibold text-foreground">Graph Diagnostics</span>

          <div className="flex items-center gap-1 text-[10px] font-mono ml-1">
            {errorCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1.5 py-0 text-[9px]">
                {errorCount} E
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge
                variant="outline"
                className="h-4 px-1.5 py-0 text-[9px] border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
              >
                {warningCount} W
              </Badge>
            )}
            {errorCount === 0 && warningCount === 0 && (
              <Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                Healthy
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onPress={onRevalidate}
            isDisabled={isValidating}
            aria-label="Re-validate Graph Draft"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onPress={onClose}
            aria-label="Close Diagnostics Panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stale Warning Banner */}
      {isStale && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-3.5 py-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Draft changed since last validation.</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
            onPress={onRevalidate}
            isDisabled={isValidating}
          >
            Check Now
          </Button>
        </div>
      )}

      {/* Issues List */}
      <ScrollArea className="flex-1 p-3">
        {!hasIssues ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-2 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/80 stroke-1" />
            <p className="text-xs font-medium text-foreground">No diagnostics found</p>
            <p className="text-[11px] max-w-[240px]">
              All nodes, connections, and required parameters are resolved and valid.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {diagnostics.map((diag, index) => {
              const isError = diag.severity === "Error";
              const hasTargetNode = Boolean(diag.nodeId);

              return (
                <div
                  key={index}
                  className={cn(
                    "group rounded-lg border p-2.5 text-xs transition-colors",
                    isError
                      ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
                      : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {isError ? (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-muted/60 text-muted-foreground">
                            {diag.code}
                          </span>
                          {diag.nodeLabel && (
                            <span className="text-[11px] font-semibold text-foreground truncate max-w-[160px]">
                              {diag.nodeLabel}
                            </span>
                          )}
                          {diag.pinId && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              ({diag.pinId})
                            </span>
                          )}
                        </div>
                        <p className="mt-1 leading-snug text-[11px] break-words text-foreground/90 font-medium">
                          {diag.message}
                        </p>
                      </div>
                    </div>

                    {hasTargetNode && (
                      <span title="Locate and inspect node">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onPress={() => onFocusNode(diag.nodeId!)}
                          aria-label="Locate node"
                        >
                          <Crosshair className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

