import type { FilterField } from "@/gen/model";

export const ROLE_FILTERABLE_FIELDS = {
    name: ['Contains', 'Equal'],
} as const satisfies Record<string, FilterField['operator'][]>;
