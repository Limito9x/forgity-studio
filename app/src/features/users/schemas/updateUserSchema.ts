import { UpdateUserBody } from "@/gen/endpoints/users/users.zod";
import { z } from "zod";

export const updateUserSchema = UpdateUserBody;

export type UpdateUserValues = z.input<typeof updateUserSchema>;