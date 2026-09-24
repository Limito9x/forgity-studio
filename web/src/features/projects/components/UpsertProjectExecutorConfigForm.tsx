import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormSelect } from "@/components/form-controls";
import {
    projectExecutorConfigSchema,
    type ProjectExecutorConfigInput,
    type ProjectExecutorConfigOutput
} from "../schemas/projectExecutorConfigSchema";
import { useRunners, type RunnerDto } from "@/features/runners/hooks/useRunners";
import { useTranslation } from "react-i18next";

const EXECUTOR_OPTIONS = [
    { label: "Unreal Engine (.uproject)", value: "unreal" },
    { label: "Blender", value: "blender" },
    { label: "Python Generic", value: "python" },
    { label: "Autodesk Maya", value: "maya" },
    { label: "3ds Max", value: "3dsmax" },
];

interface UpsertProjectExecutorConfigFormProps {
    onSubmit: (data: ProjectExecutorConfigOutput) => void;
    defaultValues?: Partial<ProjectExecutorConfigInput>;
}

export function UpsertProjectExecutorConfigForm({
    onSubmit,
    defaultValues,
}: UpsertProjectExecutorConfigFormProps) {
    const { t } = useTranslation("projects");
    const { data: runnersData } = useRunners();

    const agentOptions = (runnersData || []).map((r: RunnerDto) => ({
        label: `${r.name} (${r.machineKey})`,
        value: r.id,
    }));

    const form = useForm<ProjectExecutorConfigInput, any, ProjectExecutorConfigOutput>({
        resolver: zodResolver(projectExecutorConfigSchema),
        defaultValues: {
            agentId: defaultValues?.agentId || "",
            executorKey: defaultValues?.executorKey || "unreal",
            fullPathProject: defaultValues?.fullPathProject || "",
            engineVersion: defaultValues?.engineVersion || "",
        },
    });

    return (
        <Form form={form} formId="upsert-project-executor-config-form" onSubmit={onSubmit}>
            <FormGrid cols={1} className="gap-4">
                <FormSelect
                    control={form.control}
                    name="agentId"
                    label={t("fields.agent", { defaultValue: "Agent Machine" })}
                    placeholder={t("placeholders.selectAgent", { defaultValue: "Select target agent machine..." })}
                    options={agentOptions}
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

                <FormInput
                    control={form.control}
                    name="fullPathProject"
                    label={t("fields.fullPathProject", { defaultValue: "Project File / Root Path" })}
                    placeholder="e.g. D:/Projects/MyGame/MyGame.uproject"
                    description="Absolute path to the project file on the selected agent machine."
                    isRequired
                />

                <FormInput
                    control={form.control}
                    name="engineVersion"
                    label={t("fields.engineVersion", { defaultValue: "Engine Version (Optional)" })}
                    placeholder="e.g. 5.4 or 4.2"
                />
            </FormGrid>
        </Form>
    );
}
