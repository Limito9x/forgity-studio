import { z } from "zod";

export const updateStudioSchema = z.object({
  name: z.string().min(2, "Studio name must be at least 2 characters").max(255),
  description: z.string().max(500).optional().or(z.literal("")),
});

export type UpdateStudioInput = z.input<typeof updateStudioSchema>;
export type UpdateStudioOutput = z.output<typeof updateStudioSchema>;
