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

interface ContentTypePageProps extends ResourcePageProps {
    projectId: string;
}

export function ContentTypePage({ useSearch, useNavigate, projectId }: ContentTypePageProps) {
    const { t } = useTranslation("contentTypes");
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const openDialog = useDialogStore((state) => state.openDialog);

    const search = useSearch();
    const navigateResource = useNavigate();

    const resourceQuery = useResourceQuery(search, navigateResource);

    const { data, isLoading } = useContentTypes({
        ...search,
    }, projectId);

    const { table, columns } = useContentTypeTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
    });

    const canCreate = hasPermission("contenttypes:create");

    return (
        <ResourcePageShell
            title={t("page.title", { defaultValue: "Content Types" })}
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
