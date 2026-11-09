import { useEffect, useState } from "react";
import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormSelect } from "@/components/form-controls";
import { createProjectSchema, type CreateProjectInput, type CreateProjectOutput } from "../schemas/createProjectSchema";
import { useTranslation } from "react-i18next";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { useStorageProfiles } from "@/features/storageProfiles/hooks/useStorageProfiles";
import { Sparkles, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export type StarterTemplateChoice = "empty" | "genesis9";

export interface CreateProjectFormSubmitData extends CreateProjectOutput {
    starterTemplate?: StarterTemplateChoice;
}

interface ProjectFormProps {
    onSubmit: (data: CreateProjectFormSubmitData) => void;
}

export function CreateProjectForm({ onSubmit }: ProjectFormProps) {
    const { t } = useTranslation("projects");
    const { studioId } = useCurrentStudio();
    const { data: storageProfiles = [] } = useStorageProfiles(studioId);
    const [selectedTemplate, setSelectedTemplate] = useState<StarterTemplateChoice>("genesis9");

    const form = useForm<CreateProjectInput, any, CreateProjectOutput>({
        resolver: zodResolver(createProjectSchema),
        defaultValues: {
            name: "",
            slug: "",
            storageProfileId: "",
        }
    });

    const nameValue = form.watch("name");
    const slugTouched = form.formState.touchedFields.slug;

    useEffect(() => {
        if (!slugTouched && nameValue) {
            form.setValue("slug", slugify(nameValue), { shouldValidate: true });
        }
    }, [nameValue, slugTouched, form]);

    const storageOptions = [
        { value: "", label: "Studio Default Profile (Inherited)" },
        ...storageProfiles.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.providerType === 0 ? "Studio Cloud" : "Custom S3"})${p.isDefault ? " [Default]" : ""}`,
        })),
    ];

    const handleSubmit = (values: CreateProjectOutput) => {
        onSubmit({
            ...values,
            starterTemplate: selectedTemplate,
        });
    };

    return (
        <Form form={form} formId={"create-project-form"} onSubmit={handleSubmit}>
            <FormGrid cols={1}>
                {/* 1-Click Starter Choice Radio Cards */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-foreground">
                        Starter Template
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <div
                            onClick={() => setSelectedTemplate("genesis9")}
                            className={cn(
                                "flex flex-col p-3 rounded-xl border cursor-pointer transition-all",
                                selectedTemplate === "genesis9"
                                    ? "bg-primary/5 border-primary/50 shadow-xs ring-1 ring-primary/40"
                                    : "bg-card hover:bg-muted/30 border-border/70"
                            )}
                        >
                            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
                                <Sparkles className="size-4 text-primary" />
                                <span>Genesis 9 Starter</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
                                Auto-imports Genesis 9 character schemas, modular wardrobe definitions, and repository triggers.
                            </p>
                            <div className="mt-2 text-[10px] font-semibold text-primary uppercase tracking-wider">
                                (Recommended)
                            </div>
                        </div>

                        <div
                            onClick={() => setSelectedTemplate("empty")}
                            className={cn(
                                "flex flex-col p-3 rounded-xl border cursor-pointer transition-all",
                                selectedTemplate === "empty"
                                    ? "bg-primary/5 border-primary/50 shadow-xs ring-1 ring-primary/40"
                                    : "bg-card hover:bg-muted/30 border-border/70"
                            )}
                        >
                            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
                                <FolderPlus className="size-4 text-muted-foreground" />
                                <span>Empty Project</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
                                Clean slate without preconfigured schemas or repositories. Perfect for custom architectures.
                            </p>
                        </div>
                    </div>
                </div>

                <FormInput
                    control={form.control}
                    label={t("fields.name", { defaultValue: "Name" })}
                    name="name"
                    type="text"
                    placeholder="e.g. Project Eva"
                />
                <FormInput
                    control={form.control}
                    label={t("fields.slug", { defaultValue: "Slug" })}
                    name="slug"
                    type="text"
                    placeholder="e.g. project-eva"
                    description="Unique URL identifier for the project within this studio."
                />
                <FormSelect
                    control={form.control}
                    label={t("fields.storageProfile", { defaultValue: "Storage Destination" })}
                    name="storageProfileId"
                    options={storageOptions}
                    description="Choose where this project stores 3D assets and files."
                />
            </FormGrid>
        </Form>
    );
}


