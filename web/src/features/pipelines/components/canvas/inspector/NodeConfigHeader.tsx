import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Trash2, X, PlayCircle, Box, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeConfigHeaderProps {
  label: string;
  kind?: string;
  executor?: string | null;
  isLifecycleEntry: boolean;
  isReadOnly: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export const NodeConfigHeader = memo(function NodeConfigHeader({
  label,
  kind,
  executor,
  isLifecycleEntry,
  isReadOnly,
  onDelete,
  onClose,
}: NodeConfigHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "p-2 rounded-xl border flex items-center justify-center shadow-sm",
            isLifecycleEntry
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-sky-500/10 border-sky-500/20 text-sky-500"
          )}
        >
          {isLifecycleEntry ? (
            <PlayCircle className="h-4 w-4" />
          ) : executor === "System" ? (
            <Box className="h-4 w-4" />
          ) : (
            <FileCode className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate" title={label}>
            {label || "Node Properties"}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge
              variant="outline"
              className="text-[10px] font-mono px-1.5 py-0 h-4 border-border/60"
            >
              {kind || "Custom"}
            </Badge>
            {executor && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {executor}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {isReadOnly && (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px] gap-1 px-1.5 py-0 font-medium"
          >
            Read-Only
          </Badge>
        )}
        {!isLifecycleEntry && !isReadOnly && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete node"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
          title="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
