import { z } from "zod";

export const createStudioSchema = z.object({
  name: z.string().min(2, "Studio name must be at least 2 characters").max(255),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]*$/, "Slug can only contain lowercase letters, numbers, and hyphens")
    .optional()
    .or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
});

export type CreateStudioInput = z.input<typeof createStudioSchema>;
export type CreateStudioOutput = z.output<typeof createStudioSchema>;
