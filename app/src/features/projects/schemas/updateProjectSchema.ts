import { z } from "zod";

export const updateProjectSchema = z.object({
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

export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type UpdateProjectOutput = z.output<typeof updateProjectSchema>;

