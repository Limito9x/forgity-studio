import { z } from "zod";

export const bulkTagRowSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(300, "Max 300 characters")
        .regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/, "Use dot notation, each segment letters/numbers/underscores"),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Color must be hex like #3b82f6")
        .nullable()
        .optional()
        .default("#3b82f6"),
});

export const bulkCreateTagSchema = z.object({
    rows: z.array(bulkTagRowSchema).min(1, "Add at least one row").max(50, "Max 50 rows per batch"),
});

export type BulkTagRowInput = z.input<typeof bulkTagRowSchema>;
export type BulkCreateTagInput = z.input<typeof bulkCreateTagSchema>;
export type BulkCreateTagOutput = z.output<typeof bulkCreateTagSchema>;
