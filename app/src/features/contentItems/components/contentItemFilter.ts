import { z } from "zod";
import { defineFilterConfig } from "@/components/filter-panel";

export const contentItemFilterSchema = z.object({
  name: z.string().optional(),
});

export const contentItemFilterConfig = defineFilterConfig(contentItemFilterSchema, {
  fields: {
    name: { label: "Name", fieldType: "text", placeholder: "Search..." },
  },
  quickFilters: [],
});
