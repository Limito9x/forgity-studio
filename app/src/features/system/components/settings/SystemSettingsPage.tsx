import { SystemSettingTable } from "./SystemSettingTable";
import { useResourceQuery, type ResourcePageProps } from "@/lib/useResourceQuery";
import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { systemSettingFilterConfig } from "./systemSettingFilter";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import { useSystemSettingTable } from "../../hooks/useSystemSettingTable";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";

export function SystemSettingsPage({ useSearch, useNavigate }: ResourcePageProps) {
    const search = useSearch();
    const navigate = useNavigate();

    const resourceQuery = useResourceQuery(search, navigate);

    const { data, isLoading } = useSystemSettings(search);

    const { table, columns } = useSystemSettingTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
    });

    return (
        <ResourcePageShell
            title="System Settings"
            resource={resourceQuery}
            filterConfig={systemSettingFilterConfig}
            searchPlaceholder="Search by Key..."
            renderViewOptions={<DataTableViewOptions table={table} />}
        >
            <SystemSettingTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </ResourcePageShell>
    );
}
