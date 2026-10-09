import { useState } from "react";
import { ProjectTable } from "./components/ProjectTable";
import { ProjectCard } from "./components/ProjectCard";
import { useResourceQuery, type ResourcePageProps } from "@/lib/useResourceQuery";
import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { projectFilterConfig } from "./components/projectFilter";
import { useProjects } from "./hooks/useProjects";
import { useProjectTable } from "./hooks/useProjectTable";
import { useTranslation } from "react-i18next";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";
import { useDialogStore } from "@/stores/dialogStore";
import { useAuthStore } from "@/stores/authStore";
import { useStudioStore } from "@/stores/studioStore";
import { useStudios } from "@/features/studios/hooks/useStudios";
import { BaseCardGrid } from "@/components/custom-ui/data-display/card/BaseCardGrid";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";

export function ProjectPage({ useSearch, useNavigate }: ResourcePageProps) {
    const openDialog = useDialogStore((state) => state.openDialog);
    const { t } = useTranslation("projects");
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const activeStudioId = useStudioStore((state) => state.activeStudioId);
    const { data: studios = [] } = useStudios();
    const currentStudio = studios.find((s) => s.id === activeStudioId);

    const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

    const search = useSearch();
    const navigate = useNavigate();

    const resourceQuery = useResourceQuery(search, navigate);

    const { data, isLoading } = useProjects({
        ...(search as any),
        studioId: activeStudioId || undefined,
    });

    const { table, columns } = useProjectTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
        studioSlug: currentStudio?.slug,
    });

    const canCreate = hasPermission("projects:create");

    return (
        <ResourcePageShell
            title={t("page.title", { defaultValue: "Projects" })}
            onAdd={canCreate ? () => openDialog("create-project") : undefined}
            addLabel={t("actions.create", { defaultValue: "Add Project" })}
            resource={resourceQuery}
            filterConfig={projectFilterConfig}
            searchPlaceholder={t("page.searchPlaceholder", { defaultValue: "Search projects..." })}
            renderViewOptions={
                <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-md p-0.5 bg-muted/20">
                        <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-7 w-7"
                            onPress={() => setViewMode("grid")}
                            aria-label="Grid View"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === "table" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-7 w-7"
                            onPress={() => setViewMode("table")}
                            aria-label="Table View"
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                    {viewMode === "table" && <DataTableViewOptions table={table} />}
                </div>
            }
        >
            {viewMode === "grid" ? (
                <BaseCardGrid
                    table={table}
                    isLoading={isLoading}
                    renderCard={(item) => (
                        <ProjectCard
                            project={item}
                            studioSlug={currentStudio?.slug}
                        />
                    )}
                />
            ) : (
                <ProjectTable
                    table={table}
                    columns={columns}
                    isLoading={isLoading}
                />
            )}
        </ResourcePageShell>
    );
}

