import type { PinDefinition } from "@/gen/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinCardItemProps {
  pin: PinDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  direction: "in" | "out";
}

export function PinCardItem({
  pin,
  isSelected,
  onSelect,
  onDelete,
  direction,
}: PinCardItemProps) {
  const typeMap: Record<number, { name: string; color: string }> = {
    0: { name: "String", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    1: { name: "Number", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    2: { name: "Boolean", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    3: { name: "Path", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    4: { name: "EntityRef", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
    5: { name: "Asset", color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  };

  const primitive = typeof pin.primitiveType === "number" ? pin.primitiveType : 0;
  const isArray = (pin.cardinality as any) === 1 || (pin.cardinality as any) === "Array";
  const isMap = (pin.cardinality as any) === 2 || (pin.cardinality as any) === "Map";
  const typeInfo = typeMap[primitive] || { name: "Any", color: "bg-muted text-muted-foreground" };
  const displayType = isMap ? `Map<${typeInfo.name}>` : `${typeInfo.name}${isArray ? "[]" : ""}`;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground cursor-pointer transition-all duration-150",
        "hover:border-primary/40 hover:shadow-xs",
        isSelected
          ? "border-primary ring-1 ring-primary bg-primary/5 shadow-xs"
          : "border-border"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <GripVertical className="size-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition" />
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs font-mono truncate text-foreground">
              {pin.id || "unnamed_pin"}
            </span>
            {direction === "in" && pin.isRequired && (
              <span className="text-[10px] text-destructive font-bold" title="Required input">*</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={`text-[9px] px-1 py-0 font-mono ${typeInfo.color}`}>
              {displayType}
            </Badge>
            {pin.label && pin.label !== pin.id && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                {pin.label}
              </span>
            )}
            {direction === "in" && pin.defaultValue !== null && pin.defaultValue !== undefined && (
              <span className="text-[10px] text-muted-foreground/80 font-mono truncate max-w-[100px]">
                ={String(pin.defaultValue)}
              </span>
            )}
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-2"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(e);
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
