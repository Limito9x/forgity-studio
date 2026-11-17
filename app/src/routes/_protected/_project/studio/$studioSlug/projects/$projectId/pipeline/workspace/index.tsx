import { createFileRoute } from "@tanstack/react-router";
import { useProject } from "@/features/projects/context/ProjectContext";
import { LocalWorkspacePage } from "@/features/pipelines/pages/LocalWorkspacePage";

export const Route = createFileRoute(
  "/_protected/_project/studio/$studioSlug/projects/$projectId/pipeline/workspace/"
)({
  staticData: {
    breadcrumb: "Local Workspace",
  },
  component: LocalWorkspaceRoute,
});

function LocalWorkspaceRoute() {
  const { projectId } = useProject();
  return <LocalWorkspacePage projectId={projectId} />;
}

