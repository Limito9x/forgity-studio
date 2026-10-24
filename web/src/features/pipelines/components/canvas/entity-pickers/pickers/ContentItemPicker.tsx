import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useLookupContentItems } from "@/features/contentItems/hooks/useContentItems";
import type { EntityPickerProps } from "../types";

export function ContentItemPicker({
  effectiveProjectId = "",
  value,
  onChange,
  placeholder = "Select content item...",
  disabled,
}: EntityPickerProps) {
  const { data: contentItemsData, isLoading } = useLookupContentItems(
    effectiveProjectId,
    { limit: 100 },
    { enabled: Boolean(effectiveProjectId) }
  );

  const list = Array.isArray(contentItemsData) ? contentItemsData : [];

  const items = list.map((item: any) => ({
    label: item.contentTypeName
      ? `${item.name} (${item.contentTypeName})`
      : item.name,
    value: item.id,
  }));

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={isLoading ? "Loading content items..." : placeholder}
        isLoading={isLoading}
        disabled={disabled || isLoading}
        emptyText={isLoading ? "Loading..." : "No content items found."}
      />
    </div>
  );
}

