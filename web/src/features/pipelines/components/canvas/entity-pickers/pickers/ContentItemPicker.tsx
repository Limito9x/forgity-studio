import { useState, useMemo } from "react";
import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { useLookupContentItems } from "@/features/contentItems/hooks/useContentItems";
import { Badge } from "@/components/ui/badge";
import { X, Layers, Box } from "lucide-react";
import type { EntityPickerProps } from "../types";

export function ContentItemPicker({
  effectiveProjectId = "",
  value,
  onChange,
  placeholder = "Select content item...",
  disabled = false,
  multiple = false,
}: EntityPickerProps) {
  // 1. ContentType filter on top (equivalent to Workstation filter in ResourcePicker)
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>("");

  const { data: contentTypesData, isLoading: isTypesLoading } = useContentTypes(
    { pageSize: 100, page: 1 } as any,
    effectiveProjectId,
    { enabled: Boolean(effectiveProjectId) }
  );

  const rawTypes = Array.isArray(contentTypesData)
    ? contentTypesData
    : (contentTypesData as any)?.items || [];

  const typeOptions = useMemo(() => {
    const opts = rawTypes.map((ct: any) => ({
      label: ct.displayName
        ? `${ct.displayName} (${ct.name || ct.key})`
        : ct.name || ct.key || ct.id,
      value: ct.id,
    }));
    return [{ label: "All Content Types", value: "" }, ...opts];
  }, [rawTypes]);

  // 2. Query ContentItems scoped by selectedContentTypeId
  const { data: contentItemsData, isLoading: isItemsLoading } = useLookupContentItems(
    effectiveProjectId,
    {
      contentTypeId: selectedContentTypeId || undefined,
      limit: 100,
    },
    { enabled: Boolean(effectiveProjectId) }
  );

  const rawItems = Array.isArray(contentItemsData) ? contentItemsData : [];

  const itemMap = useMemo(() => {
    const map = new Map<string, any>();
    rawItems.forEach((item: any) => map.set(item.id, item));
    return map;
  }, [rawItems]);

  // 3. Normalize selected value(s)
  const selectedIds: string[] = useMemo(() => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === "string" && value.trim()) {
      if (value.startsWith("[")) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {}
      }
      return [value];
    }
    return [];
  }, [value]);

  const availableItems = useMemo(() => {
    return rawItems
      .filter((item: any) => !selectedIds.includes(item.id))
      .map((item: any) => ({
        label: item.contentTypeName
          ? `${item.name} (${item.contentTypeName})`
          : item.name,
        value: item.id,
      }));
  }, [rawItems, selectedIds]);

  const handleAddItem = (itemId: string) => {
    if (!itemId) return;
    if (multiple) {
      if (!selectedIds.includes(itemId)) {
        onChange([...selectedIds, itemId]);
      }
    } else {
      onChange(itemId);
    }
  };

  const handleRemoveItem = (idToRemove: string) => {
    if (multiple) {
      onChange(selectedIds.filter((id) => id !== idToRemove));
    } else {
      onChange(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Scope Filter: ContentType Combobox */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Layers className="h-3 w-3 text-primary" />
          <span>Filter by Content Type</span>
        </div>
        <BaseCombobox
          items={typeOptions}
          value={selectedContentTypeId}
          onValueChange={(val) => setSelectedContentTypeId(val || "")}
          placeholder={isTypesLoading ? "Loading types..." : "All Content Types"}
          disabled={disabled || isTypesLoading}
        />
      </div>

      {/* Target ContentItems Combobox */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Box className="h-3 w-3 text-primary" />
          <span>{multiple ? "Add Content Items" : "Select Content Item"}</span>
        </div>
        <BaseCombobox
          items={availableItems}
          value={multiple ? undefined : selectedIds[0]}
          onValueChange={(val) => {
            if (val) handleAddItem(val);
          }}
          placeholder={
            isItemsLoading
              ? "Loading content items..."
              : availableItems.length === 0 && selectedContentTypeId
              ? "No items in this Content Type"
              : placeholder
          }
          isLoading={isItemsLoading}
          disabled={disabled || isItemsLoading}
          emptyText={isItemsLoading ? "Loading..." : "No matching items found."}
        />
      </div>

      {/* Selected Items Badges (when multiple) */}
      {multiple && selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedIds.map((id) => {
            const item = itemMap.get(id);
            const label = item?.name
              ? `${item.name}${item.contentTypeName ? ` (${item.contentTypeName})` : ""}`
              : id;
            return (
              <Badge
                key={id}
                variant="secondary"
                className="gap-1 pl-2 pr-1 py-0.5 text-xs font-normal border border-border/80"
              >
                <span className="truncate max-w-[200px]">{label}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(id)}
                  className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
