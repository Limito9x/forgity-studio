import { ProjectTable } from "./components/ProjectTable";
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

export function ProjectPage({ useSearch, useNavigate }: ResourcePageProps) {
    const openDialog = useDialogStore((state) => state.openDialog);
    const { t } = useTranslation("projects");
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const activeStudioId = useStudioStore((state) => state.activeStudioId);

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
    });

    const canCreate = hasPermission("projects:create");

    return (
        <ResourcePageShell
            title={t("page.title", { defaultValue: "Project Management" })}
            onAdd={canCreate ? () => openDialog("create-project") : undefined}
            addLabel={t("actions.create", { defaultValue: "Add Project" })}
            resource={resourceQuery}
            filterConfig={projectFilterConfig}
            searchPlaceholder={t("page.searchPlaceholder", { defaultValue: "Search projects..." })}
            renderViewOptions={<DataTableViewOptions table={table} />}
        >
            <ProjectTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </ResourcePageShell>
    );
}
