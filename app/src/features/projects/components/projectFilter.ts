import { z } from "zod";
import { defineFilterConfig } from "@/components/filter-panel";

export const projectFilterSchema = z.object({
  name: z.string().optional(),
});

export const projectFilterConfig = defineFilterConfig(projectFilterSchema, {
  fields: {
    name: { label: "Name", fieldType: "text", placeholder: "Search..." },
  },
  quickFilters: [],
});
