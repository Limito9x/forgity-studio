import { z } from "zod";

export const updateRoleSchema = z.object({
    name: z.string().min(1),
});

export type UpdateRoleInput = z.input<typeof updateRoleSchema>;
export type UpdateRoleOutput = z.output<typeof updateRoleSchema>;
