import { memo } from "react";
import { AlertCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineDiagnostic } from "@/gen/model";

interface NodeConfigDiagnosticsBannerProps {
  diagnostics: PipelineDiagnostic[];
  errorCount: number;
  warningCount: number;
  hasErrors: boolean;
}

export const NodeConfigDiagnosticsBanner = memo(function NodeConfigDiagnosticsBanner({
  diagnostics,
  errorCount,
  warningCount,
  hasErrors,
}: NodeConfigDiagnosticsBannerProps) {
  if (diagnostics.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 space-y-2 shadow-sm animate-in fade-in",
        hasErrors
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-500/40 bg-amber-500/5"
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold",
            hasErrors ? "text-destructive" : "text-amber-600 dark:text-amber-400"
          )}
        >
          <ShieldAlert className="h-4 w-4" />
          <span>Node Validation Issues</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono">
          {errorCount > 0 && (
            <span className="text-destructive font-semibold">{errorCount} error(s)</span>
          )}
          {errorCount > 0 && warningCount > 0 && <span>•</span>}
          {warningCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {warningCount} warning(s)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5 pt-1 border-t border-border/50">
        {diagnostics.map((diag, idx) => (
          <div
            key={idx}
            className={cn(
              "rounded-lg p-2 text-xs flex items-start gap-2",
              diag.severity === "Error"
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
            )}
          >
            {diag.severity === "Error" ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              {diag.pinId && (
                <span className="block font-mono text-[10px] font-semibold opacity-80 uppercase">
                  Pin: {diag.pinId}
                </span>
              )}
              <p className="leading-snug break-words text-[11px] font-medium">
                {diag.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
