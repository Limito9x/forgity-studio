import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { useResourceQuery, type ResourcePageProps } from "@/lib/useResourceQuery";
import { useAuditLogs } from "../../hooks/useAuditLogs";
import { useAuditLogTable } from "../../hooks/useAuditLogTable";
import { AuditLogTable } from "./AuditLogTable";
import { auditLogFilterConfig } from "./auditLogFilter";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";

export function AuditLogsPage({ useSearch, useNavigate }: ResourcePageProps) {

    const search = useSearch();
    const navigate = useNavigate();


    const resource = useResourceQuery(search, navigate);

    const { data, isLoading } = useAuditLogs(search);

    const { table, columns } = useAuditLogTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resource,
    });


    return (
        <ResourcePageShell
            title="Audit Logs"
            resource={resource}
            filterConfig={auditLogFilterConfig}
            searchPlaceholder="Search audit logs..."
            renderViewOptions={<DataTableViewOptions table={table} />}
        >
            <AuditLogTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </ResourcePageShell>
    );
}
