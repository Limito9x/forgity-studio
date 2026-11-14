import { z } from "zod";

export const createTagSchema = z.object({
    projectId: z.string().min(1, "Project ID is required"),
    path: z
        .string()
        .min(1, "Tag path is required")
        .regex(
            /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/,
            "Tag path must use dot notation with letters, numbers, and underscores (e.g. Asset.Character.Hero)"
        ),
    color: z.string().optional().default("#3b82f6"),
    description: z.string().max(500).optional(),
});

export type CreateTagInput = z.input<typeof createTagSchema>;
export type CreateTagOutput = z.output<typeof createTagSchema>;
