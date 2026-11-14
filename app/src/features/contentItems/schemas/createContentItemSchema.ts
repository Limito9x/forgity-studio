import { z } from "zod";

export const createContentItemSchema = z.object({
    name: z.string().min(1),
});

export type CreateContentItemInput = z.input<typeof createContentItemSchema>;
export type CreateContentItemOutput = z.output<typeof createContentItemSchema>;
