import type { ResolvedFilterConfig } from "./filter-types"
import type { FilterField } from "@/gen/model"
import { defaultAdapter, exactMatchAdapter } from "./filter-adapters"

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isEmpty(val: unknown): boolean {
  return val === undefined || val === null || val === "" || val === "__none__" || val === "__all__"
}

// ─── Main builder ─────────────────────────────────────────────────────────────
/**
 * Build Filter Array từ JSON object (Zod output).
 */
export function buildFilterArray(
  filters: Record<string, unknown>,
  config?: ResolvedFilterConfig
): Array<FilterField> {
  if (!config) return []
  const filterFields: Array<FilterField> = []

  // All filters
  for (const [fieldName, value] of Object.entries(filters)) {
    if (isEmpty(value)) continue

    const fieldDef = config.fields[fieldName]
    if (!fieldDef) continue // ignore if not in config
    
    let adapter = fieldDef.adapter
    
    // Nếu field không định nghĩa adapter, fallback:
    if (!adapter) {
      const isQuickFilter = config.quickFilterFields.includes(fieldName)
      adapter = isQuickFilter ? exactMatchAdapter : defaultAdapter
    }

    const fields = adapter.serialize(fieldName, value)
    filterFields.push(...fields)
  }

  return filterFields
}

/**
 * Parse ngược Filter Array thành object cho React Hook Form.
 */
export function parseFilterArray(
  filterFields?: Array<FilterField> | null,
  config?: ResolvedFilterConfig
): Record<string, unknown> {
  if (!filterFields || !Array.isArray(filterFields) || !config) return {}
  const filters: Record<string, unknown> = {}

  // Group các filter theo fieldName (vì một field có thể trả về nhiều FilterField)
  const groupedFields: Record<string, FilterField[]> = {}
  for (const f of filterFields) {
    if (!groupedFields[f.field]) groupedFields[f.field] = []
    groupedFields[f.field].push(f)
  }

  for (const [fieldName, fields] of Object.entries(groupedFields)) {
    const fieldDef = config.fields[fieldName]
    if (!fieldDef) continue

    let adapter = fieldDef.adapter
    if (!adapter) {
      const isQuickFilter = config.quickFilterFields.includes(fieldName)
      adapter = isQuickFilter ? exactMatchAdapter : defaultAdapter
    }

    filters[fieldName] = adapter.parse(fields)
  }

  return filters
}
