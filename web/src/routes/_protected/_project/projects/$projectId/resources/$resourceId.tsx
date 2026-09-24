import { createFileRoute } from "@tanstack/react-router";
import { ResourceDetailPage } from "@/features/repositories/pages/ResourceDetailPage";
import { z } from "zod";

const resourceDetailSearchSchema = z.object({
    workspaceId: z.string().optional().default(""),
});

export const Route = createFileRoute(
    "/_protected/_project/projects/$projectId/resources/$resourceId"
)({
    validateSearch: resourceDetailSearchSchema,
    component: ResourceDetailRouteComponent,
});

function ResourceDetailRouteComponent() {
    const { projectId, resourceId } = Route.useParams();
    const { workspaceId } = Route.useSearch();

    return (
        <ResourceDetailPage
            projectId={projectId}
            workspaceId={workspaceId}
            resourceId={resourceId}
        />
    );
}
