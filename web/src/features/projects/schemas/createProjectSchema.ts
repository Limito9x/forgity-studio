import { z } from "zod";

export const createProjectSchema = z.object({
    name: z.string().min(1, "Name is required"),
    slug: z
        .string()
        .optional()
        .refine(
            (val) => !val || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val),
            {
                message: "Slug must contain only lowercase letters, numbers, and hyphens",
            }
        ),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectOutput = z.output<typeof createProjectSchema>;

