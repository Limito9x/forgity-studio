import { z } from "zod";

export const updateContentTypeSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    displayName: z.string().max(255).optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    icon: z.string().max(100).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    sortOrder: z.number().int().default(0),
    displayConfig: z.any().default({}),
}).transform(data => ({
    ...data,
    displayName: data.displayName || data.name
}));

export type UpdateContentTypeInput = z.input<typeof updateContentTypeSchema>;
export type UpdateContentTypeOutput = z.output<typeof updateContentTypeSchema>;
