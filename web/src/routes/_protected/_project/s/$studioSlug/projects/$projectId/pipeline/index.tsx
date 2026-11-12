import { createFileRoute, redirect } from "@tanstack/react-router";
import { PipelineListPage } from "@/features/pipelines/pages/PipelineListPage";
import { useProject } from "@/features/projects/context/ProjectContext";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/pipeline/"
)({
  staticData: {
    breadcrumb: "Pipelines",
  },
  beforeLoad: ({ params }) => {
    // When running inside Tauri Desktop (Local First), automatically prioritize Local Workspace
    if (isTauriRuntime()) {
      throw redirect({
        to: "/s/$studioSlug/projects/$projectId/pipeline/workspace",
        params: {
          studioSlug: params.studioSlug,
          projectId: params.projectId,
        },
      });
    }
  },
  component: PipelineListRoute,
});

function PipelineListRoute() {
  const { projectId } = useProject();
  return <PipelineListPage projectId={projectId} />;
}
