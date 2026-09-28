import { useState, useMemo } from "react";
import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormSelect, BaseFormField } from "@/components/form-controls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    projectExecutorConfigSchema,
    type ProjectExecutorConfigInput,
    type ProjectExecutorConfigOutput
} from "../schemas/projectExecutorConfigSchema";
import { useRunners, useStudioRunners, type RunnerDto } from "@/features/runners/hooks/useRunners";
import { useGetProjectById } from "@/features/projects/hooks/useProjects";
import { RemoteFileBrowserDialog } from "@/components/custom-ui/file-tree";
import { useTranslation } from "react-i18next";
import { FolderSearch, Info } from "lucide-react";

const EXECUTOR_OPTIONS = [
    { label: "Unreal Engine (.uproject)", value: "unreal" },
    { label: "Blender 3D (.blend)", value: "blender" },
    { label: "Python Automation", value: "python" },
];

interface UpsertProjectExecutorConfigFormProps {
    projectId: string;
    studioId?: string;
    onSubmit: (data: ProjectExecutorConfigOutput) => void;
    defaultValues?: Partial<ProjectExecutorConfigInput>;
}

export function UpsertProjectExecutorConfigForm({
    projectId,
    studioId,
    onSubmit,
    defaultValues,
}: UpsertProjectExecutorConfigFormProps) {
    const { t } = useTranslation("projects");
    const { data: project } = useGetProjectById(projectId);
    const effectiveStudioId = studioId || project?.studioId;
    const { data: studioRunners } = useStudioRunners(effectiveStudioId);
    const { data: allRunners } = useRunners();

    const [browserOpen, setBrowserOpen] = useState(false);

    // Merge studio runners with all system runners to ensure online runners are always selectable
    const runnersData = useMemo(() => {
        const combined = [...(studioRunners || []), ...(allRunners || [])];
        const uniqueMap = new Map<string, RunnerDto>();
        for (const r of combined) {
            if (r && r.id && !uniqueMap.has(r.id)) {
                uniqueMap.set(r.id, r);
            }
        }
        return Array.from(uniqueMap.values());
    }, [studioRunners, allRunners]);

    const runnerOptions = runnersData.length > 0
        ? runnersData.map((r: RunnerDto) => ({
            label: `${r.name || "Runner"} (${r.machineKey || "online"})`,
            value: r.id,
        }))
        : [];

    const form = useForm<ProjectExecutorConfigInput, any, ProjectExecutorConfigOutput>({
        resolver: zodResolver(projectExecutorConfigSchema),
        defaultValues: {
            runnerId: defaultValues?.runnerId || "",
            executorKey: defaultValues?.executorKey || "unreal",
            fullPathProject: defaultValues?.fullPathProject || "",
            engineVersion: defaultValues?.engineVersion || "",
        },
    });

    const selectedRunnerId = form.watch("runnerId");
    const selectedRunner = runnersData.find((r: RunnerDto) => r.id === selectedRunnerId);

    const executorKey = form.watch("executorKey");
    const isUnreal = executorKey === "unreal";
    const isBlender = executorKey === "blender";

    const pathLabel = isUnreal
        ? t("fields.unrealProjectPath", { defaultValue: "Unreal Project File (*.uproject)" })
        : isBlender
        ? t("fields.blenderFilePath", { defaultValue: "Blender File / Startup Scene (Optional)" })
        : t("fields.workingDir", { defaultValue: "Working Directory / Root Folder (Optional)" });

    const pathPlaceholder = isUnreal
        ? "e.g. D:/Projects/MyGame/MyGame.uproject"
        : isBlender
        ? "e.g. D:/Assets/Scene.blend (or leave blank for clean scene)"
        : "e.g. D:/Projects/Scripts or leave blank";

    const pathDescription = isUnreal
        ? "Required. Absolute path to .uproject. Unreal Editor Cmd requires this project context to boot."
        : isBlender
        ? "Optional. Path to a .blend file. Leave empty to execute scripts with a default clean scene."
        : "Optional root directory for script execution.";

    return (
        <>
            <Form form={form} formId="upsert-project-executor-config-form" onSubmit={onSubmit}>
                <FormGrid cols={1} className="gap-4">
                    <FormSelect
                        control={form.control}
                        name="runnerId"
                        label={t("fields.runner", { defaultValue: "Runner Machine" })}
                        placeholder={t("placeholders.selectRunner", { defaultValue: "Select target runner machine..." })}
                        options={runnerOptions}
                        isRequired
                    />

                    <FormSelect
                        control={form.control}
                        name="executorKey"
                        label={t("fields.executor", { defaultValue: "Executor Engine" })}
                        placeholder={t("placeholders.selectExecutor", { defaultValue: "Select executor engine..." })}
                        options={EXECUTOR_OPTIONS}
                        isRequired
                    />

                    <BaseFormField
                        control={form.control}
                        name="fullPathProject"
                        label={pathLabel}
                        description={pathDescription}
                        isRequired={isUnreal}
                        render={(field) => (
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <Input
                                        {...field}
                                        id={field.field_id}
                                        placeholder={pathPlaceholder}
                                        value={field.value ?? ""}
                                        className="flex-1 font-mono text-xs"
                                    />
                                    <div
                                        title={
                                            !selectedRunnerId
                                                ? "Please select a runner machine first"
                                                : "Browse files and directories on runner machine"
                                        }
                                    >
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setBrowserOpen(true)}
                                            isDisabled={!selectedRunnerId}
                                            className="shrink-0 gap-1.5 h-9 px-3 text-xs"
                                        >
                                            <FolderSearch className="size-4 text-primary" />
                                            <span>Browse...</span>
                                        </Button>
                                    </div>
                                </div>
                                {!selectedRunnerId && (
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Info className="size-3 text-amber-500" />
                                        <span>Select a runner machine above to enable remote file browsing.</span>
                                    </p>
                                )}
                            </div>
                        )}
                    />

                    <FormInput
                        control={form.control}
                        name="engineVersion"
                        label={t("fields.engineVersion", { defaultValue: "Target Engine Version (Optional)" })}
                        placeholder={isUnreal ? "e.g. 5.4 or 5.2" : "e.g. 4.2 or 5.2"}
                    />
                </FormGrid>
            </Form>

            {selectedRunnerId && (
                <RemoteFileBrowserDialog
                    open={browserOpen}
                    onOpenChange={setBrowserOpen}
                    runnerId={selectedRunnerId}
                    runnerName={selectedRunner?.name}
                    initialPath={form.getValues("fullPathProject")}
                    mode={isUnreal || isBlender ? "file" : "both"}
                    extensions={isUnreal ? [".uproject"] : isBlender ? [".blend"] : undefined}
                    onSelect={(path) => {
                        form.setValue("fullPathProject", path, { shouldValidate: true, shouldDirty: true });
                    }}
                />
            )}
        </>
    );
}
