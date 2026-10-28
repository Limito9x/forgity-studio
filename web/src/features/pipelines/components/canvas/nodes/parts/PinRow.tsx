import { type MouseEvent } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";
import { X, AlertCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPinVisual, formatPinTypeLabel } from "../types";
import { useNodeDiagnostics } from "@/features/pipelines/form-scope/PipelineFormScope";

interface PinInputRowProps {
  nodeId?: string;
  pin: PinDefinition;
  pinId: string;
  hasConfig?: boolean;
  isUnbound?: boolean;
  canRemove?: boolean;
  onRemove?: (e: MouseEvent, pinId: string) => void;
}

export function PinInputRow({
  nodeId: explicitNodeId,
  pin,
  pinId,
  hasConfig = false,
  isUnbound = false,
  canRemove = false,
  onRemove,
}: PinInputRowProps) {
  const contextNodeId = useNodeId();
  const effectiveNodeId = explicitNodeId || contextNodeId || undefined;
  const { getPinDiagnostics } = useNodeDiagnostics(effectiveNodeId);
  const pinDiagnostics = getPinDiagnostics(pinId);

  const hasPinError = pinDiagnostics.some((d) => d.severity === "Error");
  const hasPinWarning = !hasPinError && pinDiagnostics.some((d) => d.severity === "Warning");
  const pinTooltip = pinDiagnostics.map((d) => d.message).join("\n");

  const visual = getPinVisual(pin.primitiveType);
  const typeBadge = formatPinTypeLabel(pin.primitiveType, pin.cardinality);

  return (
    <div className="relative flex items-center gap-2 group/pin py-0.5">
      <Handle
        type="target"
        position={Position.Left}
        id={pinId}
        style={{
          backgroundColor: hasPinError ? "#ef4444" : visual.hex,
          borderColor: hasPinError ? "#f87171" : "var(--background)",
          borderWidth: 2,
          width: 13,
          height: 13,
          left: -19,
          zIndex: 40,
        }}
        className={cn(
          "!cursor-crosshair !pointer-events-auto shadow-md transition-transform hover:scale-125",
          hasPinError && "ring-2 ring-destructive/50"
        )}
      />
      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "font-medium text-[11px] truncate",
            hasPinError
              ? "text-destructive font-semibold"
              : hasPinWarning
                ? "text-amber-600 dark:text-amber-400 font-semibold"
                : "text-foreground/90"
          )}
          title={pinTooltip || `${pin.label || pinId} (${typeBadge})`}
        >
          {pin.label || pinId}
          {pin.isRequired && <span className="text-destructive ml-0.5">*</span>}
        </span>
        <span className={cn("text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-muted/60", visual.textClass)}>
          {typeBadge}
        </span>
        {hasPinError ? (
          <span title={pinTooltip}>
            <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
          </span>
        ) : hasPinWarning ? (
          <span title={pinTooltip}>
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          </span>
        ) : isUnbound ? (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" title="Missing file: requires re-upload" />
        ) : hasConfig ? (
          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Configured statically" />
        ) : null}
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
  nodeId?: string;
  pin: PinDefinition;
  pinId: string;
}

export function PinOutputRow({ nodeId: explicitNodeId, pin, pinId }: PinOutputRowProps) {
  const contextNodeId = useNodeId();
  const effectiveNodeId = explicitNodeId || contextNodeId || undefined;
  const { getPinDiagnostics } = useNodeDiagnostics(effectiveNodeId);
  const pinDiagnostics = getPinDiagnostics(pinId);

  const hasPinError = pinDiagnostics.some((d) => d.severity === "Error");
  const hasPinWarning = !hasPinError && pinDiagnostics.some((d) => d.severity === "Warning");
  const pinTooltip = pinDiagnostics.map((d) => d.message).join("\n");

  const visual = getPinVisual(pin.primitiveType);
  const typeBadge = formatPinTypeLabel(pin.primitiveType, pin.cardinality);

  return (
    <div className="relative flex items-center justify-end gap-2 group/pin py-0.5">
      <div className="min-w-0 flex items-center justify-end gap-1.5 flex-wrap">
        {hasPinError ? (
          <span title={pinTooltip}>
            <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
          </span>
        ) : hasPinWarning ? (
          <span title={pinTooltip}>
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          </span>
        ) : null}
        <span className={cn("text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-muted/60", visual.textClass)}>
          {typeBadge}
        </span>
        <span
          className={cn(
            "font-medium text-[11px] truncate",
            hasPinError
              ? "text-destructive font-semibold"
              : hasPinWarning
                ? "text-amber-600 dark:text-amber-400 font-semibold"
                : "text-foreground/90"
          )}
          title={pinTooltip || `${pin.label || pinId} (${typeBadge})`}
        >
          {pin.label || pinId}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id={pinId}
        style={{
          backgroundColor: hasPinError ? "#ef4444" : visual.hex,
          borderColor: hasPinError ? "#f87171" : "var(--background)",
          borderWidth: 2,
          width: 13,
          height: 13,
          right: -19,
          zIndex: 40,
        }}
        className={cn(
          "!cursor-crosshair !pointer-events-auto shadow-md transition-transform hover:scale-125",
          hasPinError && "ring-2 ring-destructive/50"
        )}
      />
    </div>
  );
}
