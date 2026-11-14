import { createFileRoute } from "@tanstack/react-router";
import { AuditLogDetailPage } from "@/features/system/components/audit-logs/AuditLogDetailPage";

export const Route = createFileRoute("/_protected/_layout/system/audit-logs/$id")({
    staticData: {
        breadcrumb: 'View Details',
    },
    component: AuditLogDetailPageWrapper,
});

function AuditLogDetailPageWrapper() {
    const { id } = Route.useParams();
    return <AuditLogDetailPage id={id} />;
}
