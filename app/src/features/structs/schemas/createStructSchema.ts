import { z } from "zod";

export const createStructSchema = z.object({
    name: z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(100, "Name must not exceed 100 characters")
        .regex(/^[a-zA-Z0-9_\s-]+$/, "Name can only contain alphanumeric characters, spaces, underscores, and hyphens"),
});

export type CreateStructInput = z.infer<typeof createStructSchema>;
