import { defineFilterConfig } from "@/components/filter-panel/filter-config";
import { z } from "zod"
import i18n from "@/lib/i18n";

const roleFilterSchema = z.object({
    name: z.string()
})

export const roleFilterConfig = defineFilterConfig(roleFilterSchema, {
    fields: {
        name: {
            label: i18n.t("role:fields.name", { defaultValue: "Name" }),
            fieldType: "text",
        },
    },
});
