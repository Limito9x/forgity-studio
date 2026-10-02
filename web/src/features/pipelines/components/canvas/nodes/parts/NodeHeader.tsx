import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeHeaderProps {
  icon: ReactNode;
  iconBgClass?: string;
  headerBgClass?: string;
  title: string;
  subtitle: string;
  badgeLabel?: string | null;
  badgeVariantClass?: string;
  status?: "idle" | "running" | "succeeded" | "failed";
}

export function NodeHeader({
  icon,
  iconBgClass = "bg-purple-500/15 text-purple-500",
  headerBgClass = "border-border/70 bg-muted/50",
  title,
  subtitle,
  badgeLabel,
  badgeVariantClass,
  status = "idle",
}: NodeHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b px-3.5 py-2.5 rounded-t-xl",
        headerBgClass
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-inner",
            iconBgClass
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-xs text-foreground" title={title}>
            {title}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground font-mono">
            {subtitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {badgeLabel && (
          <Badge
            variant="outline"
            className={cn("h-5 px-1.5 text-[9px] font-mono", badgeVariantClass)}
          >
            {badgeLabel}
          </Badge>
        )}
        {status === "running" && <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />}
        {status === "succeeded" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        {status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
      </div>
    </div>
  );
}
