import type { FilterField } from "@/gen/model";

export const PROJECT_FILTERABLE_FIELDS = {
    name: ['Contains', 'Equal'],
} as const satisfies Record<string, FilterField['operator'][]>;

export type ProjectFilterableField = keyof typeof PROJECT_FILTERABLE_FIELDS;
