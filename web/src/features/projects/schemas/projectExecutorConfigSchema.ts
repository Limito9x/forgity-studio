import { z } from "zod";

export const projectExecutorConfigSchema = z
    .object({
        runnerId: z.string().min(1, "Please select a Runner"),
        executorKey: z.string().min(1, "Please select an Executor Engine"),
        fullPathProject: z.string().optional().default(""),
        engineVersion: z.string().optional(),
    })
    .superRefine((val, ctx) => {
        if (val.executorKey === "unreal" && (!val.fullPathProject || val.fullPathProject.trim() === "")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Unreal Engine requires a valid .uproject file path to boot.",
                path: ["fullPathProject"],
            });
        }
    })
    .transform((data) => ({
        runnerId: data.runnerId,
        executorKey: data.executorKey,
        settings: {
            fullPathProject: data.fullPathProject || "",
            ...(data.engineVersion ? { engineVersion: data.engineVersion } : {}),
        },
    }));

export type ProjectExecutorConfigInput = z.input<typeof projectExecutorConfigSchema>;
export type ProjectExecutorConfigOutput = z.output<typeof projectExecutorConfigSchema>;
