import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import type { EntityPickerProps } from "../types";

export function ContentTypePicker({
  effectiveProjectId = "",
  value,
  onChange,
  placeholder = "Select content type...",
  disabled,
}: EntityPickerProps) {
  const { data: contentTypesData, isLoading } = useContentTypes(
    { pageSize: 100, page: 1 } as any,
    effectiveProjectId,
    { enabled: Boolean(effectiveProjectId) }
  );

  const list = Array.isArray(contentTypesData)
    ? contentTypesData
    : (contentTypesData as any)?.items || [];

  const items = list.map((ct: any) => ({
    label: ct.displayName
      ? `${ct.displayName} (${ct.name || ct.key})`
      : ct.name || ct.key || ct.id,
    value: ct.name || ct.key || ct.id,
  }));

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={items}
        value={value ? String(value) : undefined}
        onValueChange={(val) => onChange(val || null)}
        placeholder={isLoading ? "Loading content types..." : placeholder}
        isLoading={isLoading}
        disabled={disabled || isLoading}
        emptyText={isLoading ? "Loading..." : "No content types found."}
      />
    </div>
  );
}

