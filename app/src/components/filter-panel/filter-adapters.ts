import { Temporal } from "@js-temporal/polyfill"
import type { FilterField } from "@/gen/model"
import type { FieldAdapter } from "./filter-types"

function serializeValue(val: unknown): string {
  if (val instanceof Temporal.PlainDate) return val.toString()
  return String(val)
}

/**
 * Adapter mặc định:
 * - Serialize: Sử dụng operator "Contains".
 * - Parse: Lấy value của field đầu tiên.
 */
export const defaultAdapter: FieldAdapter<string> = {
  serialize: (fieldName, value) => {
    return [{ field: fieldName, operator: "Contains", value: serializeValue(value) }]
  },
  parse: (fields) => {
    return fields[0]?.value as string
  }
}

/**
 * Adapter so khớp chính xác:
 * - Serialize: Sử dụng operator "Equal".
 * - Parse: Lấy value của field đầu tiên.
 */
export const exactMatchAdapter: FieldAdapter<string> = {
  serialize: (fieldName, value) => {
    return [{ field: fieldName, operator: "Equal", value: serializeValue(value) }]
  },
  parse: (fields) => {
    return fields[0]?.value as string
  }
}

/**
 * Adapter xử lý khoảng thời gian (DateRange).
 * - Serialize: Tách thành 2 field (GreaterThanOrEqual cho 'from', LessThanOrEqual cho 'to').
 * - Parse: Gộp 2 field lại thành một object { from: Temporal.PlainDate, to: Temporal.PlainDate }.
 */
export const dateRangeAdapter: FieldAdapter<{ from?: Temporal.PlainDate; to?: Temporal.PlainDate }> = {
  serialize: (fieldName, value) => {
    const filterFields: FilterField[] = []
    
    if (value.from) {
      const plainStr = Temporal.PlainDate.from(value.from.toString())
      filterFields.push({ field: fieldName, operator: "GreaterThanOrEqual", value: `${plainStr}T00:00:00Z` })
    }
    if (value.to) {
      const plainStr = Temporal.PlainDate.from(value.to.toString())
      filterFields.push({ field: fieldName, operator: "LessThanOrEqual", value: `${plainStr}T23:59:59.999Z` })
    }

    return filterFields
  },
  parse: (fields) => {
    const result: { from?: Temporal.PlainDate; to?: Temporal.PlainDate } = {}
    
    for (const f of fields) {
      if (f.operator === "GreaterThanOrEqual" || f.operator === "LessThanOrEqual") {
        // Strip time component (e.g. T00:00:00Z) if it exists and convert to Temporal.PlainDate
        const dateStr = typeof f.value === 'string' ? f.value.split('T')[0] : String(f.value);
        const dateObj = Temporal.PlainDate.from(dateStr);
        
        if (f.operator === "GreaterThanOrEqual") result.from = dateObj
        if (f.operator === "LessThanOrEqual") result.to = dateObj
      }
    }

    return result
  }
}
