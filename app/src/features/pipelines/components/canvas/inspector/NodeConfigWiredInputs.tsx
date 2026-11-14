import { memo } from "react";
import { Link } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPinVisual } from "../nodes/types";
import type { PinDefinition, PipelineDiagnostic } from "@/gen/model";

interface NodeConfigWiredInputsProps {
  wiredInputs: PinDefinition[];
  wiredInputPinIds: Map<string, { sourceNodeLabel: string; sourcePin: string }>;
  getPinDiagnostics: (pinId: string) => PipelineDiagnostic[];
}

export const NodeConfigWiredInputs = memo(function NodeConfigWiredInputs({
  wiredInputs,
  wiredInputPinIds,
  getPinDiagnostics,
}: NodeConfigWiredInputsProps) {
  if (wiredInputs.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Connected Inputs ({wiredInputs.length})
      </span>
      {wiredInputs.map((pin) => {
        const pinId = pin.id || "";
        const wiredInfo = wiredInputPinIds.get(pinId);
        const pinDiags = getPinDiagnostics(pinId);
        const hasPinError = pinDiags.some((d) => d.severity === "Error");
        const visual = getPinVisual(pin.primitiveType);

        return (
          <div
            key={pinId}
            className={cn(
              "rounded-lg p-3 space-y-1.5",
              hasPinError
                ? "border border-destructive/40 bg-destructive/5"
                : "border border-sky-500/30 bg-sky-500/5 dark:bg-sky-500/10"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground truncate">
                {pin.label || pinId}
              </span>
              <Badge
                variant="outline"
                className={cn("text-[9px] font-mono px-1.5 h-4 font-semibold", visual.textClass)}
              >
                {visual.label}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400 bg-sky-500/10 rounded-md p-2 font-mono">
              <Link className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Connected from{" "}
                <strong className="text-foreground">{wiredInfo?.sourceNodeLabel}</strong> (
                {wiredInfo?.sourcePin})
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
