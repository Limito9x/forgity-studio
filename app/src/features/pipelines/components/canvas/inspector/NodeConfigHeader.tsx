import { memo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Trash2, X, PlayCircle, Box, FileCode, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeConfigHeaderProps {
  label: string;
  kind?: string;
  executor?: string | null;
  isLifecycleEntry: boolean;
  isReadOnly: boolean;
  onDelete: () => void;
  onClose: () => void;
  onRenameLabel?: (newLabel: string) => void;
}

export const NodeConfigHeader = memo(function NodeConfigHeader({
  label,
  kind,
  executor,
  isLifecycleEntry,
  isReadOnly,
  onDelete,
  onClose,
  onRenameLabel,
}: NodeConfigHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label || "");

  useEffect(() => {
    setEditValue(label || "");
    setIsEditing(false);
  }, [label]);

  const handleSaveRename = () => {
    if (editValue.trim() && editValue.trim() !== label) {
      onRenameLabel?.(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveRename();
    } else if (e.key === "Escape") {
      setEditValue(label || "");
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
        <div
          className={cn(
            "p-2 rounded-xl border flex items-center justify-center shadow-sm shrink-0",
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
        <div className="min-w-0 flex-1">
          {isEditing && !isReadOnly && !isLifecycleEntry ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={handleKeyDown}
                className="h-6 text-xs px-1.5 py-0.5 rounded bg-background border border-primary text-foreground font-semibold w-full focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveRename}
                className="p-1 rounded text-primary hover:bg-primary/10"
                title="Save label"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <h3
                className={cn(
                  "text-sm font-semibold text-foreground truncate",
                  !isReadOnly && !isLifecycleEntry && "cursor-pointer hover:text-primary transition-colors"
                )}
                title={label}
                onDoubleClick={() => !isReadOnly && !isLifecycleEntry && setIsEditing(true)}
              >
                {label || "Node Properties"}
              </h3>
              {!isReadOnly && !isLifecycleEntry && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity"
                  title="Rename node"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

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
