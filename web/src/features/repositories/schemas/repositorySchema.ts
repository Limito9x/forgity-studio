import { z } from "zod";

export const createRepositorySchema = z.object({
  name: z.string().min(1, "Repository name is required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
});

export type CreateRepositoryInput = z.input<typeof createRepositorySchema>;
export type CreateRepositoryOutput = z.output<typeof createRepositorySchema>;

export const attachRunnerSchema = z.object({
  runnerId: z.string().min(1, "Please select a Runner"),
  rootPath: z.string().min(1, "Root path is required"),
});

export type AttachRunnerInput = z.input<typeof attachRunnerSchema>;
export type AttachRunnerOutput = z.output<typeof attachRunnerSchema>;
