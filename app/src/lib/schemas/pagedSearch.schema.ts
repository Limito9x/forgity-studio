import { z } from "zod";
import { type FilterField } from "@/gen/model";

export const zFilterField = z.object({
  field: z.string(),
  operator: z.enum(['Equal', 'NotEqual', 'Contains', 'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual']),
  value: z.string()
});

/**
 * Tạo một Zod Schema chuẩn cho các trang danh sách (Pagination + Filtering).
 * Tự động lọc bỏ các filter không hợp lệ dựa trên cấu hình `filterableFields`.
 * 
 * @param filterableFields Map cấu hình field nào được phép dùng operator nào.
 */
export function buildPagedSearchSchema(
    filterableFields?: Record<string, readonly FilterField['operator'][]>
) {
    return z.object({
        page: z.coerce.number().int().positive().catch(1).default(1),
        pageSize: z.coerce.number().int().positive().catch(10).default(10),
        sort: z.record(z.string(), z.boolean())
            .optional()
            .catch({})
            .default({})
            .transform(sortMap => {
                if (!sortMap || !filterableFields) return sortMap;
                
                const validSort: Record<string, boolean> = {};
                for (const [key, value] of Object.entries(sortMap)) {
                    if (filterableFields[key]) {
                        validSort[key] = value;
                    } else {
                        if (import.meta.env.DEV) {
                            console.warn(`[PagedSearch] Sort field "${key}" bị từ chối vì không có trong cấu hình.`);
                        }
                    }
                }
                return Object.keys(validSort).length > 0 ? validSort : undefined;
            }),
        globalKeyword: z.string().optional(),
        filters: z.array(z.any())
            .optional()
            .catch([])
            .default([])
            .transform(rawFilters => {
                if (!rawFilters || !filterableFields) return [];
                
                const validFilters: FilterField[] = [];
                for (const raw of rawFilters) {
                    // Cố gắng parse từng filter item theo chuẩn API
                    const parsed = zFilterField.safeParse(raw);
                    if (!parsed.success) {
                        if (import.meta.env.DEV) {
                            console.warn(`[PagedSearch] Filter item bị văng do sai cấu trúc/operator:`, raw);
                        }
                        continue;
                    }
                    
                    const f = parsed.data as FilterField;
                    const allowedOps = filterableFields[f.field];
                    if (!allowedOps) {
                        if (import.meta.env.DEV) {
                            console.warn(`[PagedSearch] Field "${f.field}" bị từ chối vì không có trong cấu hình.`);
                        }
                        continue;
                    }
                    const isValidOp = allowedOps.includes(f.operator);
                    if (!isValidOp) {
                        if (import.meta.env.DEV) {
                            console.warn(`[PagedSearch] Operator "${f.operator}" bị từ chối cho field "${f.field}".`);
                        }
                        continue;
                    }
                    validFilters.push(f);
                }
                return validFilters;
            }),
    });
}