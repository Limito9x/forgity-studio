import { createFileRoute } from "@tanstack/react-router";
import { CreateCustomNodePage } from "@/features/pipelines/pages/CreateCustomNodePage";
import { useProject } from "@/features/projects/context/ProjectContext";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/pipeline/nodes/new"
)({
  staticData: {
    breadcrumb: "Create Custom Node",
  },
  component: CreateCustomNodeRoute,
});

function CreateCustomNodeRoute() {
  const { projectId } = useProject();
  return (
    <div className="page-container">
      <CreateCustomNodePage projectId={projectId} />
    </div>
  );
}
