import { useParams } from "@tanstack/react-router";
import { useOptionalProject } from "@/features/projects/context/ProjectContext";
import { getEntityPicker } from "./entity-pickers/registry";

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

  const resolvedTarget = (target || entityType || "Resource").trim();
  const Picker = getEntityPicker(resolvedTarget);

  return (
    <Picker
      effectiveProjectId={effectiveProjectId}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      multiple={multiple}
    />
  );
}
