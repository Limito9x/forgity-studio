import { z } from "zod";
import { defineFilterConfig, exactMatchAdapter } from "@/components/filter-panel";

export const auditLogFilterSchema = z.object({
    action: z.string().optional(),
    entityName: z.string().optional(),
    entityId: z.string().optional(),
    userId: z.string().optional(),
    ipAddress: z.string().optional(),
});

export const auditLogFilterConfig = defineFilterConfig(auditLogFilterSchema, {
    fields: {
        action: { 
            label: "Action", 
            fieldType: "select", 
            adapter: exactMatchAdapter,
            placeholder: "Select action",
            options: [
                { label: "Created", value: "Created" },
                { label: "Updated", value: "Updated" },
                { label: "Deleted", value: "Deleted" },
            ]
        },
        entityName: { label: "Entity Name", fieldType: "text", placeholder: "e.g. User" },
        entityId: { label: "Entity ID", fieldType: "text", placeholder: "e.g. 123" },
        userId: { label: "User ID", fieldType: "text", placeholder: "e.g. admin" },
        ipAddress: { label: "IP Address", fieldType: "text", placeholder: "e.g. 127.0.0.1" },
    },
    quickFilters: [],
});
