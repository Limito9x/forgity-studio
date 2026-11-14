import { z } from "zod"
import type { GlobalFieldRegistry, FieldDefinition } from "@/lib/field-registry"
import type { FilterOption } from "@/components/table/QuickFilterChip"

// ─── Filter operators ─────────────────────────────────────────────────────────
export type FilterOperator = "Equal" | "NotEqual" | "Contains" | "GreaterThan" | "GreaterThanOrEqual" | "LessThan" | "LessThanOrEqual"

// ─── Field Adapter ────────────────────────────────────────────────────────────
import type { FilterField } from "@/gen/model"

export interface FieldAdapter<TValue = any> {
  /** Chuyển đổi từ Form Value sang mảng FilterField để gửi lên API */
  serialize: (fieldName: string, value: TValue) => FilterField[]
  /** Chuyển đổi từ mảng FilterField (trên URL/API) về lại Form Value */
  parse: (fields: FilterField[]) => TValue
}

// ─── Field Types available in filter forms ────────────────────────────────────
export type FilterFieldType = keyof GlobalFieldRegistry | string

// ─── Single field definition ──────────────────────────────────────────────────
export interface FilterFieldDef {
  /** Label hiển thị trong advanced form và chip */
  label: string
  /** Loại form control để render */
  fieldType: FilterFieldType
  /**
   * Adapter tùy chỉnh để serialize/parse giá trị.
   * Nếu không truyền, mặc định sẽ dùng defaultAdapter (Contains).
   */
  adapter?: FieldAdapter
  /** Placeholder cho text input */
  placeholder?: string
  /**
   * Options bắt buộc khi fieldType = "select".
   */
  options?: FilterOption[]
  /** Các props bổ sung truyền vào form control */
  fieldConfig?: Record<string, unknown>
}

// ─── UI Config typed strictly to Schema keys ─────────────────────────────────
export type FilterUIConfig<TKeys extends string> = {
  /** Map toàn bộ các field có trong Zod schema với giao diện */
  fields: Record<TKeys, FilterFieldDef>
  /** Danh sách field hiển thị như Quick Filter chip bên ngoài */
  quickFilters?: TKeys[]
}

// ─── Internal resolved shape (sau khi qua defineFilterConfig) ────────────────
export interface ResolvedFilterConfig<TSchema extends z.ZodObject<any> = z.ZodObject<any>> {
  schema: TSchema
  fields: Record<string, FilterFieldDef>
  quickFilterFields: string[]
  advancedFields: string[]
  formFields: FieldDefinition<any>[]
}
