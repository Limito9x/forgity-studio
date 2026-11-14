import { createFileRoute } from "@tanstack/react-router";
import { AuditLogsPage } from "@/features/system/components/audit-logs/AuditLogsPage";
import { buildPagedSearchSchema } from "@/lib/schemas/pagedSearch.schema";
import { AUDIT_LOG_FILTERABLE_FIELDS } from "@/features/system/schemas/auditLogFilterableFields";

export const auditLogsRouteSearch = buildPagedSearchSchema(AUDIT_LOG_FILTERABLE_FIELDS);

export const Route = createFileRoute("/_protected/_layout/system/audit-logs/")({
    validateSearch: auditLogsRouteSearch,
    component: AuditLogPage,
});

function AuditLogPage() {
    return <AuditLogsPage useSearch={Route.useSearch} useNavigate={Route.useNavigate} />;
}