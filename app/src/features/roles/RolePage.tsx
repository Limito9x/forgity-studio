import { useTranslation } from "react-i18next";
import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { RoleTable } from "./components/RoleTable";
import { roleFilterConfig } from "./components/roleFilter";
import { useDialogStore } from "@/stores/dialogStore";
import type { BaseSearchParams } from "@/lib/useResourceQuery";
import { useResourceQuery } from "@/lib/useResourceQuery";
import { useRoles } from "./hooks/useRoles";
import { useRoleTable } from "./hooks/useRoleTable";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";


export interface RolePageProps {
    useSearch: () => BaseSearchParams;
    useNavigate: () => (options: any) => void;
}

export function RolePage({ useSearch, useNavigate }: RolePageProps) {
    const { t } = useTranslation("role");
    const search = useSearch();
    const navigate = useNavigate();
    const resourceQuery = useResourceQuery(search, navigate);
    const { openDialog } = useDialogStore();

    const { data, isLoading } = useRoles(search as any);

    const { table, columns } = useRoleTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
    });

    return (
        <ResourcePageShell
            title={t("page.title", { defaultValue: "Role Management" })}
            onAdd={() => openDialog("create-role")}
            addLabel={t("actions.create", { defaultValue: "Add Role" })}
            resource={resourceQuery}
            filterConfig={roleFilterConfig}
            searchPlaceholder={t("page.searchPlaceholder", { defaultValue: "Search..." })}
            renderViewOptions={<DataTableViewOptions table={table} />}
        >
            <RoleTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </ResourcePageShell>
    );
}
