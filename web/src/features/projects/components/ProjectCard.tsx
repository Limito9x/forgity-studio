import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Folder, EditIcon, TrashIcon, ArrowRight } from "lucide-react";
import { BaseCard } from "@/components/custom-ui/data-display/card/BaseCard";
import { DataTableRowActions, type ActionItem } from "@/components/table/DataTableRowActions";
import { useDialogStore } from "@/stores/dialogStore";
import { useAuthStore } from "@/stores/authStore";
import type { ProjectDto } from "@/gen/model";

interface ProjectCardProps {
    project: ProjectDto;
    studioSlug?: string;
}

export function ProjectCard({ project, studioSlug }: ProjectCardProps) {
    const { t } = useTranslation(["projects", "common"]);
    const navigate = useNavigate();
    const openDialog = useDialogStore((state) => state.openDialog);
    const hasPermission = useAuthStore((state) => state.hasPermission);

    const projectTarget = studioSlug
        ? `/s/${studioSlug}/projects/${project.slug || project.id}/pipeline`
        : `/projects/${project.id}/pipeline`;

    const handleCardClick = () => {
        navigate({ to: projectTarget as any });
    };

    const actions = [
        hasPermission("projects:update") && {
            label: t("common:edit", { defaultValue: "Edit" }),
            icon: EditIcon,
            onClick: () => openDialog("update-project", { id: project.id! }),
        },
        hasPermission("projects:delete") && {
            label: t("common:delete", { defaultValue: "Delete" }),
            icon: TrashIcon,
            onClick: () => openDialog("delete-project", { id: project.id! }),
            destructive: true,
            separatorBefore: true,
        },
    ].filter(Boolean) as ActionItem[];

    return (
        <BaseCard
            title={project.name}
            icon={Folder}
            onClick={handleCardClick}
            action={actions.length > 0 ? <DataTableRowActions actions={actions} /> : undefined}
            footer={
                <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">Open Pipelines</span>
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 text-primary/70" />
                </div>
            }
        >
            <div className="flex flex-wrap items-center gap-2 mt-1">
                {project.slug && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-muted/80 text-muted-foreground border border-border/50">
                        @{project.slug}
                    </span>
                )}
            </div>
        </BaseCard>
    );
}
