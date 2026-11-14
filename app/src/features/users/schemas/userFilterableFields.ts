import type { FilterField } from '@/gen/model'

/**
 * "Bản sao tay" của GridifyMapper<User>.AddMap() bên BE.
 *
 * - Keys: field name đã được .AddMap() trong GetUsersHandler
 * - Values: operator hợp lý cho field đó (FE-defined, vì Gridify không giới hạn)
 *
 * Khi BE thêm/xóa AddMap -> phải cập nhật file này tương ứng.
 */
export const USER_FILTERABLE_FIELDS = {
  userName:  ['Contains', 'Equal'],
  email:     ['Contains', 'Equal'],
  fullName:  ['Contains', 'Equal'],
  createdAt: ['GreaterThanOrEqual', 'LessThanOrEqual'],
} as const satisfies Record<string, FilterField['operator'][]>

export type UserFilterableField = keyof typeof USER_FILTERABLE_FIELDS

