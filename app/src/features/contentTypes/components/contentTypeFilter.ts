import { z } from "zod";
import { defineFilterConfig } from "@/components/filter-panel";

export const contentTypeFilterSchema = z.object({
  name: z.string().optional(),
});

export const contentTypeFilterConfig = defineFilterConfig(contentTypeFilterSchema, {
  fields: {
    name: { label: "Name", fieldType: "text", placeholder: "Search..." },
  },
  quickFilters: [],
});
