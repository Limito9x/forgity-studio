import { z } from 'zod'

export const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const resetPasswordSearchSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
})