import { createFileRoute } from "@tanstack/react-router";
import { RepositoryDetailPage } from "@/features/repositories/pages/RepositoryDetailPage";
import { useProject } from "@/features/projects/context/ProjectContext";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/repositories/$repositoryId"
)({
  component: RepositoryDetailRouteComponent,
});

function RepositoryDetailRouteComponent() {
  const { projectId } = useProject();
  const { repositoryId } = Route.useParams();
  return <RepositoryDetailPage projectId={projectId} repositoryId={repositoryId} />;
}
