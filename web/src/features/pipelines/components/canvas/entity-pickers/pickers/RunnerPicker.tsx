import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useRunners } from "@/features/runners/hooks/useRunners";
import type { EntityPickerProps } from "../types";

export function RunnerPicker({
  value,
  onChange,
  placeholder = "Select runner...",
  disabled,
}: EntityPickerProps) {
  const { data: runnersData = [], isLoading } = useRunners();
  const items = runnersData.map((r: any) => ({
    value: r.id,
    label: `${r.name || r.id} (${r.status || "Unknown"})`,
    disabled: !r.isOnline && !r.isActive && r.status !== "Active" && r.status !== 1,
  }));

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={isLoading ? "Loading runners..." : placeholder}
        isLoading={isLoading}
        disabled={disabled || isLoading}
        emptyText={isLoading ? "Loading..." : "No runners found."}
      />
    </div>
  );
}

