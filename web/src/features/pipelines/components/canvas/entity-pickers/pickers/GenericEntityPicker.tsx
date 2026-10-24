import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import type { EntityPickerProps } from "../types";

export function GenericEntityPicker({
  value,
  onChange,
  placeholder = "Select entity...",
  disabled,
}: EntityPickerProps) {
  const items = value ? [{ label: String(value), value: String(value) }] : [];

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={placeholder}
        disabled={disabled}
        emptyText="No options available."
      />
    </div>
  );
}

