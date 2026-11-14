import { z } from "zod"
import type { FilterUIConfig, FilterFieldDef, ResolvedFilterConfig } from "./filter-types"

/**
 * Factory nhận Zod schema làm tiền đề (source of truth) 
 * và cấu hình UI bắt buộc phải type-match với các keys của schema.
 */
export function defineFilterConfig<TSchema extends z.ZodObject<any>>(
  schema: TSchema,
  uiConfig: FilterUIConfig<Extract<keyof z.infer<TSchema>, string>>
): ResolvedFilterConfig<TSchema> {
  const { fields, quickFilters = [] } = uiConfig

  const fieldNames = Object.keys(fields)
  const quickFilterFields = (quickFilters as string[]).filter(n => {
    if (!fieldNames.includes(n)) return false
    // Warn nếu quick filter field thiếu options
    if (import.meta.env.DEV && !(fields as any)[n].options) {
      console.warn(
        `[FilterPanel] Field "${n}" is in quickFilters but has no options. Quick filter chips require options.`
      )
    }
    return true
  })

  const formFields = fieldNames.map(name => {
    const def = (fields as Record<string, FilterFieldDef>)[name]
    return {
      name: name as any,
      label: def.label,
      type: def.fieldType as any,
      config: {
        placeholder: def.placeholder,
        ...(def.options ? { options: def.options } : {}),
        ...def.fieldConfig,
      } as any,
    }
  })

  return {
    schema,
    fields: fields as Record<string, FilterFieldDef>,
    quickFilterFields,
    advancedFields: fieldNames, // tất cả field đều vào advanced
    formFields,
  }
}
