import { z } from "zod"
import { defineFilterConfig, dateRangeAdapter } from "@/components/filter-panel"
import { Temporal } from "@js-temporal/polyfill"

// ─── Filter Schema ────────────────────────────────────────────────────────────
/**
 * Zod schema cho Users table filters.
 * Đóng vai trò là source of truth cho filter form.
 */
export const userFilterSchema = z.object({
  userName: z.string().optional(),
  email: z.string().optional(),
  fullName: z.string().optional(),
  createdAt: z.object({ 
    from: z.instanceof(Temporal.PlainDate).optional(), 
    to: z.instanceof(Temporal.PlainDate).optional() 
  }).optional(),
})

// ─── Filter UI Config ─────────────────────────────────────────────────────────
/**
 * Cấu hình UI giao diện được ràng buộc chặt chẽ bởi userFilterSchema.
 */
export const userFilterConfig = defineFilterConfig(userFilterSchema, {
  fields: {
    userName:  { label: "Username",         fieldType: "text",      placeholder: "e.g. john"          },
    email:     { label: "Email",            fieldType: "text",      placeholder: "e.g. @company.com"  },
    fullName:  { label: "Full Name",        fieldType: "text",      placeholder: "e.g. John Doe"      },
    createdAt: { label: "Created Date",     fieldType: "dateRange", adapter: dateRangeAdapter         },
  },

  // Tạm chưa có quick filter vì status/roles chưa map.
  quickFilters: [],
})
