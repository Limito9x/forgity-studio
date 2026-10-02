import { type MouseEvent } from "react";
import { Handle, Position } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPinVisual, formatPinTypeLabel } from "../types";

interface PinInputRowProps {
  pin: PinDefinition;
  pinId: string;
  hasConfig?: boolean;
  canRemove?: boolean;
  onRemove?: (e: MouseEvent, pinId: string) => void;
}

export function PinInputRow({
  pin,
  pinId,
  hasConfig = false,
  canRemove = false,
  onRemove,
}: PinInputRowProps) {
  const visual = getPinVisual(pin.primitiveType);
  const typeBadge = formatPinTypeLabel(pin.primitiveType, pin.cardinality);

  return (
    <div className="relative flex items-center gap-2 group/pin py-0.5">
      <Handle
        type="target"
        position={Position.Left}
        id={pinId}
        style={{
          backgroundColor: visual.hex,
          borderColor: "var(--background)",
          borderWidth: 2,
          width: 13,
          height: 13,
          left: -19,
          zIndex: 40,
        }}
        className="!cursor-crosshair !pointer-events-auto shadow-md transition-transform hover:scale-125"
      />
      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
        <span
          className="font-medium text-[11px] text-foreground/90 truncate"
          title={`${pin.label || pinId} (${typeBadge})`}
        >
          {pin.label || pinId}
          {pin.isRequired && <span className="text-destructive ml-0.5">*</span>}
        </span>
        <span className={cn("text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-muted/60", visual.textClass)}>
          {typeBadge}
        </span>
        {hasConfig && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Configured statically" />
        )}
        {canRemove && onRemove && (
          <button
            type="button"
            onClick={(e) => onRemove(e, pinId)}
            className="opacity-0 group-hover/pin:opacity-100 text-muted-foreground/60 hover:text-destructive transition-opacity p-0.5 rounded"
            title="Remove Pin"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

interface PinOutputRowProps {
  pin: PinDefinition;
  pinId: string;
}

export function PinOutputRow({ pin, pinId }: PinOutputRowProps) {
  const visual = getPinVisual(pin.primitiveType);
  const typeBadge = formatPinTypeLabel(pin.primitiveType, pin.cardinality);

  return (
    <div className="relative flex items-center justify-end gap-2 group/pin py-0.5">
      <div className="min-w-0 flex items-center justify-end gap-1.5 flex-wrap">
        <span className={cn("text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-muted/60", visual.textClass)}>
          {typeBadge}
        </span>
        <span
          className="font-medium text-[11px] text-foreground/90 truncate"
          title={`${pin.label || pinId} (${typeBadge})`}
        >
          {pin.label || pinId}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id={pinId}
        style={{
          backgroundColor: visual.hex,
          borderColor: "var(--background)",
          borderWidth: 2,
          width: 13,
          height: 13,
          right: -19,
          zIndex: 40,
        }}
        className="!cursor-crosshair !pointer-events-auto shadow-md transition-transform hover:scale-125"
      />
    </div>
  );
}
