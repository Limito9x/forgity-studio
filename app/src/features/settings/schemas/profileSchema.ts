import { z } from "zod";
import { UpdateProfileBody } from "@/gen/endpoints/profile/profile.zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required" }),
  lastName: z.string().optional(),
  displayName: z.string().min(1, { message: "Display name is required" }),
  phoneNumber: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
// Giao tiếp với BE qua chuẩn API Orval
export type UpdateProfileOutput = z.infer<typeof UpdateProfileBody>;
