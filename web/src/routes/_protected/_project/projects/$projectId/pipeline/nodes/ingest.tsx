import { createFileRoute } from "@tanstack/react-router";
import { ScriptIngestionPage } from "@/features/pipelines/pages/ScriptIngestionPage";

export const Route = createFileRoute(
  "/_protected/_project/projects/$projectId/pipeline/nodes/ingest"
)({
  staticData: {
    breadcrumb: "Script Ingestion Studio",
  },
  component: ScriptIngestionRoute,
});

function ScriptIngestionRoute() {
  const { projectId } = Route.useParams();
  return <ScriptIngestionPage key={projectId} projectId={projectId} />;
}
