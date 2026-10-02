import { type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeCardProps {
  selected?: boolean;
  status?: "idle" | "running" | "succeeded" | "failed";
  executionError?: string | null;
  borderThemeClass?: string;
  className?: string;
  children: ReactNode;
}

export function NodeCard({
  selected,
  status = "idle",
  executionError,
  borderThemeClass,
  className,
  children,
}: NodeCardProps) {
  return (
    <div
      className={cn(
        "group relative min-w-[300px] max-w-[380px] rounded-xl border bg-card shadow-md transition-[border-color,box-shadow] duration-150 select-none",
        selected ? "border-primary ring-2 ring-primary/40 shadow-primary/15" : "border-border/80 hover:border-primary/50",
        borderThemeClass,
        status === "running" && "border-amber-500 ring-2 ring-amber-500/40 animate-pulse",
        status === "succeeded" && "border-emerald-500/90 ring-1 ring-emerald-500/20",
        status === "failed" && "border-destructive ring-2 ring-destructive/40",
        className
      )}
    >
      {children}

      {/* Node Error Banner at the bottom */}
      {(status === "failed" || executionError) && (
        <div className="rounded-b-xl border-t border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-start gap-1.5 animate-in fade-in">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="leading-tight break-words flex-1 font-medium">
            {executionError || "Execution failed on this node."}
          </span>
        </div>
      )}
    </div>
  );
}
