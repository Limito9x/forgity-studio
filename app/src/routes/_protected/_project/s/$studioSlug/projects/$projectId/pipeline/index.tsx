import { createFileRoute } from "@tanstack/react-router";
import { PipelineListPage } from "@/features/pipelines/pages/PipelineListPage";
import { useProject } from "@/features/projects/context/ProjectContext";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/pipeline/"
)({
  staticData: {
    breadcrumb: "Pipelines",
  },
  component: PipelineListRoute,
});

function PipelineListRoute() {
  const { projectId } = useProject();
  return <PipelineListPage projectId={projectId} />;
}
