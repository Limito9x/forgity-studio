import { z } from "zod";
import { defineFilterConfig } from "@/components/filter-panel";

export const systemSettingFilterSchema = z.object({
  key: z.string().optional(),
  valueType: z.string().optional(),
});

export const systemSettingFilterConfig = defineFilterConfig(systemSettingFilterSchema, {
  fields: {
    key: { label: "Key", fieldType: "text", placeholder: "Search by key..." },
    valueType: { 
      label: "Value Type", 
      fieldType: "select", 
      options: [
        { label: "String", value: "String" },
        { label: "Boolean", value: "Boolean" },
        { label: "Integer", value: "Integer" },
        { label: "Json", value: "Json" }
      ]
    },
  },
  quickFilters: [],
});
