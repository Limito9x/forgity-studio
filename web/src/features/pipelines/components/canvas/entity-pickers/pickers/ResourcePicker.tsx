import type { EntityPickerProps } from "../types";
import { ResourceWorkstationSelect } from "../../ResourceWorkstationSelect";

export function ResourcePicker({
  effectiveProjectId = "",
  value,
  onChange,
  disabled = false,
  multiple = false,
}: EntityPickerProps) {
  return (
    <ResourceWorkstationSelect
      projectId={effectiveProjectId}
      value={value}
      onChange={onChange}
      disabled={disabled}
      multiple={multiple}
    />
  );
}

