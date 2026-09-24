import { createFileRoute } from "@tanstack/react-router";
import { RepositoryDetailPage } from "@/features/repositories/pages/RepositoryDetailPage";

export const Route = createFileRoute(
  "/_protected/_project/projects/$projectId/repositories/$repositoryId"
)({
  component: RepositoryDetailRouteComponent,
});

function RepositoryDetailRouteComponent() {
  const { projectId, repositoryId } = Route.useParams();
  return <RepositoryDetailPage projectId={projectId} repositoryId={repositoryId} />;
}
