import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useTags } from "@/features/tags/hooks/useTags";
import type { EntityPickerProps } from "../types";

export function TagPicker({
  value,
  onChange,
  placeholder = "Select tag...",
  disabled,
}: EntityPickerProps) {
  const { data: tagsData, isLoading } = useTags(undefined, { enabled: true });
  const list = Array.isArray(tagsData) ? tagsData : [];

  const items = list.map((t: any) => ({
    label: t.path ? `${t.path}` : t.name,
    value: t.path || t.id,
  }));

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={isLoading ? "Loading tags..." : placeholder}
        isLoading={isLoading}
        disabled={disabled || isLoading}
        emptyText={isLoading ? "Loading..." : "No tags found."}
      />
    </div>
  );
}

