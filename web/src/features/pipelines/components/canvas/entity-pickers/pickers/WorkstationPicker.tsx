import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import {
  useProjectWorkstations,
  type WorkstationRootDto,
} from "@/features/repositories/hooks/useRepositories";
import type { EntityPickerProps } from "../types";

export function WorkstationPicker({
  effectiveProjectId = "",
  value,
  onChange,
  placeholder = "Select workstation...",
  disabled,
}: EntityPickerProps) {
  const { data: workstationsData, isLoading } =
    useProjectWorkstations(effectiveProjectId);

  const list = Array.isArray(workstationsData)
    ? (workstationsData as WorkstationRootDto[])
    : [];

  const items = list.map((w) => ({
    label: `${w.repositoryName} @ ${w.runnerName} (${w.rootPath})`,
    value: w.repositoryRunnerId,
    description: w.rootPath,
  }));

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={isLoading ? "Loading workstations..." : placeholder}
        isLoading={isLoading}
        disabled={disabled || isLoading}
        emptyText={isLoading ? "Loading..." : "No workstations found for this project."}
      />
    </div>
  );
}

