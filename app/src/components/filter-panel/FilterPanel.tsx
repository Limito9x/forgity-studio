import { cn } from "@/lib/utils"
import type { ResolvedFilterConfig } from "./filter-types"
import { SearchInput } from "./SearchInput"
import { AdvancedFilters } from "./AdvancedFilters"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMemo, useCallback } from "react"
import { buildFilterArray, parseFilterArray } from "./build-filter-array"
import type { FilterField } from "@/gen/model"

export interface FilterPanelProps {
  keyword: string
  onKeywordChange: (value: string) => void

  config: ResolvedFilterConfig
  filters?: FilterField[] | null
  onFiltersApply: (filters: FilterField[]) => void

  searchPlaceholder?: string
  hideAdvanced?: boolean
  className?: string
}

export function FilterPanel({
  keyword,
  onKeywordChange,
  config,
  filters,
  onFiltersApply,
  searchPlaceholder,
  hideAdvanced = false,
  className,
}: FilterPanelProps) {
  const advancedValues = useMemo(
    () => parseFilterArray(filters, config),
    [filters, config]
  )

  const handleAdvancedChange = useCallback(
    (formValues: Record<string, unknown>) => {
      const newFilters = buildFilterArray(formValues, config)
      onFiltersApply(newFilters)
    },
    [config, onFiltersApply]
  )

  const isAdvancedActive = advancedValues && Object.values(advancedValues).some(v => v !== undefined && v !== null && v !== "")
  
  const form = useForm({
    resolver: zodResolver(config.schema),
    values: advancedValues,
  })

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <SearchInput
        value={keyword}
        onChange={onKeywordChange}
        onClear={() => onKeywordChange("")}
        placeholder={searchPlaceholder}
      />
      {!hideAdvanced && config.formFields && config.formFields.length > 0 && (
        <AdvancedFilters
          form={form}
          fields={config.formFields}
          onChange={handleAdvancedChange}
          isActive={isAdvancedActive}
        />
      )}
    </div>
  )
}

