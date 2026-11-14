import { createFileRoute } from "@tanstack/react-router";
import { PipelineEditorPage } from "@/features/pipelines/pages/PipelineEditorPage";
import { useProject } from "@/features/projects/context/ProjectContext";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/pipeline/$pipelineId"
)({
  staticData: {
    breadcrumb: "Pipeline Editor",
  },
  component: PipelineEditorRoute,
});

function PipelineEditorRoute() {
  const { projectId } = useProject();
  const { pipelineId } = Route.useParams();
  return <PipelineEditorPage projectId={projectId} pipelineId={pipelineId} />;
}
