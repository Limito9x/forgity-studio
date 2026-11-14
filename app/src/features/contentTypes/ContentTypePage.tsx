import { ContentTypeTable } from "./components/ContentTypeTable";
import { useResourceQuery, type ResourcePageProps } from "@/lib/useResourceQuery";
import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { contentTypeFilterConfig } from "./components/contentTypeFilter";
import { useContentTypes } from "./hooks/useContentTypes";
import { useContentTypeTable } from "./hooks/useContentTypeTable";
import { useTranslation } from "react-i18next";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";

import { useDialogStore } from "@/stores/dialogStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Download, UploadCloud } from "lucide-react";
import { useExportContentTypes } from "./hooks/useContentTypesExportImport";
import { cn } from "@/lib/utils";

interface ContentTypePageProps extends ResourcePageProps {
    projectId: string;
}

export function ContentTypePage({ useSearch, useNavigate, projectId }: ContentTypePageProps) {
    const { t } = useTranslation("contentTypes");
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const openDialog = useDialogStore((state) => state.openDialog);
    const exportMutation = useExportContentTypes();

    const search = useSearch();
    const navigateResource = useNavigate();

    const resourceQuery = useResourceQuery(search, navigateResource);

    const { data, isLoading } = useContentTypes({
        ...search,
    }, projectId);

    const { table, columns, rowSelection, setRowSelection } = useContentTypeTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
    });

    const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    const selectedCount = selectedIds.length;

    const handleExport = () => {
        if (selectedCount > 0) {
            exportMutation.mutate(
                { projectId, ids: selectedIds.join(",") },
                {
                    onSuccess: () => setRowSelection({}),
                }
            );
        } else {
            exportMutation.mutate({ projectId });
        }
    };

    const canCreate = hasPermission("contenttypes:create");

    return (
        <ResourcePageShell
            title={t("page.title", { defaultValue: "Content Types" })}
            actions={
                <div className="flex items-center gap-1.5">
                    <Button
                        variant={selectedCount > 0 ? "default" : "outline"}
                        size="sm"
                        onClick={handleExport}
                        isDisabled={exportMutation.isPending || (data?.items?.length ?? 0) === 0}
                        className="gap-1.5"
                    >
                        <Download className={cn("size-3.5", exportMutation.isPending && "animate-spin")} />
                        <span>{selectedCount > 0 ? `Export Selected (${selectedCount})` : "Export All"}</span>
                    </Button>

                    {canCreate && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog("import-content-types", { projectId })}
                            className="gap-1.5"
                        >
                            <UploadCloud className="size-3.5" />
                            <span>Import</span>
                        </Button>
                    )}
                </div>
            }
            onAdd={canCreate ? () => openDialog("create-content-type", { projectId }) : undefined}
            addLabel={t("actions.create", { defaultValue: "Add Content Type" })}
            resource={resourceQuery}
            filterConfig={contentTypeFilterConfig}
            hideAdvancedFilters={true}
            searchPlaceholder={t("page.searchPlaceholder", { defaultValue: "Search content types..." })}
            renderViewOptions={<DataTableViewOptions table={table} />}
        >
            <ContentTypeTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </ResourcePageShell>
    );
}
