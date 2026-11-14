import { z } from "zod";

export const createRoleSchema = z.object({
    name: z.string().min(1),
});

export type CreateRoleInput = z.input<typeof createRoleSchema>;
export type CreateRoleOutput = z.output<typeof createRoleSchema>;
