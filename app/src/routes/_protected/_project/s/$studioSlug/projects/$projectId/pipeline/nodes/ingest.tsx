import { createFileRoute } from "@tanstack/react-router";
import { ScriptIngestionPage } from "@/features/pipelines/pages/ScriptIngestionPage";
import { useProject } from "@/features/projects/context/ProjectContext";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/pipeline/nodes/ingest"
)({
  staticData: {
    breadcrumb: "Script Ingestion Studio",
  },
  component: ScriptIngestionRoute,
});

function ScriptIngestionRoute() {
  const { projectId } = useProject();
  return <ScriptIngestionPage key={projectId} projectId={projectId} />;
}
