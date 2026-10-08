import type { PinDefinition } from "@/gen/model";
import { Badge } from "@/components/ui/badge";

interface PinBadgeProps {
  pin: PinDefinition;
  direction?: "in" | "out";
  compact?: boolean;
}

export function PinBadge({ pin, direction = "in", compact = false }: PinBadgeProps) {
  const typeMap: Record<number, { name: string; color: string }> = {
    0: { name: "string", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    1: { name: "number", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    2: { name: "bool", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    3: { name: "path", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    4: { name: "ref", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
    5: { name: "asset", color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  };

  const primitive = typeof pin.primitiveType === "number" ? pin.primitiveType : 0;
  const isArray = (pin.cardinality as any) === 1 || (pin.cardinality as any) === "Array";
  const isMap = (pin.cardinality as any) === 2 || (pin.cardinality as any) === "Map";
  const typeInfo = typeMap[primitive] || { name: "any", color: "bg-muted text-muted-foreground" };
  const displayType = isMap ? `Map<${typeInfo.name}>` : `${typeInfo.name}${isArray ? "[]" : ""}`;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] border border-border/40 max-w-full">
        <span className="font-mono text-foreground font-medium truncate max-w-[85px]" title={pin.label || pin.id}>
          {pin.label || pin.id}
        </span>
        <span className={`text-[9px] font-mono px-1 py-0 rounded ${typeInfo.color}`}>
          {displayType}
        </span>
        {direction === "in" && pin.isRequired && (
          <span className="text-[10px] text-destructive font-bold leading-none">*</span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <span className="font-mono text-foreground font-medium">{pin.label || pin.id}</span>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-mono ${typeInfo.color}`}>
        {displayType}
      </Badge>
      {direction === "in" && pin.isRequired && (
        <span className="text-[10px] text-destructive font-semibold">*</span>
      )}
      {direction === "in" && pin.defaultValue !== undefined && pin.defaultValue !== null && (
        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[80px]">
          ={String(pin.defaultValue)}
        </span>
      )}
    </div>
  );
}
