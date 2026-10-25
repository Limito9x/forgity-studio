import { useParams } from "@tanstack/react-router";
import { useOptionalProject } from "@/features/projects/context/ProjectContext";
import { getEntityPicker } from "./entity-pickers/registry";
import { AlertTriangle } from "lucide-react";

export interface EntityPinSelectProps {
  entityType?: string;
  target?: string | null;
  projectId?: string;
  value?: any;
  onChange: (value: any) => void;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export function EntityPinSelect({
  entityType = "",
  target,
  projectId = "",
  value,
  onChange,
  placeholder,
  disabled = false,
  multiple = false,
}: EntityPinSelectProps) {
  const projectCtx = useOptionalProject();
  const routeParams = useParams({ strict: false }) as { projectId?: string };
  const effectiveProjectId = projectId || projectCtx?.projectId || routeParams?.projectId || "";

  const resolvedTarget = (target || entityType || "").trim();

  if (!resolvedTarget) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-500">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold block">Missing Entity Target</span>
          <span className="text-[11px] text-muted-foreground block leading-tight">
            This pin is an Entity Reference without a configured struct type or entity target. Please wire an input edge or configure its schema.
          </span>
        </div>
      </div>
    );
  }

  const Picker = getEntityPicker(resolvedTarget);

  return (
    <Picker
      effectiveProjectId={effectiveProjectId}
      value={value}
      onChange={onChange}
      placeholder={placeholder || `Select ${resolvedTarget}...`}
      disabled={disabled}
      multiple={multiple}
    />
  );
}
