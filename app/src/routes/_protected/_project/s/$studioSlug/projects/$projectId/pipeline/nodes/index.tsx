import { createFileRoute } from "@tanstack/react-router";
import { NodeLibrary } from "@/features/pipelines/components/NodeLibrary";
import { useProject } from "@/features/projects/context/ProjectContext";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/pipeline/nodes/"
)({
  staticData: {
    breadcrumb: "Node Library",
  },
  component: NodeLibraryRoute,
});

function NodeLibraryRoute() {
  const { projectId } = useProject();
  return (
    <div className="page-container">
      <NodeLibrary projectId={projectId} />
    </div>
  );
}
