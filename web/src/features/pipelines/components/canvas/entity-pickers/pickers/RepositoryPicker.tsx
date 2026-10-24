import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import type { EntityPickerProps } from "../types";

export function RepositoryPicker({
  effectiveProjectId = "",
  value,
  onChange,
  placeholder = "Select repository...",
  disabled,
}: EntityPickerProps) {
  const { data: repositoriesData, isLoading } = useRepositories(effectiveProjectId);
  const list = Array.isArray(repositoriesData)
    ? repositoriesData
    : (repositoriesData as any)?.items || [];

  const items = list.map((w: any) => ({
    label: w.name || w.id,
    value: w.id,
  }));

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={isLoading ? "Loading repositories..." : placeholder}
        isLoading={isLoading}
        disabled={disabled || isLoading}
        emptyText={isLoading ? "Loading..." : "No repositories found."}
      />
    </div>
  );
}

