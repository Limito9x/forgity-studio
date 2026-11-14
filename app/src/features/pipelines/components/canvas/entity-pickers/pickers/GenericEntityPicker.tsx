import { AlertCircle } from "lucide-react";
import type { EntityPickerProps } from "../types";

export function GenericEntityPicker({
  placeholder,
}: EntityPickerProps) {
  return (
    <div className="space-y-1 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-amber-500">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>No Picker Available: {placeholder || "Unknown Entity"}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">
        No dedicated UI picker registered in <code>ENTITY_PICKER_REGISTRY</code> for this entity type. Connect an input edge to pass this entity reference dynamically at runtime.
      </p>
    </div>
  );
}
