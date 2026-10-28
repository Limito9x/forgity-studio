import { memo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ModeOption {
  id: string;
  label: string;
}

interface NodeConfigModeSelectorProps {
  currentMode: string;
  refId?: string;
  onSelectMode: (mode: string) => void;
}

export const NodeConfigModeSelector = memo(function NodeConfigModeSelector({
  currentMode,
  refId = "",
  onSelectMode,
}: NodeConfigModeSelectorProps) {
  const options: ModeOption[] =
    refId === "AssignResourcesToContent"
      ? [
          { id: "ByName", label: "By Name / Create" },
          { id: "ByEntityRef", label: "By Entity Ref" },
        ]
      : [
          { id: "ByKey", label: "By Key / Name" },
          { id: "ByEntityRef", label: "By Entity Ref" },
        ];

  const activeMode =
    currentMode ||
    (refId === "AssignResourcesToContent" ? "ByName" : "ByKey");

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Execution Mode</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-background/80 rounded-lg border border-border/50">
        {options.map((opt) => {
          const isActive =
            activeMode.toLowerCase() === opt.id.toLowerCase();
          return (
            <Button
              key={opt.id}
              type="button"
              variant={isActive ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 text-xs font-medium transition-all rounded-md",
                isActive
                  ? "shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onSelectMode(opt.id)}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
});

