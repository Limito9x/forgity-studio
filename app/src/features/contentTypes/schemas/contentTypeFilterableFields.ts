import type { FilterField } from "@/gen/model";

export const CONTENT_TYPE_FILTERABLE_FIELDS = {
    name: ['Contains', 'Equal'],
} as const satisfies Record<string, FilterField['operator'][]>;

export type ContentTypeFilterableField = keyof typeof CONTENT_TYPE_FILTERABLE_FIELDS;
