import { createFileRoute } from "@tanstack/react-router";
import { CreateCustomNodePage } from "@/features/pipelines/pages/CreateCustomNodePage";

export const Route = createFileRoute(
  "/_protected/_project/projects/$projectId/pipeline/nodes/new"
)({
  staticData: {
    breadcrumb: "Create Custom Node",
  },
  component: CreateCustomNodeRoute,
});

function CreateCustomNodeRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="page-container">
      <CreateCustomNodePage projectId={projectId} />
    </div>
  );
}
