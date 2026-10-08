import { createFileRoute } from "@tanstack/react-router";
import { NodeLibrary } from "@/features/pipelines/components/NodeLibrary";

export const Route = createFileRoute(
  "/_protected/_project/projects/$projectId/pipeline/nodes/"
)({
  staticData: {
    breadcrumb: "Node Library",
  },
  component: NodeLibraryRoute,
});

function NodeLibraryRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="page-container">
      <NodeLibrary projectId={projectId} />
    </div>
  );
}
