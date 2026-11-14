import type { FilterField } from "@/gen/model";

export const CONTENT_ITEM_FILTERABLE_FIELDS = {
    name: ['Contains', 'Equal'],
} as const satisfies Record<string, FilterField['operator'][]>;

export type ContentItemFilterableField = keyof typeof CONTENT_ITEM_FILTERABLE_FIELDS;
