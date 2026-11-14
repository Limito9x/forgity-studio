import { z } from "zod";

export const updateContentItemSchema = z.object({
    name: z.string().min(1),
});

export type UpdateContentItemInput = z.input<typeof updateContentItemSchema>;
export type UpdateContentItemOutput = z.output<typeof updateContentItemSchema>;
